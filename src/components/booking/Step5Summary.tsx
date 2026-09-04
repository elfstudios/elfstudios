import React, { useState } from "react";
import { format } from "date-fns";
import type { CartSession } from "./BookingFlow";

interface Step5Props {
  attendees: number;
  date: Date | null;
  slots: string[];
  sessions: CartSession[];
  bandName: string;
  equipmentRequests: string;
  onNext: () => void;
  onBack: () => void;
  onCancel: () => void;
}

export function Step5Summary({ 
  attendees, 
  date,
  slots,
  sessions,
  bandName,
  equipmentRequests,
  onNext, 
  onBack, 
  onCancel 
}: Step5Props) {
  const [loading, setLoading] = useState(false);
  const cartSessions = sessions.length ? sessions : (date && slots.length ? [{ date, slots }] : []);
  const totalHours = cartSessions.reduce((total, session) => total + session.slots.length, 0);
  const pricePerHour = attendees <= 6 ? 400 : 700;
  const subtotal = pricePerHour * totalHours;
  const freeHours = Math.floor(totalHours / 10);
  const discount = freeHours * pricePerHour;
  const total = subtotal - discount;

  const handlePayment = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/payu/initiate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attendees,
          bandName,
          equipmentRequests,
          sessions: cartSessions.map((session) => ({
            date: format(session.date, "yyyy-MM-dd"),
            slots: session.slots,
          })),
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to initiate payment");
      }

      const { url, params } = await res.json();

      // Dev stub bypass: if no params are returned, just redirect directly
      if (Object.keys(params || {}).length === 0) {
        window.location.href = url;
        return;
      }

      // Create a hidden form and submit it to redirect to PayU
      const form = document.createElement("form");
      form.method = "POST";
      form.action = url;

      Object.keys(params).forEach((key) => {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = params[key];
        form.appendChild(input);
      });

      document.body.appendChild(form);
      form.submit();
    } catch (error) {
      console.error(error);
      setLoading(false);
      alert("Error initiating payment. Please try again.");
    }
  };

  const formattedSlots = (sessionSlots: string[]) => sessionSlots.map(s => {
    const i = parseInt(s);
    const ampm1 = i >= 12 ? "PM" : "AM";
    const hour1 = i > 12 ? i - 12 : i;
    return `${hour1} ${ampm1}`;
  }).join(", ");

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2 text-center sm:text-left flex flex-col items-center sm:items-start">
        <h2 className="text-[11px] font-mono uppercase tracking-widest text-white/50 drop-shadow-md">
          Step 4
        </h2>
        <h3 className="font-display font-black text-2xl uppercase text-white tracking-wide">
          Review & Checkout
        </h3>
        <p className="font-sans text-[13px] text-white/60 font-light">
          Please review your booking details before proceeding to payment.
        </p>
      </div>

      <div className="bg-white/5 backdrop-blur-md rounded-xl border border-white/10 shadow-inner overflow-hidden">
        {/* Ticket Header */}
        <div className="bg-white/10 p-4 flex justify-between items-center border-b border-white/10 border-dashed">
          <span className="font-mono text-[11px] text-white/60 uppercase tracking-widest">CHECKOUT</span>
          <span className="font-display text-sm text-elf-orange font-bold tracking-wider">{cartSessions.length} SESSION{cartSessions.length === 1 ? "" : "S"}</span>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex justify-between border-b border-white/10 pb-4">
            <span className="font-mono text-[11px] text-white/40 uppercase tracking-widest">Band Name</span>
            <span className="font-display text-[15px] uppercase text-white font-bold text-right">{bandName}</span>
          </div>

          <div className="border-b border-white/10 pb-4">
            <span className="font-mono text-[11px] text-white/40 uppercase tracking-widest">Sessions</span>
            <div className="mt-3 space-y-2">
              {cartSessions.map((session) => (
                <div key={session.date.toISOString()} className="flex items-start justify-between gap-4 rounded-lg bg-black/20 px-3 py-2">
                  <span className="font-display text-[13px] uppercase text-white font-bold">{format(session.date, "MMM do, yyyy")}</span>
                  <span className="max-w-[60%] text-right font-mono text-[10px] uppercase tracking-widest text-white/60">{formattedSlots(session.slots)}</span>
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex justify-between border-b border-white/10 pb-4">
            <span className="font-mono text-[11px] text-white/40 uppercase tracking-widest">Attendees</span>
            <span className="font-display text-[15px] uppercase text-white font-bold">{attendees} members</span>
          </div>

          {equipmentRequests && (
            <div className="flex justify-between border-b border-white/10 pb-4">
              <span className="font-mono text-[11px] text-white/40 uppercase tracking-widest">Equipment</span>
              <span className="font-sans text-[13px] text-white/80 max-w-[60%] text-right truncate" title={equipmentRequests}>
                {equipmentRequests}
              </span>
            </div>
          )}

          <div className="flex justify-between items-end pt-2">
            <span className="font-mono text-[11px] text-white/40 uppercase tracking-widest">Total (Advance)</span>
            <div className="text-right">
              <span className="font-display text-4xl text-white font-black drop-shadow-md">₹{total}</span>
              <p className="font-mono text-[10px] text-white/40 mt-1 uppercase tracking-widest">₹{pricePerHour}/hr × {totalHours} hrs</p>
            </div>
          </div>
          {discount > 0 && <p className="text-right font-mono text-[10px] uppercase tracking-widest text-green-400">Loyalty reward: {freeHours} free hour{freeHours === 1 ? "" : "s"} · −₹{discount}</p>}
        </div>
      </div>

      <div className="flex gap-3 pt-4 items-center">
        <button 
          onClick={onCancel} 
          disabled={loading}
          className="h-[50px] px-6 text-white/40 hover:text-red-400 font-bold tracking-widest uppercase transition-colors text-[11px]"
        >
          Exit
        </button>
        <div className="flex-1"></div>
        <button 
          onClick={onBack}
          disabled={loading}
          className="h-[50px] px-8 bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white font-bold tracking-widest uppercase transition-colors rounded-xl text-[11px]"
        >
          Back
        </button>
        <button 
          onClick={handlePayment} 
          disabled={loading}
          className="h-[50px] px-8 bg-white text-black hover:bg-white/90 font-bold tracking-widest uppercase transition-all rounded-xl text-[11px] shadow-sm transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {loading ? "Processing..." : `Pay ₹${total}`}
        </button>
      </div>
    </div>
  );
}
