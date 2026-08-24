import React from "react";
import { prisma } from "@/lib/prisma";
import { format, addDays, startOfToday } from "date-fns";
import { isGoogleCalendarConfigured } from "@/lib/google-calendar";
import { CalendarSyncTestButton } from "./CalendarSyncTestButton";
import { CalendarBlocksManager } from "./CalendarBlocksManager";

export const dynamic = 'force-dynamic';

export default async function AdminCalendarPage() {
  const today = startOfToday();
  const next7Days = Array.from({ length: 7 }).map((_, i) => addDays(today, i));

  // Fetch bookings and manually blocked slots for the next 7 days.
  const [bookings, blocks] = await Promise.all([prisma.booking.findMany({
    where: {
      date: {
        gte: today,
        lt: addDays(today, 8) // Up to 7 days out
      },
      status: "CONFIRMED"
    },
    include: {
      user: true
    }
  }), prisma.calendarBlock.findMany({
    where: { date: { gte: today } },
    orderBy: { date: "asc" },
  })]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-display font-black uppercase tracking-tighter">
          Calendar View
        </h1>
        <p className="text-gray-500 font-sans mt-2">
          Confirmed bookings and studio blocks for the next 7 days.
        </p>
        <CalendarSyncTestButton configured={isGoogleCalendarConfigured()} />
      </div>

      <CalendarBlocksManager initialBlocks={blocks.map((block) => ({
        id: block.id,
        date: block.date.toISOString(),
        slots: block.slots,
        note: block.note,
        googleCalendarEventId: block.googleCalendarEventId,
        googleCalendarSyncedAt: block.googleCalendarSyncedAt?.toISOString() || null,
      }))} />

      <div className="grid grid-cols-1 md:grid-cols-7 gap-4">
        {next7Days.map((day) => {
          const dayBookings = bookings.filter(b => 
            new Date(b.date).toDateString() === day.toDateString()
          );
          const dayBlocks = blocks.filter(block =>
            new Date(block.date).toDateString() === day.toDateString()
          );

          return (
            <div key={day.toISOString()} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[500px]">
              <div className="bg-black text-white p-3 text-center border-b border-black/10">
                <div className="font-mono text-[10px] uppercase tracking-widest text-elf-orange">
                  {format(day, "EEEE")}
                </div>
                <div className="font-display font-black text-xl">
                  {format(day, "d MMM")}
                </div>
              </div>
              
              <div className="p-2 flex-1 overflow-y-auto space-y-2 bg-gray-50">
                {dayBookings.length === 0 && dayBlocks.length === 0 ? (
                  <div className="text-center text-gray-400 text-xs py-8 font-sans">
                    No bookings or blocks
                  </div>
                ) : (
                  <>
                    {dayBlocks.map((block) => {
                      const formattedSlots = block.slots.map((slot) => {
                        const hour = parseInt(slot);
                        return `${hour > 12 ? hour - 12 : hour} ${hour >= 12 ? "PM" : "AM"}`;
                      }).join(", ");
                      return (
                        <div key={block.id} className="rounded-xl border border-red-200 bg-red-50 p-3 shadow-sm">
                          <div className="text-[10px] font-mono font-bold text-red-800" title={formattedSlots}>{formattedSlots}</div>
                          <div className="mt-1 text-sm font-sans font-bold text-red-700">STUDIO BLOCKED</div>
                          {block.note && <div className="mt-1 text-[10px] font-sans text-red-700">{block.note}</div>}
                        </div>
                      );
                    })}
                    {dayBookings.map(booking => {
                    const formattedSlots = booking.slots.map(s => {
                      const i = parseInt(s);
                      const ampm1 = i >= 12 ? "PM" : "AM";
                      const hour1 = i > 12 ? i - 12 : i;
                      return `${hour1} ${ampm1}`;
                    }).join(", ");

                    return (
                      <div key={booking.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm hover:border-elf-orange transition-colors">
                        <div className="text-[10px] font-mono font-bold text-black" title={formattedSlots}>
                          {formattedSlots}
                        </div>
                        <div className="text-sm font-sans font-bold text-elf-orange mt-1 truncate">
                          {booking.bandName || booking.user.name || "Unknown Band"}
                        </div>
                        <div className="text-[10px] font-sans text-gray-500 mt-1">
                          {booking.user.phone}
                        </div>
                      </div>
                    );
                    })}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
