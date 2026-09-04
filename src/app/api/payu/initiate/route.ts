import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateHash, PAYU_MERCHANT_KEY, PAYU_URL, assertPayUConfigured } from "@/lib/payu";
import { randomBytes, randomInt } from "crypto";
import { requireApiUser } from "@/lib/auth";
import {
  BOOKING_POLICY,
  calculatePrice,
  formatRupees,
  normalizeBookingDate,
  sessionStart,
  validateSlots,
} from "@/lib/booking-policy";
import { sendOrderConfirmation } from "@/lib/mail";
import { syncBookingToGoogleCalendar } from "@/lib/google-calendar";

type BookingSession = { date: Date; slots: string[] };

const MAX_SESSIONS_PER_CHECKOUT = 30;
const TICKET_CHARACTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function nextTicketNumber() {
  const code = Array.from(
    { length: 5 },
    () => TICKET_CHARACTERS[randomInt(TICKET_CHARACTERS.length)],
  ).join("");
  return `E-${code}`;
}

function parseSessions(body: Record<string, unknown>): BookingSession[] {
  // Keep the original single-session request shape working for any checkout
  // page a customer might still have open during deployment.
  const rawSessions = Array.isArray(body.sessions)
    ? body.sessions
    : [{ date: body.date, slots: body.slots }];
  if (!rawSessions.length || rawSessions.length > MAX_SESSIONS_PER_CHECKOUT) {
    throw new Error(`Choose between 1 and ${MAX_SESSIONS_PER_CHECKOUT} sessions.`);
  }

  const byDate = new Map<string, BookingSession>();
  for (const raw of rawSessions) {
    if (!raw || typeof raw !== "object") throw new Error("One or more sessions are invalid.");
    const value = raw as Record<string, unknown>;
    const date = normalizeBookingDate(value.date);
    const slots = validateSlots(value.slots);
    if (sessionStart(date, slots) <= new Date()) {
      throw new Error("Please select future time slots.");
    }
    const key = date.toISOString();
    const existing = byDate.get(key);
    if (existing) {
      existing.slots = validateSlots([...existing.slots, ...slots]);
    } else {
      byDate.set(key, { date, slots });
    }
  }

  const sessions = [...byDate.values()].sort((a, b) => a.date.getTime() - b.date.getTime());
  const totalHours = sessions.reduce((sum, session) => sum + session.slots.length, 0);
  if (totalHours > 120) throw new Error("A checkout can include up to 120 hours.");
  return sessions;
}

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  try {
    const body = await req.json() as Record<string, unknown>;
    const attendees = Number(body.attendees);
    const sessions = parseSessions(body);
    const bandName = String(body.bandName || "").trim().slice(0, 120);
    const equipmentRequests = String(body.equipmentRequests || "").trim().slice(0, 2000) || null;
    if (!bandName) return NextResponse.json({ error: "Band or artist name is required." }, { status: 400 });

    const totalHours = sessions.reduce((sum, session) => sum + session.slots.length, 0);
    const price = calculatePrice(attendees, totalHours);
    const totalAmount = formatRupees(price.totalPaise);
    const txnid = `ELF${Date.now()}${randomBytes(4).toString("hex").slice(0, 5)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + BOOKING_POLICY.pendingHoldMinutes * 60 * 1000);
    const phone = String(auth.user.user_metadata?.phone || "").trim().slice(0, 30) || null;
    const name = String(auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || "").trim().slice(0, 120) || null;

    // Apply earned free hours to the final session(s), so the per-session
    // amounts still sum exactly to the one PayU payment total.
    let remainingBillableHours = price.billableHours;
    const sessionAmounts = sessions.map((session) => {
      const billableHours = Math.min(session.slots.length, remainingBillableHours);
      remainingBillableHours -= billableHours;
      return formatRupees(billableHours * price.pricePerHourPaise);
    });

    const order = await prisma.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: { status: "PENDING", expiresAt: { lt: now } },
        data: { status: "CANCELLED", paymentStatus: "EXPIRED", cancelledAt: now, cancelledBy: "SYSTEM" },
      });
      await tx.bookingOrder.updateMany({
        where: { status: "PENDING", expiresAt: { lt: now } },
        data: { status: "CANCELLED", paymentStatus: "EXPIRED", cancelledAt: now, cancelledBy: "SYSTEM" },
      });

      for (const session of sessions) {
        const conflict = await tx.booking.findFirst({
          where: {
            date: session.date,
            OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: now } }],
            slots: { hasSome: session.slots },
          },
          select: { id: true },
        });
        if (conflict) throw new Error("One or more selected slots were just booked. Please choose again.");
        const blockConflict = await tx.calendarBlock.findFirst({
          where: { date: session.date, slots: { hasSome: session.slots } },
          select: { id: true },
        });
        if (blockConflict) throw new Error("One or more selected slots are unavailable. Please choose again.");
      }

      await tx.user.upsert({
        where: { id: auth.user.id },
        create: { id: auth.user.id, email: auth.user.email || null, name, phone },
        update: { email: auth.user.email || undefined, name: name || undefined, phone: phone || undefined },
      });

      return tx.bookingOrder.create({
        data: {
          userId: auth.user.id,
          attendees,
          bandName,
          equipmentRequests,
          totalAmount,
          totalHours,
          freeHours: price.freeHours,
          status: "PENDING",
          paymentStatus: "PENDING",
          payuTxnId: txnid,
          expiresAt,
          bookings: {
            create: sessions.map((session, index) => ({
              userId: auth.user.id,
              attendees,
              date: session.date,
              originalDate: session.date,
              slots: session.slots,
              equipmentRequests,
              ticketNumber: nextTicketNumber(),
              bandName,
              totalAmount: sessionAmounts[index],
              status: "PENDING",
              paymentStatus: "PENDING",
              expiresAt,
            })),
          },
        },
        include: { bookings: { include: { user: true } }, user: true },
      });
    }, { isolationLevel: "Serializable" });

    const allowDevStub = process.env.NODE_ENV !== "production" && process.env.PAYMENTS_DEV_STUB === "true";
    if (allowDevStub) {
      const confirmed = await prisma.$transaction(async (tx) => {
        await tx.bookingOrder.update({
          where: { id: order.id },
          data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null },
        });
        await tx.booking.updateMany({
          where: { orderId: order.id },
          data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null },
        });
        return tx.bookingOrder.findUniqueOrThrow({
          where: { id: order.id }, include: { bookings: { include: { user: true } }, user: true },
        });
      });
      const effects: Promise<unknown>[] = confirmed.bookings.map(syncBookingToGoogleCalendar);
      if (confirmed.user.email) effects.push(sendOrderConfirmation(confirmed, confirmed.bookings, confirmed.user.email));
      await Promise.allSettled(effects);
      return NextResponse.json({ url: `/booking/success?txnid=${txnid}`, params: {} });
    }

    assertPayUConfigured();
    const envSiteUrl = process.env.SITE_URL ? (process.env.SITE_URL.startsWith("http") ? process.env.SITE_URL : `https://${process.env.SITE_URL}`) : null;
    const siteUrl = (envSiteUrl || new URL(req.url).origin).replace(/\/$/, "");
    const payuData: Record<string, string> = {
      key: PAYU_MERCHANT_KEY,
      txnid,
      amount: totalAmount.toFixed(2),
      productinfo: `Elf Jampad ${sessions.length > 1 ? "Multi-session" : "Session"} Booking`,
      firstname: name?.split(" ")[0] || "Musician",
      email: auth.user.email || "",
      phone: phone || "0000000000",
      udf1: order.id,
      udf2: "", udf3: "", udf4: "", udf5: "",
      surl: `${siteUrl}/api/payu/callback`,
      furl: `${siteUrl}/api/payu/callback`,
    };
    return NextResponse.json({
      url: PAYU_URL,
      params: { ...payuData, hash: generateHash(payuData) },
    });
  } catch (error) {
    console.error("PayU initiate error:", error);
    const message = error instanceof Error ? error.message : "Unable to start payment.";
    const status = message.includes("just booked") || message.includes("required") || message.includes("must") || message.includes("invalid") || message.includes("unavailable") || message.includes("future") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
