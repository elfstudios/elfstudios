import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyHash } from "@/lib/payu";
import { sendBookingConfirmation, sendOrderConfirmation } from "@/lib/mail";
import { syncBookingToGoogleCalendar } from "@/lib/google-calendar";

async function confirmOrder(orderId: string, paymentId: string | undefined) {
  const order = await prisma.$transaction(async (tx) => {
    const updated = await tx.bookingOrder.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null, payuPaymentId: paymentId || null },
    });
    if (!updated.count) return null;
    await tx.booking.updateMany({
      where: { orderId, status: "PENDING" },
      data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null, payuPaymentId: paymentId || null },
    });
    return tx.bookingOrder.findUniqueOrThrow({
      where: { id: orderId }, include: { bookings: { include: { user: true } }, user: true },
    });
  });
  if (!order) return;
  const effects: Promise<unknown>[] = order.bookings.map(syncBookingToGoogleCalendar);
  if (order.user.email) effects.push(sendOrderConfirmation(order, order.bookings, order.user.email));
  await Promise.allSettled(effects);
}

export async function POST(req: Request) {
  try {
    const response = Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
    const { txnid, status, hash } = response;
    if (!txnid || !status || !hash) return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    if (!verifyHash(response, hash)) return NextResponse.json({ error: "Invalid hash" }, { status: 403 });

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
