import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export default async function SuccessPage({
  searchParams: searchParamsPromise,
}: {
  searchParams: Promise<{ txnid?: string }>;
}) {
  const searchParams = await searchParamsPromise;
  let ticketNumber = null;
  let bandName = null;
  let date = null;
  let sessionCount = 0;
  const supabase = await createClient();
  const { data: { user: authUser } } = await supabase.auth.getUser();
  
  if (searchParams.txnid) {
    const order = await prisma.bookingOrder.findUnique({
      where: { payuTxnId: searchParams.txnid },
      select: {
        userId: true, status: true, bandName: true,
        bookings: { orderBy: { date: "asc" }, select: { ticketNumber: true, date: true } },
      },
    });
    if (order) {
      if (order.status !== "CONFIRMED" || (authUser && order.userId !== authUser.id)) {
        redirect("/booking/error?reason=not-confirmed");
      }
      sessionCount = order.bookings.length;
      ticketNumber = sessionCount === 1 ? order.bookings[0]?.ticketNumber : null;
      bandName = order.bandName || "Musician";
      date = order.bookings[0]?.date || null;
    } else {
      // Compatibility for a payment initiated before cart checkout shipped.
      const booking = await prisma.booking.findUnique({
        where: { payuTxnId: searchParams.txnid },
        select: {
          ticketNumber: true, date: true, bandName: true, status: true, userId: true,
          user: { select: { bandName: true, name: true } },
        },
      });
      if (!booking || booking.status !== "CONFIRMED" || (authUser && booking.userId !== authUser.id)) {
        redirect("/booking/error?reason=not-confirmed");
      }
      sessionCount = 1;
      ticketNumber = booking.ticketNumber;
      bandName = booking.bandName || booking.user.bandName || booking.user.name || "Musician";
      date = booking.date;
    }
  } else if (!authUser) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-6 relative overflow-hidden bg-black selection:bg-elf-orange selection:text-black">
      {/* Background glowing effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] h-[80vw] max-w-[800px] max-h-[800px] bg-green-500/20 rounded-full blur-[120px] opacity-50 mix-blend-screen pointer-events-none"></div>
      
      <div className="w-full max-w-xl animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150 relative z-10">
        <div className="bg-white/5 backdrop-blur-2xl border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl flex flex-col items-center text-center">
          
          <div className="mb-8 relative">
            <div className="absolute inset-0 bg-green-500 blur-2xl opacity-20 rounded-full scale-150 animate-pulse"></div>
            <CheckCircle2 className="w-24 h-24 text-green-400 relative z-10 drop-shadow-[0_0_15px_rgba(74,222,128,0.5)]" strokeWidth={1.5} />
          </div>

          <h1 className="font-display text-4xl md:text-5xl text-white font-black uppercase tracking-tighter mb-4 drop-shadow-lg">
            You’re In!
          </h1>
          
          <p className="font-sans text-white/60 text-sm md:text-base font-light mb-10 max-w-md mx-auto leading-relaxed">
            {bandName}, your {sessionCount > 1 ? `${sessionCount} jam sessions are` : "jam session is"} locked and loaded. We’ve received your payment and your slots are secured. See you at the pad.
          </p>
          
          {ticketNumber && (
            <div className="w-full relative group">
              <div className="absolute inset-0 bg-gradient-to-r from-elf-orange/0 via-elf-orange/20 to-elf-orange/0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-xl"></div>
              
              <div className="bg-black/40 border border-white/10 rounded-2xl p-6 relative z-10 backdrop-blur-sm transform transition-all duration-300 hover:scale-[1.02] hover:border-elf-orange/50 hover:bg-black/60 shadow-inner">
                <p className="font-mono text-[10px] text-white/40 uppercase tracking-widest mb-2">Official Ticket No.</p>
                <div className="flex items-center justify-center space-x-4">
                  <div className="h-[2px] flex-1 bg-gradient-to-r from-transparent to-elf-orange/30"></div>
                  <p className="font-display text-5xl md:text-6xl text-elf-orange font-black tracking-widest drop-shadow-[0_0_20px_rgba(255,102,0,0.3)]">
                    {ticketNumber}
                  </p>
                  <div className="h-[2px] flex-1 bg-gradient-to-l from-transparent to-elf-orange/30"></div>
                </div>
              </div>
            </div>
          )}

          {sessionCount > 1 && (
            <div className="mt-2 rounded-xl border border-white/10 bg-black/30 px-5 py-4 font-mono text-xs uppercase tracking-widest text-white/70">
              {sessionCount} sessions confirmed — tickets are in your email and My Bookings.
            </div>
          )}

          {searchParams.txnid && (
            <div className="mt-8 mb-10 text-center">
              <span className="inline-flex items-center space-x-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                <span className="font-mono text-[9px] text-white/50 uppercase tracking-widest">
                  TXN: {searchParams.txnid}
                </span>
              </span>
            </div>
          )}

          <Link 
            href="/" 
            className="group relative inline-flex items-center justify-center w-full sm:w-auto h-14 px-10 bg-white text-black font-display font-black uppercase tracking-widest text-sm rounded-xl overflow-hidden transition-all duration-300 hover:scale-[1.02] active:scale-95 shadow-[0_0_40px_rgba(255,255,255,0.1)] hover:shadow-[0_0_40px_rgba(255,255,255,0.2)]"
          >
            <span className="relative z-10 flex items-center gap-2">
              Return to Base
              <svg className="w-4 h-4 transform transition-transform duration-300 group-hover:translate-x-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </span>
            <div className="absolute inset-0 bg-gradient-to-r from-gray-200 to-white opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </Link>
        </div>
      </div>
    </main>
  );
}
