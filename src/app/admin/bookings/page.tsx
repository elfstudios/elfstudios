import { prisma } from "@/lib/prisma";
import { AdminBookingsClient } from "./AdminBookingsClient";

export const dynamic = "force-dynamic";

export default async function AdminBookingsPage() {
  const bookings = await prisma.booking.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      user: true,
      order: { select: { totalHours: true, freeHours: true } },
      changeRequests: { orderBy: { createdAt: "desc" }, take: 5 },
    },
  });

  return <AdminBookingsClient initialBookings={bookings.map((booking) => ({
    id: booking.id,
    bandName: booking.bandName,
    ticketNumber: booking.ticketNumber,
    attendees: booking.attendees,
    date: booking.date.toISOString(),
    slots: booking.slots,
    totalAmount: booking.totalAmount,
    status: booking.status,
    paymentStatus: booking.paymentStatus,
    equipmentRequests: booking.equipmentRequests,
    order: booking.order,
    user: { name: booking.user.name, email: booking.user.email, phone: booking.user.phone },
    history: booking.changeRequests.map((request) => ({ id: request.id, type: request.type, reason: request.reason, createdAt: request.createdAt.toISOString() })),
  }))}/>;
}
