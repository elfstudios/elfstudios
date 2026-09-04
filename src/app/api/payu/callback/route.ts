import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyHash, verifyPaymentWithPayU } from "@/lib/payu";
import { sendBookingConfirmation, sendOrderConfirmation } from "@/lib/mail";
import { syncBookingToGoogleCalendar } from "@/lib/google-calendar";

function htmlRedirect(url: string) {
  return new NextResponse(
    `<html><body><script>window.location.href="${url}";</script><noscript><meta http-equiv="refresh" content="0;url=${url}"></noscript></body></html>`,
    { headers: { "Content-Type": "text/html" } },
  );
}

async function readPayUResponse(req: Request) {
  if (req.method === "GET") return Object.fromEntries(new URL(req.url).searchParams.entries());
  return Object.fromEntries((await req.formData()).entries()) as Record<string, string>;
}

async function confirmOrder(orderId: string, paymentId: string | undefined) {
  const updated = await prisma.$transaction(async (tx) => {
    const changed = await tx.bookingOrder.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null, payuPaymentId: paymentId || null },
    });
    if (!changed.count) return null;
    await tx.booking.updateMany({
      where: { orderId, status: "PENDING" },
      data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: new Date(), expiresAt: null, payuPaymentId: paymentId || null },
    });
    return tx.bookingOrder.findUniqueOrThrow({
      where: { id: orderId }, include: { bookings: { include: { user: true } }, user: true },
    });
  });
  if (!updated) return;
  const effects: Promise<unknown>[] = updated.bookings.map(syncBookingToGoogleCalendar);
  if (updated.user.email) effects.push(sendOrderConfirmation(updated, updated.bookings, updated.user.email));
  const results = await Promise.allSettled(effects);
  results.filter((result) => result.status === "rejected").forEach((result) => console.error("Order confirmation side effect failed:", result.reason));
}

async function failOrder(orderId: string) {
  await prisma.$transaction([
    prisma.bookingOrder.updateMany({
      where: { id: orderId, status: "PENDING" },
      data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date(), cancelledBy: "PAYU" },
    }),
    prisma.booking.updateMany({
      where: { orderId, status: "PENDING" },
      data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date(), cancelledBy: "PAYU" },
    }),
  ]);
}

async function handleCallback(req: Request) {
  const envSiteUrl = process.env.SITE_URL ? (process.env.SITE_URL.startsWith("http") ? process.env.SITE_URL : `https://${process.env.SITE_URL}`) : null;
  const siteUrl = (envSiteUrl || new URL(req.url).origin).replace(/\/$/, "");
  try {
    const response = await readPayUResponse(req);
    const { txnid, status, hash } = response;
    if (!txnid || !status || !hash || !verifyHash(response, hash)) {
      return htmlRedirect(`${siteUrl}/booking/error?reason=invalid-response`);
    }

    const order = await prisma.bookingOrder.findUnique({ where: { payuTxnId: txnid } });
    if (order) {
      if (response.udf1 !== order.id || Number(response.amount) !== Number(order.totalAmount)) {
        return htmlRedirect(`${siteUrl}/booking/error?reason=payment-mismatch`);
      }
      if (status === "success") {
        if (!await verifyPaymentWithPayU(txnid, Number(order.totalAmount).toFixed(2))) {
          return htmlRedirect(`${siteUrl}/booking/error?reason=verification-pending`);
        }
        await confirmOrder(order.id, response.mihpayid);
        return htmlRedirect(`${siteUrl}/booking/success?txnid=${encodeURIComponent(txnid)}`);
      }
      if (status === "pending") return htmlRedirect(`${siteUrl}/booking/error?reason=payment-pending`);
      await failOrder(order.id);
      return htmlRedirect(`${siteUrl}/booking/error?reason=payment-failed`);
    }

    // Support payments started before multi-session checkout was deployed.
    const booking = await prisma.booking.findUnique({ where: { payuTxnId: txnid }, include: { user: true } });
    if (!booking || response.udf1 !== booking.id || Number(response.amount) !== Number(booking.totalAmount)) {
      return htmlRedirect(`${siteUrl}/booking/error?reason=payment-mismatch`);
    }
    if (status === "success") {
      if (!await verifyPaymentWithPayU(txnid, Number(booking.totalAmount).toFixed(2))) {
        return htmlRedirect(`${siteUrl}/booking/error?reason=verification-pending`);
      }
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
      return htmlRedirect(`${siteUrl}/booking/success?txnid=${encodeURIComponent(txnid)}`);
    }
    if (status === "pending") return htmlRedirect(`${siteUrl}/booking/error?reason=payment-pending`);
    await prisma.booking.updateMany({
      where: { id: booking.id, status: "PENDING" },
      data: { status: "CANCELLED", paymentStatus: "FAILED", cancelledAt: new Date(), cancelledBy: "PAYU" },
    });
    return htmlRedirect(`${siteUrl}/booking/error?reason=payment-failed`);
  } catch (error) {
    console.error("PayU callback error:", error);
    return htmlRedirect(`${siteUrl}/booking/error?reason=callback-error`);
  }
}

export async function POST(req: Request) { return handleCallback(req); }
// PayU can return a customer through a browser GET depending on gateway flow.
export async function GET(req: Request) { return handleCallback(req); }
