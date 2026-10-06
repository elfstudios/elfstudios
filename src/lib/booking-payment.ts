import { prisma } from "@/lib/prisma";
import { refundBookingWalletCoins } from "@/lib/wallet";

export async function cancelPendingBookingOrder(orderId: string, cancelledBy: string) {
  return prisma.$transaction(async (tx) => {
    const order = await tx.bookingOrder.findUnique({
      where: { id: orderId },
      include: { bookings: true },
    });
    if (!order || order.status !== "PENDING") return false;

    const now = new Date();
    await tx.bookingOrder.update({
      where: { id: order.id },
      data: { status: "CANCELLED", paymentStatus: cancelledBy === "SYSTEM" ? "EXPIRED" : "FAILED", cancelledAt: now, cancelledBy },
    });
    await tx.booking.updateMany({
      where: { orderId: order.id, status: "PENDING" },
      data: { status: "CANCELLED", paymentStatus: cancelledBy === "SYSTEM" ? "EXPIRED" : "FAILED", cancelledAt: now, cancelledBy },
    });
    for (const booking of order.bookings) {
      if (booking.walletCoins > 0) {
        await refundBookingWalletCoins(tx, booking.id, booking.walletCoins);
      }
    }
    return true;
  }, { isolationLevel: "Serializable" });
}

export async function expirePendingBookingOrders(now = new Date()) {
  const orders = await prisma.bookingOrder.findMany({
    where: { status: "PENDING", expiresAt: { lt: now } },
    select: { id: true },
  });
  await Promise.all(orders.map((order) => cancelPendingBookingOrder(order.id, "SYSTEM")));

  // Compatibility for pre-cart bookings, which never used a BookingOrder.
  await prisma.booking.updateMany({
    where: { orderId: null, status: "PENDING", expiresAt: { lt: now } },
    data: { status: "CANCELLED", paymentStatus: "EXPIRED", cancelledAt: now, cancelledBy: "SYSTEM" },
  });
}
