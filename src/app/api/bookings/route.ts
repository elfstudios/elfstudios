import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeBookingDate } from "@/lib/booking-policy";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const dateStr = new URL(req.url).searchParams.get("date");
  if (!dateStr) return NextResponse.json({ error: "Date is required" }, { status: 400 });

  try {
    const targetDate = normalizeBookingDate(dateStr);
    const now = new Date();
    await prisma.booking.updateMany({
      where: { status: "PENDING", expiresAt: { lt: now } },
      data: { status: "CANCELLED", paymentStatus: "EXPIRED", cancelledAt: now, cancelledBy: "SYSTEM" },
    });

    const [bookings, blocks] = await Promise.all([
      prisma.booking.findMany({
        where: {
          date: targetDate,
          OR: [
            { status: "CONFIRMED" },
            { status: "PENDING", expiresAt: { gt: now } },
          ],
        },
        select: { id: true, slots: true, bandName: true },
      }),
      prisma.calendarBlock.findMany({
        where: { date: targetDate },
        select: { id: true, slots: true, note: true },
      }),
    ]);
    return NextResponse.json({
      bookings: [
        ...bookings,
        ...blocks.map((block) => ({
          id: `block-${block.id}`,
          slots: block.slots,
          bandName: block.note || "Studio unavailable",
          isManualBlock: true,
        })),
      ],
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load bookings.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
