import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/auth";
import { normalizeBookingDate, sessionStart, validateSlots } from "@/lib/booking-policy";
import { sendBookingChangeNotification } from "@/lib/mail";
import { syncBookingToGoogleCalendar } from "@/lib/google-calendar";

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

    if (action === "CANCEL") {
      if (booking.status === "CANCELLED") return NextResponse.json({ error: "Booking is already cancelled." }, { status: 409 });
      const updated = await prisma.$transaction(async (tx) => {
        const changed = await tx.booking.update({
          where: { id: booking.id },
          data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: auth.user.email || auth.user.id, cancellationReason: reason },
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
            adminNote: "Cancelled directly by an administrator.",
          },
        });
        return changed;
      });
      if (booking.user.email) await sendBookingChangeNotification({ ...booking, ...updated }, booking.user.email, "CANCELLED").catch(console.error);
      await syncBookingToGoogleCalendar({ ...booking, ...updated }).catch((error) => console.error("Google Calendar cancellation sync failed:", error));
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
