import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyHash, verifyPaymentWithPayU } from "@/lib/payu";
import { sendBookingConfirmation, sendOrderConfirmation } from "@/lib/mail";
import { syncBookingToGoogleCalendar } from "@/lib/google-calendar";
import { confirmWalletTopUp } from "@/lib/wallet";
import { cancelPendingBookingOrder } from "@/lib/booking-payment";

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
  const result = await prisma.$transaction(async (tx) => {
    const current = await tx.bookingOrder.findUnique({ where: { id: orderId }, include: { bookings: true } });
    if (!current) return { outcome: "MISSING" as const, order: null };
    if (current.status === "CONFIRMED") return { outcome: "ALREADY_CONFIRMED" as const, order: null };

    // A gateway can return just after the short checkout hold ends. Recover it only
    // when every original slot is still free; never overwrite another booking.
    if (current.status === "CANCELLED" && current.paymentStatus === "EXPIRED") {
      if (current.bookings.some((booking) => booking.walletCoins > 0)) {
        return { outcome: "WALLET_CREDIT_RELEASED" as const, order: null };
      }
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
    await tx.bookingOrder.update({
      where: { id: orderId },
      data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: now, expiresAt: null, payuPaymentId: paymentId || null },
    });
    await tx.booking.updateMany({
      where: { orderId, status: { in: ["PENDING", "CANCELLED"] } },
      data: { status: "CONFIRMED", paymentStatus: "PAID", paidAt: now, expiresAt: null, payuPaymentId: paymentId || null, cancelledAt: null, cancelledBy: null },
    });
    return {
      outcome: "CONFIRMED" as const,
      order: await tx.bookingOrder.findUniqueOrThrow({ where: { id: orderId }, include: { bookings: { include: { user: true } }, user: true } }),
    };
  });
  if (!result.order) return result.outcome;
  const effects: Promise<unknown>[] = result.order.bookings.map(syncBookingToGoogleCalendar);
  if (result.order.user.email) effects.push(sendOrderConfirmation(result.order, result.order.bookings, result.order.user.email));
  const results = await Promise.allSettled(effects);
  results.filter((result) => result.status === "rejected").forEach((result) => console.error("Order confirmation side effect failed:", result.reason));
  return result.outcome;
}

async function failOrder(orderId: string) {
  await cancelPendingBookingOrder(orderId, "PAYU");
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

    if (response.udf2 === "WALLET_TOPUP") {
      const topUp = await prisma.walletTopUp.findUnique({ where: { payuTxnId: txnid } });
      if (!topUp || response.udf1 !== topUp.id || Number(response.amount) !== Number(topUp.amount)) {
        return htmlRedirect(`${siteUrl}/booking/error?reason=payment-mismatch`);
      }
      if (status === "success") {
        if (!await verifyPaymentWithPayU(txnid, Number(topUp.amount).toFixed(2))) {
          return htmlRedirect(`${siteUrl}/booking/error?reason=verification-pending`);
        }
        await confirmWalletTopUp(topUp.id, response.mihpayid);
        return htmlRedirect(`${siteUrl}/wallet?topup=success`);
      }
      if (status !== "pending") await prisma.walletTopUp.updateMany({ where: { id: topUp.id, status: "PENDING" }, data: { status: "FAILED" } });
      return htmlRedirect(`${siteUrl}/wallet${status === "pending" ? "?topup=pending" : "?topup=failed"}`);
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
        const outcome = await confirmOrder(order.id, response.mihpayid);
        if (outcome === "SLOT_CONFLICT") {
          return htmlRedirect(`${siteUrl}/booking/error?reason=paid-slot-conflict`);
        }
        if (outcome === "MISSING" || outcome === "NOT_CONFIRMABLE" || outcome === "WALLET_CREDIT_RELEASED") {
          return htmlRedirect(`${siteUrl}/booking/error?reason=confirmation-unavailable`);
        }
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
