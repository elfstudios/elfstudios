import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { generateHash, PAYU_MERCHANT_KEY, PAYU_URL, assertPayUConfigured } from "@/lib/payu";
import { randomBytes, randomInt } from "crypto";
import { requireApiUser } from "@/lib/auth";
import { BOOKING_POLICY, calculatePrice, formatRupees, normalizeBookingDate, sessionStart, validateSlots } from "@/lib/booking-policy";
import { sendBookingConfirmation } from "@/lib/mail";

export async function POST(req: Request) {
  const auth = await requireApiUser();
  if (!auth.user) return auth.response;

  try {
    const body = await req.json();
    const attendees = Number(body.attendees);
    const slots = validateSlots(body.slots);
    const date = normalizeBookingDate(body.date);
    const bandName = String(body.bandName || "").trim().slice(0, 120);
    const equipmentRequests = String(body.equipmentRequests || "").trim().slice(0, 2000) || null;
    if (!bandName) return NextResponse.json({ error: "Band or artist name is required." }, { status: 400 });
    if (sessionStart(date, slots) <= new Date()) {
      return NextResponse.json({ error: "Please select a future time slot." }, { status: 400 });
    }

    const price = calculatePrice(attendees, slots.length);
    const totalAmount = formatRupees(price.totalPaise);
    const txnid = `ELF${Date.now()}${randomBytes(4).toString("hex").slice(0, 5)}`;
    const ticketCharacters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const ticketCode = Array.from(
      { length: 5 },
      () => ticketCharacters[randomInt(ticketCharacters.length)],
    ).join("");
    const ticketNumber = `E-${ticketCode}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + BOOKING_POLICY.pendingHoldMinutes * 60 * 1000);
    const phone = String(auth.user.user_metadata?.phone || "").trim().slice(0, 30) || null;
    const name = String(auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || "").trim().slice(0, 120) || null;

    const booking = await prisma.$transaction(async (tx) => {
      await tx.booking.updateMany({
        where: { status: "PENDING", expiresAt: { lt: now } },
        data: { status: "CANCELLED", paymentStatus: "EXPIRED", cancelledAt: now, cancelledBy: "SYSTEM" },
      });
      const conflicts = await tx.booking.findMany({
        where: {
          date,
          OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: now } }],
          slots: { hasSome: slots },
        },
        select: { id: true },
      });
      if (conflicts.length) throw new Error("One or more selected slots were just booked. Please choose again.");
      const blockConflict = await tx.calendarBlock.findFirst({
        where: { date, slots: { hasSome: slots } },
        select: { id: true },
      });
      if (blockConflict) throw new Error("One or more selected slots are unavailable. Please choose again.");

      await tx.user.upsert({
        where: { id: auth.user.id },
        create: { id: auth.user.id, email: auth.user.email || null, name, phone },
        update: { email: auth.user.email || undefined, name: name || undefined, phone: phone || undefined },
      });
      return tx.booking.create({
        data: {
          userId: auth.user.id,
          attendees,
          date,
          originalDate: date,
          slots,
          equipmentRequests,
          ticketNumber,
          bandName,
          totalAmount,
          status: "PENDING",
          paymentStatus: "PENDING",
          payuTxnId: txnid,
          expiresAt,
        },
      });
    }, { isolationLevel: "Serializable" });

    const allowDevStub = process.env.NODE_ENV !== "production" && process.env.PAYMENTS_DEV_STUB === "true";
    if (allowDevStub) {
      const confirmed = await prisma.booking.update({
        where: { id: booking.id },
        data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null },
        include: { user: true },
      });
      if (confirmed.user.email) await sendBookingConfirmation(confirmed, confirmed.user.email);
      return NextResponse.json({ url: `/booking/success?txnid=${txnid}`, params: {} });
    }

    assertPayUConfigured();
    const envSiteUrl = process.env.SITE_URL ? (process.env.SITE_URL.startsWith('http') ? process.env.SITE_URL : `https://${process.env.SITE_URL}`) : null;
    const siteUrl = (envSiteUrl || new URL(req.url).origin).replace(/\/$/, "");
    const payuData: Record<string, string> = {
      key: PAYU_MERCHANT_KEY,
      txnid,
      amount: totalAmount.toFixed(2),
      productinfo: "Elf Jampad Session Booking",
      firstname: name?.split(" ")[0] || "Musician",
      email: auth.user.email || "",
      phone: phone || "0000000000",
      udf1: booking.id,
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
    const status = message.includes("just booked") || message.includes("required") || message.includes("must") || message.includes("invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
