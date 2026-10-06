import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/auth";
import { calculatePrice, formatRupees, normalizeBookingDate, sessionStart, validateSlots } from "@/lib/booking-policy";
import { sendBookingChangeNotification } from "@/lib/mail";
import { syncBookingToGoogleCalendar } from "@/lib/google-calendar";
import { creditCancelledBookingToWallet, refundBookingWalletCoins, spendWalletCoins } from "@/lib/wallet";
import { cancelPendingBookingOrder } from "@/lib/booking-payment";
import { verifyPaymentWithPayU } from "@/lib/payu";
import { sendBookingConfirmation, sendOrderConfirmation } from "@/lib/mail";

export async function PATCH(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = await requireApiAdmin();
  if (!auth.user) return auth.response;

  try {
    const body = await req.json();
    const action = String(body.action || "").toUpperCase();
    const reason = String(body.reason || "").trim().slice(0, 1000) || null;
    const booking = await prisma.booking.findUnique({ where: { id: params.id }, include: { user: true } });
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });

    if (action === "RECONCILE") {
      if (booking.status !== "PENDING") return NextResponse.json({ error: "Only pending bookings can be reconciled." }, { status: 409 });

      if (booking.orderId) {
        const order = await prisma.bookingOrder.findUnique({
          where: { id: booking.orderId },
          include: { bookings: { include: { user: true } }, user: true },
        });
        if (!order || order.status !== "PENDING" || !order.payuTxnId) {
          return NextResponse.json({ error: "This checkout is not awaiting a PayU payment." }, { status: 409 });
        }
        const paid = await verifyPaymentWithPayU(order.payuTxnId, Number(order.totalAmount).toFixed(2));
        if (!paid) return NextResponse.json({ error: "PayU has not confirmed this payment yet. The booking remains pending." }, { status: 409 });

        const confirmed = await prisma.$transaction(async (tx) => {
          const changed = await tx.bookingOrder.updateMany({
            where: { id: order.id, status: "PENDING" },
            data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null },
          });
          if (!changed.count) throw new Error("This booking is no longer pending.");
          await tx.booking.updateMany({
            where: { orderId: order.id, status: "PENDING" },
            data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null },
          });
          return tx.bookingOrder.findUniqueOrThrow({ where: { id: order.id }, include: { bookings: { include: { user: true } }, user: true } });
        }, { isolationLevel: "Serializable" });
        const effects: Promise<unknown>[] = confirmed.bookings.map(syncBookingToGoogleCalendar);
        if (confirmed.user.email) effects.push(sendOrderConfirmation(confirmed, confirmed.bookings, confirmed.user.email));
        await Promise.allSettled(effects);
        return NextResponse.json({ booking: confirmed.bookings.find((item) => item.id === booking.id), reconciled: true });
      }

      if (!booking.payuTxnId) return NextResponse.json({ error: "This booking is not awaiting a PayU payment." }, { status: 409 });
      const paid = await verifyPaymentWithPayU(booking.payuTxnId, Number(booking.totalAmount).toFixed(2));
      if (!paid) return NextResponse.json({ error: "PayU has not confirmed this payment yet. The booking remains pending." }, { status: 409 });
      const changed = await prisma.booking.updateMany({
        where: { id: booking.id, status: "PENDING" },
        data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null },
      });
      if (!changed.count) return NextResponse.json({ error: "This booking is no longer pending." }, { status: 409 });
      const confirmed = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id }, include: { user: true } });
      const effects: Promise<unknown>[] = [syncBookingToGoogleCalendar(confirmed)];
      if (confirmed.user.email) effects.push(sendBookingConfirmation(confirmed, confirmed.user.email));
      await Promise.allSettled(effects);
      return NextResponse.json({ booking: confirmed, reconciled: true });
    }

    if (action === "CANCEL_PENDING") {
      if (booking.status !== "PENDING") return NextResponse.json({ error: "Only pending bookings can be cancelled this way." }, { status: 409 });
      if (booking.orderId) {
        await cancelPendingBookingOrder(booking.orderId, auth.user.email || auth.user.id);
      } else {
        await prisma.booking.updateMany({
          where: { id: booking.id, status: "PENDING" },
          data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date(), cancelledBy: auth.user.email || auth.user.id, cancellationReason: reason },
        });
      }
      return NextResponse.json({ cancelled: true });
    }

    if (action === "CANCEL") {
      if (booking.status !== "CONFIRMED") return NextResponse.json({ error: "Only confirmed bookings can be cancelled to ElfCoins." }, { status: 409 });
      const credit = Math.round(booking.totalAmount);
      const updated = await prisma.$transaction(async (tx) => {
        await creditCancelledBookingToWallet(tx, booking.userId, booking.id, credit);
        const changed = await tx.booking.update({
          where: { id: booking.id },
          data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: auth.user.email || auth.user.id, cancellationReason: reason, cancellationCreditCoins: credit },
        });
        await tx.bookingChangeRequest.create({
          data: {
            bookingId: booking.id,
            requestedById: auth.user.id,
            type: "CANCEL",
            status: "APPROVED",
            reason,
            requestedSlots: [],
            resolvedBy: auth.user.email || auth.user.id,
            resolvedAt: new Date(),
            adminNote: "Cancelled directly by an administrator. The paid value was moved to ElfCoins.",
          },
        });
        return changed;
      });
      if (booking.user.email) await sendBookingChangeNotification({ ...booking, ...updated }, booking.user.email, "CANCELLED", credit).catch(console.error);
      await syncBookingToGoogleCalendar({ ...booking, ...updated }).catch((error) => console.error("Google Calendar cancellation sync failed:", error));
      return NextResponse.json({ booking: updated });
    }

    if (action === "EDIT") {
      if (booking.status !== "CONFIRMED") return NextResponse.json({ error: "Only confirmed bookings can be edited." }, { status: 409 });
      const attendees = Number(body.attendees ?? booking.attendees);
      const requestedDate = body.requestedDate ? normalizeBookingDate(body.requestedDate) : booking.date;
      const requestedSlots = body.requestedSlots ? validateSlots(body.requestedSlots) : booking.slots;
      if (sessionStart(requestedDate, requestedSlots) <= new Date()) throw new Error("The session time must be in the future.");
      const bandName = String(body.bandName ?? booking.bandName ?? "").trim().slice(0, 120);
      const bookingName = String(body.bookingName ?? booking.bookingName ?? "").trim().slice(0, 120);
      if (!bandName || !bookingName) throw new Error("Booking name and artist name are required.");
      const totalAmount = formatRupees(calculatePrice(attendees, requestedSlots.length).totalPaise);
      const walletCoins = booking.paymentMethod === "WALLET" ? Math.round(totalAmount) : booking.walletCoins;
      const updated = await prisma.$transaction(async (tx) => {
        const conflict = await tx.booking.findFirst({ where: { id: { not: booking.id }, date: requestedDate, slots: { hasSome: requestedSlots }, OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: new Date() } }] }, select: { id: true } });
        if (conflict) throw new Error("One or more selected slots are unavailable.");
        const blocked = await tx.calendarBlock.findFirst({ where: { date: requestedDate, slots: { hasSome: requestedSlots } }, select: { id: true } });
        if (blocked) throw new Error("One or more selected slots are manually blocked.");
        if (booking.paymentMethod === "WALLET") {
          const difference = walletCoins - booking.walletCoins;
          if (difference > 0) await spendWalletCoins(tx, booking.userId, difference, booking.id);
          if (difference < 0) await refundBookingWalletCoins(tx, booking.id, -difference);
          if (booking.orderId && difference) await tx.bookingOrder.update({ where: { id: booking.orderId }, data: { totalAmount: { increment: difference } } });
        }
        const changed = await tx.booking.update({ where: { id: booking.id }, data: { attendees, date: requestedDate, slots: requestedSlots, bandName, bookingName, equipmentRequests: String(body.equipmentRequests ?? booking.equipmentRequests ?? "").trim().slice(0, 2000) || null, totalAmount, walletCoins } });
        await tx.bookingChangeRequest.create({ data: { bookingId: booking.id, requestedById: auth.user.id, type: "EDIT", status: "APPROVED", reason, requestedDate, requestedSlots, resolvedBy: auth.user.email || auth.user.id, resolvedAt: new Date(), adminNote: "Booking edited directly by an administrator." } });
        return changed;
      }, { isolationLevel: "Serializable" });
      await syncBookingToGoogleCalendar({ ...booking, ...updated }).catch((error) => console.error("Google Calendar edit sync failed:", error));
      return NextResponse.json({ booking: updated });
    }

    if (action === "RESCHEDULE") {
      if (booking.status !== "CONFIRMED") return NextResponse.json({ error: "Only confirmed bookings can be rescheduled." }, { status: 409 });
      const requestedDate = normalizeBookingDate(body.requestedDate);
      const requestedSlots = validateSlots(body.requestedSlots);
      if (requestedSlots.length !== booking.slots.length) {
        return NextResponse.json({ error: `Choose exactly ${booking.slots.length} hour(s).` }, { status: 400 });
      }
      // Admins can move a booking farther than seven days, but never into the past.
      if (sessionStart(requestedDate, requestedSlots) <= new Date()) throw new Error("The new session time must be in the future.");

      const updated = await prisma.$transaction(async (tx) => {
        const conflict = await tx.booking.findFirst({
          where: {
            id: { not: booking.id },
            date: requestedDate,
            slots: { hasSome: requestedSlots },
            OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: new Date() } }],
          },
          select: { id: true },
        });
      if (conflict) throw new Error("One or more selected slots are unavailable.");
      const blockConflict = await tx.calendarBlock.findFirst({
        where: { date: requestedDate, slots: { hasSome: requestedSlots } },
        select: { id: true },
      });
      if (blockConflict) throw new Error("One or more selected slots are manually blocked.");
      const changed = await tx.booking.update({ where: { id: booking.id }, data: { date: requestedDate, slots: requestedSlots } });
        await tx.bookingChangeRequest.create({
          data: {
            bookingId: booking.id,
            requestedById: auth.user.id,
            type: "RESCHEDULE",
            status: "APPROVED",
            reason,
            requestedDate,
            requestedSlots,
            resolvedBy: auth.user.email || auth.user.id,
            resolvedAt: new Date(),
            adminNote: "Rescheduled directly by an administrator.",
          },
        });
        return changed;
      }, { isolationLevel: "Serializable" });
      if (booking.user.email) await sendBookingChangeNotification({ ...booking, ...updated }, booking.user.email, "RESCHEDULED").catch(console.error);
      await syncBookingToGoogleCalendar({ ...booking, ...updated }).catch((error) => console.error("Google Calendar reschedule sync failed:", error));
      return NextResponse.json({ booking: updated });
    }

    return NextResponse.json({ error: "Invalid admin action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update booking.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = await requireApiAdmin();
  if (!auth.user) return auth.response;
  const booking = await prisma.booking.findUnique({ where: { id: params.id } });
  if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
  if (booking.status !== "CANCELLED") return NextResponse.json({ error: "Only cancelled bookings can be permanently deleted." }, { status: 409 });
  await prisma.booking.delete({ where: { id: booking.id } });
  return NextResponse.json({ deleted: true });
}
