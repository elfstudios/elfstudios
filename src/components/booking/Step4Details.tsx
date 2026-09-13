import React, { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { User } from "@supabase/supabase-js";

interface Step4Props {
  onNext: () => void;
  onBack: () => void;
  bandName: string;
  setBandName: (val: string) => void;
  bookingName: string;
  setBookingName: (val: string) => void;
  equipmentRequests: string;
  setEquipmentRequests: (val: string) => void;
}

export function Step4Details({ onNext, onBack, bandName, setBandName, bookingName, setBookingName, equipmentRequests, setEquipmentRequests }: Step4Props) {
  const [user, setUser] = useState<User | null>(null);
  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });
  }, [supabase.auth]);

  useEffect(() => {
    if (!bandName && user?.user_metadata?.band_name) {
      setBandName(String(user.user_metadata.band_name));
    }
  }, [user, bandName, setBandName]);

  const isFormValid = bandName.trim().length > 0 && bookingName.trim().length > 0;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-[11px] font-mono uppercase tracking-widest text-white/50 drop-shadow-md">
          Step 3
        </h2>
        <h3 className="font-display font-black text-2xl uppercase text-white tracking-wide">
          Session Details
        </h3>
        <p className="font-sans text-[13px] text-white/60 font-light">
          We need a few details about your band and equipment needs.
        </p>
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="bookingName" className="text-[11px] font-mono uppercase tracking-widest text-white/50">
            Booking Name *
          </label>
          <input
            id="bookingName"
            type="text"
            required
            value={bookingName}
            onChange={(e) => setBookingName(e.target.value)}
            placeholder="e.g. Josh Sam"
            className="w-full h-[50px] bg-white/5 border border-white/10 rounded-xl px-4 text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white/50 transition-all font-sans text-[15px] shadow-sm backdrop-blur-sm"
          />
          <p className="text-[11px] text-white/40">The person responsible for this booking and payment.</p>
        </div>
        <div className="space-y-2">
          <label htmlFor="bandName" className="text-[11px] font-mono uppercase tracking-widest text-white/50">
            Band / Artist Name *
          </label>
          <input
            id="bandName"
            type="text"
            required
            value={bandName}
            onChange={(e) => setBandName(e.target.value)}
            placeholder="e.g. The Local Train"
            className="w-full h-[50px] bg-white/5 border border-white/10 rounded-xl px-4 text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white/50 transition-all font-sans text-[15px] shadow-sm backdrop-blur-sm"
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="equipment" className="text-[11px] font-mono uppercase tracking-widest text-white/50">
            Equipment Requests (Optional)
          </label>
          <textarea
            id="equipment"
            value={equipmentRequests}
            onChange={(e) => setEquipmentRequests(e.target.value)}
            placeholder="Need an extra mic stand or specific cymbal?"
            className="w-full min-h-[100px] bg-white/5 border border-white/10 rounded-xl p-4 text-white focus:outline-none focus:border-white focus:ring-1 focus:ring-white/50 transition-all font-sans text-[15px] shadow-sm resize-none backdrop-blur-sm"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-4 items-center">
        <button 
          onClick={onBack}
          className="h-[50px] px-8 bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white font-bold tracking-widest uppercase transition-colors rounded-xl text-xs"
        >
          Back
        </button>
        <button 
          onClick={onNext} 
          disabled={!isFormValid} 
          className="flex-1 h-[50px] bg-white text-black hover:bg-white/90 font-bold tracking-widest uppercase transition-all rounded-xl text-xs shadow-sm transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          Review Booking
        </button>
      </div>
    </div>
  );
}
