import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiAdmin } from "@/lib/auth";
import { BOOKING_POLICY, normalizeBookingDate, sessionStart, validateSlots } from "@/lib/booking-policy";
import { syncCalendarBlockToGoogleCalendar } from "@/lib/google-calendar";

export const dynamic = "force-dynamic";

const FULL_DAY_SLOTS = Array.from(
  { length: BOOKING_POLICY.closingHour - BOOKING_POLICY.openingHour },
  (_, index) => String(BOOKING_POLICY.openingHour + index),
);

export async function POST(req: Request) {
  const auth = await requireApiAdmin();
  if (!auth.user) return auth.response;

  try {
    const body = await req.json();
    const date = normalizeBookingDate(body.date);
    const wholeDay = body.wholeDay === true;
    const slots = wholeDay ? FULL_DAY_SLOTS : validateSlots(body.slots);
    const note = String(body.note || "").trim().slice(0, 500) || (wholeDay ? "Holiday" : null);
    if (sessionStart(date, slots) <= new Date()) {
      return NextResponse.json({ error: "Choose a future time slot to block." }, { status: 400 });
    }

    const block = await prisma.$transaction(async (tx) => {
      const bookingConflict = await tx.booking.findFirst({
        where: {
          date,
          slots: { hasSome: slots },
          OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: new Date() } }],
        },
        select: { id: true },
      });
      if (bookingConflict) throw new Error("One or more selected slots already have a booking.");

      const blockConflict = await tx.calendarBlock.findFirst({
        where: { date, slots: { hasSome: slots } },
        select: { id: true },
      });
      if (blockConflict) throw new Error("One or more selected slots are already blocked.");

      return tx.calendarBlock.create({
        data: { date, slots, note, createdBy: auth.user.email || auth.user.id },
      });
    }, { isolationLevel: "Serializable" });

    const calendar = await syncCalendarBlockToGoogleCalendar(block).catch((error) => ({
      synced: false,
      reason: error instanceof Error ? error.message : "Google Calendar sync failed.",
    }));
    return NextResponse.json({ block, calendar }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to block the selected slots.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
