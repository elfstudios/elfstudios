import React from "react";
import { prisma } from "@/lib/prisma";
import { Card } from "@/components/ui/Card";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowRight, CalendarDays, IndianRupee, Users } from "lucide-react";
import { getAuthUserCount } from "@/lib/supabase-admin";

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch some stats
  const totalUsers = await getAuthUserCount();
  
  const upcomingBookingsCount = await prisma.booking.count({
    where: {
      date: { gte: today },
      status: "CONFIRMED"
    }
  });

  const revenueResult = await prisma.booking.aggregate({
    where: { status: "CONFIRMED" },
    _sum: { totalAmount: true }
  });
  const totalRevenue = revenueResult._sum.totalAmount || 0;

  // Fetch 5 most recent upcoming bookings
  const upcomingBookings = await prisma.booking.findMany({
    where: {
      date: { gte: today },
      status: "CONFIRMED"
    },
    orderBy: [
      { date: "asc" }
    ],
    take: 5,
    include: {
      user: true
    }
  });

  return (
    <div className="space-y-8 md:space-y-10">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-elf-orange">Elf Jampad</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-black sm:text-4xl">Operations overview</h1>
          <p className="mt-2 text-sm text-gray-500">Bookings, customers and schedule in one place.</p>
        </div>
        <Link href="/admin/bookings" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black px-4 text-sm font-bold text-white transition hover:bg-black/80">
          Manage bookings <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Card className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between"><div className="text-xs font-bold uppercase tracking-widest text-gray-500">Customers</div><Users className="h-5 w-5 text-gray-400" /></div>
          <div className="mt-5 text-4xl font-black text-black">{totalUsers}</div>
        </Card>
        
        <Card className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between"><div className="text-xs font-bold uppercase tracking-widest text-gray-500">Upcoming sessions</div><CalendarDays className="h-5 w-5 text-elf-orange" /></div>
          <div className="mt-5 text-4xl font-black text-elf-orange">{upcomingBookingsCount}</div>
        </Card>
        
        <Card className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between"><div className="text-xs font-bold uppercase tracking-widest text-gray-500">Confirmed revenue</div><IndianRupee className="h-5 w-5 text-gray-400" /></div>
          <div className="mt-5 text-4xl font-black text-black">₹{totalRevenue.toLocaleString("en-IN")}</div>
        </Card>
      </div>

      <section>
        <div className="mb-5 flex items-center justify-between gap-4"><div><h2 className="text-xl font-black text-black">Upcoming sessions</h2><p className="mt-1 text-sm text-gray-500">Your next confirmed bookings.</p></div><Link href="/admin/calendar" className="text-sm font-bold text-black underline underline-offset-4">Schedule</Link></div>
        {upcomingBookings.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
            <CalendarDays className="mx-auto h-7 w-7 text-gray-400" />
            <h3 className="mt-4 font-bold text-black">Ready for the first booking</h3>
            <p className="mt-1 text-sm text-gray-500">Confirmed sessions will appear here automatically.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <table className="w-full text-left font-sans text-sm">
              <thead className="bg-gray-50 text-gray-500 font-mono text-xs uppercase">
                <tr>
                  <th className="px-6 py-4 font-normal">Date & Time</th>
                  <th className="px-6 py-4 font-normal">Artist / Booking name</th>
                  <th className="px-6 py-4 font-normal">Attendees</th>
                  <th className="px-6 py-4 font-normal">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {upcomingBookings.map((booking) => {
                  const formattedSlots = booking.slots.map(s => {
                    const i = parseInt(s);
                    const ampm1 = i >= 12 ? "PM" : "AM";
                    const hour1 = i > 12 ? i - 12 : i;
                    return `${hour1} ${ampm1}`;
                  }).join(", ");

                  return (
                    <tr key={booking.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-bold text-black">{format(new Date(booking.date), "EEE, MMM do")}</div>
                        <div className="text-gray-500 text-xs mt-1" title={formattedSlots}>
                          Slots: {formattedSlots.length > 25 ? formattedSlots.substring(0, 25) + "..." : formattedSlots}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-black">{booking.bandName || "Unknown artist"}</div>
                        <div className="text-gray-500 text-xs">Booked by {booking.bookingName || booking.user.name || booking.user.email}</div>
                        <div className="text-gray-400 text-xs">{booking.user.phone}</div>
                      </td>
                      <td className="px-6 py-4">
                        {booking.attendees}
                      </td>
                      <td className="px-6 py-4 font-mono">
                        ₹{booking.totalAmount}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
