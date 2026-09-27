import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyHash } from "@/lib/payu";
import { sendBookingConfirmation, sendOrderConfirmation } from "@/lib/mail";
import { syncBookingToGoogleCalendar } from "@/lib/google-calendar";
import { confirmWalletTopUp } from "@/lib/wallet";

async function confirmOrder(orderId: string, paymentId: string | undefined) {
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.bookingOrder.findUnique({ where: { id: orderId }, include: { bookings: true } });
    if (!current) return { outcome: "MISSING" as const, order: null };
    if (current.status === "CONFIRMED") return { outcome: "ALREADY_CONFIRMED" as const, order: null };
    if (current.status === "CANCELLED" && current.paymentStatus === "EXPIRED") {
      for (const booking of current.bookings) {
        const [bookingConflict, blockConflict] = await Promise.all([
          tx.booking.findFirst({
            where: {
              orderId: { not: orderId }, date: booking.date, slots: { hasSome: booking.slots },
              OR: [{ status: "CONFIRMED" }, { status: "PENDING", expiresAt: { gt: new Date() } }],
            }, select: { id: true },
          }),
          tx.calendarBlock.findFirst({ where: { date: booking.date, slots: { hasSome: booking.slots } }, select: { id: true } }),
        ]);
        if (bookingConflict || blockConflict) return { outcome: "SLOT_CONFLICT" as const, order: null };
      }
    } else if (current.status !== "PENDING") {
      return { outcome: "NOT_CONFIRMABLE" as const, order: null };
    }
    const now = new Date();
    await tx.bookingOrder.update({ where: { id: orderId }, data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: now, expiresAt: null, payuPaymentId: paymentId || null } });
    await tx.booking.updateMany({
      where: { orderId, status: { in: ["PENDING", "CANCELLED"] } },
      data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: now, expiresAt: null, payuPaymentId: paymentId || null, cancelledAt: null, cancelledBy: null },
    });
    return { outcome: "CONFIRMED" as const, order: await tx.bookingOrder.findUniqueOrThrow({ where: { id: orderId }, include: { bookings: { include: { user: true } }, user: true } }) };
  });
  if (!result.order) return result.outcome;
  const effects: Promise<unknown>[] = result.order.bookings.map(syncBookingToGoogleCalendar);
  if (result.order.user.email) effects.push(sendOrderConfirmation(result.order, result.order.bookings, result.order.user.email));
  await Promise.allSettled(effects);
  return result.outcome;
}

export async function POST(req: Request) {
  try {
    const response = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
    const { txnid, status, hash } = response;
    if (!txnid || !status || !hash) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    if (!verifyHash(response, hash)) return NextResponse.json({ error: "Invalid hash" }, { status: 403 });

    if (response.udf2 === "WALLET_TOPUP") {
      const topUp = await prisma.walletTopUp.findUnique({ where: { payuTxnId: txnid } });
      if (!topUp || response.udf1 !== topUp.id || Number(response.amount) !== Number(topUp.amount)) {
        return NextResponse.json({ error: "Transaction mismatch" }, { status: 409 });
      }
      if (status === "success") await confirmWalletTopUp(topUp.id, response.mihpayid);
      else if (status !== "pending") await prisma.walletTopUp.updateMany({ where: { id: topUp.id, status: "PENDING" }, data: { status: "FAILED" } });
      return NextResponse.json({ status: "ok" });
    }

    const order = await prisma.bookingOrder.findUnique({ where: { payuTxnId: txnid } });
    if (order) {
      if (response.udf1 !== order.id || Number(response.amount) !== Number(order.totalAmount)) {
        return NextResponse.json({ error: "Transaction mismatch" }, { status: 409 });
      }
      if (status === "success") await confirmOrder(order.id, response.mihpayid);
      else if (status !== "pending") {
        await prisma.$transaction([
          prisma.bookingOrder.updateMany({ where: { id: order.id, status: "PENDING" }, data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date(), cancelledBy: "PAYU" } }),
          prisma.booking.updateMany({ where: { orderId: order.id, status: "PENDING" }, data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date(), cancelledBy: "PAYU" } }),
        ]);
      }
      return NextResponse.json({ status: "ok" });
    }

    // Legacy single-session transactions initiated before the cart release.
    const booking = await prisma.booking.findUnique({ where: { payuTxnId: txnid }, include: { user: true } });
    if (!booking || response.udf1 !== booking.id || Number(response.amount) !== Number(booking.totalAmount)) {
      return NextResponse.json({ error: "Transaction mismatch" }, { status: 409 });
    }
    if (status === "success") {
      const changed = await prisma.booking.updateMany({
        where: { id: booking.id, status: "PENDING" },
        data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null, payuPaymentId: response.mihpayid || null },
      });
      if (changed.count) {
        const confirmed = await prisma.booking.findUnique({ where: { id: booking.id }, include: { user: true } });
        if (confirmed) {
          const effects: Promise<unknown>[] = [syncBookingToGoogleCalendar(confirmed)];
          if (confirmed.user.email) effects.push(sendBookingConfirmation(confirmed, confirmed.user.email));
          await Promise.allSettled(effects);
        }
      }
    } else if (status !== "pending") {
      await prisma.booking.updateMany({
        where: { id: booking.id, status: "PENDING" },
        data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date(), cancelledBy: "PAYU" },
      });
    }
    return NextResponse.json({ status: "ok" });
  } catch (error) {
    console.error("PayU webhook error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
