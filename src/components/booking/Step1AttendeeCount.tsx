import React, { useState, useEffect } from "react";

interface Step1Props {
  attendees: number;
  setAttendees: (count: number) => void;
  onNext: () => void;
}

export function Step1AttendeeCount({
  attendees,
  setAttendees,
  onNext,
}: Step1Props) {
  const [price, setPrice] = useState(0);

  useEffect(() => {
    if (attendees < 1) {
      setPrice(0);
    } else if (attendees <= 6) {
      setPrice(400);
    } else setPrice(400 + (attendees - 6) * 100);
  }, [attendees]);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2 text-center md:text-left">
        <h2 className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 drop-shadow-md">
          Step 1
        </h2>
        <h3 className="font-display font-medium text-xl md:text-2xl uppercase text-white/90 tracking-[0.15em]">
          Who’s Jamming?
        </h3>
        <p className="font-sans text-[12px] text-white/40 font-light tracking-wide pt-1">
          Enter the number of people attending the session. Pricing is calculated dynamically.
        </p>
      </div>

      <div className="w-full">
        <div className="space-y-2">
          <label htmlFor="attendees" className="text-[11px] font-mono uppercase tracking-widest text-white/50">
            Number of Attendees
          </label>
          <input
            id="attendees"
            type="number"
            min="1"
            max="10"
            value={attendees || ""}
            onChange={(e) => setAttendees(e.target.value === "" ? 0 : Math.min(10, Math.max(1, parseInt(e.target.value, 10) || 1)))}
            className="w-full h-[50px] bg-white/5 border border-white/10 rounded-xl px-4 text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white/50 transition-all font-sans text-[15px] shadow-sm backdrop-blur-sm"
          />
        </div>
      </div>

      <div className="bg-white/5 backdrop-blur-md rounded-xl p-4 border border-white/10 flex items-center justify-between shadow-inner">
        <div>
          <p className="font-mono text-[10px] uppercase text-white/40 tracking-widest">Live Rate</p>
          <p className="font-sans text-[11px] text-white/60 mt-1 font-light">
            {attendees < 1
              ? "Enter your group size to see the rate."
              : attendees <= 6
              ? "Flat rate for up to 6 members."
              : `₹400 + ₹100 per member after 6.`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display font-black text-3xl text-white drop-shadow-md">{price ? `₹${price}` : "—"}<span className="text-sm text-white/40 font-normal">/hr</span></p>
        </div>
      </div>

      <div className="pt-4">
        <button 
          onClick={onNext} 
          disabled={attendees < 1 || attendees > 10}
          className="w-full min-h-[50px] bg-white text-black hover:bg-white/90 font-bold tracking-widest uppercase transition-all rounded-xl text-xs shadow-sm transform hover:-translate-y-0.5 disabled:opacity-40 disabled:hover:translate-y-0"
        >
          Continue to Date & Time
        </button>
      </div>
    </div>
  );
}
