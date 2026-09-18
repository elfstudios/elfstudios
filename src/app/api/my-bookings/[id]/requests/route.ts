import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiUser } from "@/lib/auth";
import {
  canRequestCancellation,
  canRequestReschedule,
  normalizeBookingDate,
  validateRescheduleTarget,
  validateSlots,
} from "@/lib/booking-policy";
import { sendBookingChangeNotification } from "@/lib/mail";
import { syncBookingToGoogleCalendar } from "@/lib/google-calendar";
import { creditCancelledBookingToWallet } from "@/lib/wallet";

export async function POST(req: Request, { params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = await paramsPromise;
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  try {
    const body = await req.json();
    const type = String(body.type || "").toUpperCase();
    if (type !== "RESCHEDULE" && type !== "CANCEL") {
      return NextResponse.json({ error: "Invalid booking request." }, { status: 400 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: params.id, userId: auth.user.id },
      include: { user: true },
    });
    if (!booking) return NextResponse.json({ error: "Booking not found." }, { status: 404 });
    if (booking.status !== "CONFIRMED") {
      return NextResponse.json({ error: "Only confirmed bookings can be changed." }, { status: 409 });
    }
    const reason = String(body.reason || "").trim().slice(0, 1000) || null;
    const policy = type === "CANCEL"
      ? canRequestCancellation(booking.date, booking.slots)
      : canRequestReschedule(booking.date, booking.slots);
    if (!policy.allowed) {
      return NextResponse.json({ error: `${type === "CANCEL" ? "Cancellation" : "Rescheduling"} closes 48 hours before the session.` }, { status: 400 });
    }

    if (type === "CANCEL") {
      const credit = Math.round(booking.totalAmount);
      const updated = await prisma.$transaction(async (tx) => {
        await creditCancelledBookingToWallet(tx, booking.userId, booking.id, credit);
        const changed = await tx.booking.update({
          where: { id: booking.id },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            cancelledBy: auth.user.id,
            cancellationReason: reason,
            cancellationCreditCoins: credit,
          },
        });
        await tx.bookingChangeRequest.create({
          data: {
            bookingId: booking.id,
            requestedById: auth.user.id,
            type,
            status: "APPROVED",
            reason,
            requestedSlots: [],
            resolvedBy: auth.user.id,
            resolvedAt: new Date(),
            adminNote: "Cancelled by the customer. The paid value was moved to ElfCoins automatically.",
          },
        });
        return changed;
      }, { isolationLevel: "Serializable" });
      if (booking.user.email) await sendBookingChangeNotification({ ...booking, ...updated }, booking.user.email, "CANCELLED", credit).catch(console.error);
      await syncBookingToGoogleCalendar({ ...booking, ...updated }).catch((error) => console.error("Google Calendar cancellation sync failed:", error));
      return NextResponse.json({ booking: updated, credit }, { status: 200 });
    }
    const requestedDate = normalizeBookingDate(body.requestedDate);
    const requestedSlots = validateSlots(body.requestedSlots);
    if (requestedSlots.length !== booking.slots.length) {
      return NextResponse.json({ error: `Choose exactly ${booking.slots.length} hour(s), matching the original booking.` }, { status: 400 });
    }
    validateRescheduleTarget(booking.originalDate, requestedDate, requestedSlots);

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
      if (conflict) throw new Error("One or more requested slots are unavailable.");
      const blockConflict = await tx.calendarBlock.findFirst({
        where: { date: requestedDate, slots: { hasSome: requestedSlots } },
        select: { id: true },
      });
      if (blockConflict) throw new Error("One or more requested slots are unavailable.");

      const changed = await tx.booking.update({
        where: { id: booking.id },
        data: { date: requestedDate, slots: requestedSlots },
      });
      await tx.bookingChangeRequest.create({
        data: {
          bookingId: booking.id,
          requestedById: auth.user.id,
          type,
          status: "APPROVED",
          reason,
          requestedDate,
          requestedSlots,
          resolvedBy: auth.user.id,
          resolvedAt: new Date(),
          adminNote: "Automatically applied under the customer rescheduling policy.",
        },
      });
      return changed;
    }, { isolationLevel: "Serializable" });
    if (booking.user.email) {
      await sendBookingChangeNotification({ ...booking, ...updated }, booking.user.email, "RESCHEDULED").catch(console.error);
    }
    await syncBookingToGoogleCalendar({ ...booking, ...updated }).catch((error) => console.error("Google Calendar reschedule sync failed:", error));
    return NextResponse.json({ booking: updated }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to submit request.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
