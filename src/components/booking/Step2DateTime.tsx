import React, { useState, useEffect, useMemo } from "react";
import { 
  format, 
  addMonths, 
  subMonths, 
  startOfMonth, 
  endOfMonth, 
  startOfWeek, 
  endOfWeek, 
  eachDayOfInterval, 
  isSameMonth, 
  isSameDay, 
  isToday,
  isBefore,
  startOfDay
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { CartSession } from "./BookingFlow";

interface Step2Props {
  onNext: () => void;
  onBack: () => void;
  date: Date | null;
  setDate: (date: Date) => void;
  selectedSlots: string[];
  setSelectedSlots: (slots: string[]) => void;
  sessions: CartSession[];
  onAddSession: (date: Date, slots: string[]) => void;
  onRemoveSession: (date: Date) => void;
}

export function Step2DateTime({ 
  onNext, 
  onBack, 
  date, 
  setDate, 
  selectedSlots, 
  setSelectedSlots,
  sessions,
  onAddSession,
  onRemoveSession,
}: Step2Props) {
  const [currentMonth, setCurrentMonth] = useState<Date>(date ? startOfMonth(date) : startOfMonth(new Date()));
  const [bookedSlots, setBookedSlots] = useState<Record<string, string>>({}); // slotId -> bandName
  const [isLoading, setIsLoading] = useState(false);

  // Stable reference for today's date to prevent infinite useEffect loops
  const today = useMemo(() => startOfDay(new Date()), []);
  const defaultDate = useMemo(() => {
    if (today.getDay() === 1) {
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return tomorrow;
    }
    return today;
  }, [today]);
  const activeDate = date || defaultDate;

  useEffect(() => {
    async function fetchBookings() {
      setIsLoading(true);
      setBookedSlots({}); // Instantly clear previous date's slots while fetching new ones
      try {
        const dateStr = format(activeDate, "yyyy-MM-dd");
        const res = await fetch(`/api/bookings?date=${dateStr}`);
        if (!res.ok) throw new Error("Failed to fetch bookings");
        
        const data = await res.json();
        
        const newBookedSlots: Record<string, string> = {};
        data.bookings.forEach((booking: any) => {
          booking.slots.forEach((slotId: string) => {
            newBookedSlots[slotId] = booking.bandName || booking.user?.bandName || "Booked";
          });
        });
        
        setBookedSlots(newBookedSlots);
      } catch (err) {
        console.error("Error fetching bookings:", err);
      } finally {
        setIsLoading(false);
      }
    }
    
    fetchBookings();
  }, [activeDate]);

  // Generate 12 slots from 11 AM to 11 PM
  const timeSlots = useMemo(() => {
    const slots = [];
    for (let i = 11; i < 23; i++) {
      const ampm1 = i >= 12 && i < 24 ? "PM" : "AM";
      const ampm2 = (i + 1) >= 12 && (i + 1) < 24 ? "PM" : "AM";
      const hour1 = i > 12 ? i - 12 : i;
      const hour2 = (i + 1) > 12 ? (i + 1) - 12 : (i + 1);
      
      const id = `${i}`;
      const isBooked = !!bookedSlots[id];
      
      slots.push({
        id,
        time: `${hour1}:00 ${ampm1} - ${hour2}:00 ${ampm2}`,
        status: isBooked ? "BOOKED" : "AVAILABLE",
        bandName: bookedSlots[id]
      });
    }
    return slots;
  }, [bookedSlots]); 

  const handlePrevMonth = () => setCurrentMonth(subMonths(currentMonth, 1));
  const handleNextMonth = () => setCurrentMonth(addMonths(currentMonth, 1));

  const toggleSlot = (id: string) => {
    setSelectedSlots(
      selectedSlots.includes(id) 
        ? selectedSlots.filter(slot => slot !== id) 
        : [...selectedSlots, id]
    );
  };

  const isPastSlotToday = (slotId: string) => {
    if (!isSameDay(activeDate, new Date())) return false;
    return Number(slotId) <= new Date().getHours();
  };

  const handleDateSelect = (d: Date) => {
    setDate(d);
    setSelectedSlots([]); // Reset slots when date changes
  };

  const handleContinue = () => {
    if (selectedSlots.length) {
      const selectedDate = date || activeDate;
      if (!date) setDate(selectedDate);
      onAddSession(selectedDate, selectedSlots);
    }
    onNext();
  };

  const handleAddSession = () => {
    const selectedDate = date || activeDate;
    if (!date) setDate(selectedDate);
    onAddSession(selectedDate, selectedSlots);
  };

  // Calendar logic
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  
  const dateFormat = "d";
  const days = eachDayOfInterval({ start: startDate, end: endDate });
  const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <h2 className="text-[11px] font-mono uppercase tracking-widest text-white/50 drop-shadow-md">
          Step 2
        </h2>
        <h3 className="font-display font-black text-2xl uppercase text-white tracking-wide">
          Select Date & Time
        </h3>
        <p className="font-sans text-[13px] text-white/60 font-light">
          Pick a date from the calendar and choose available 1-hour slots.
        </p>
      </div>

      {sessions.length > 0 && (
        <div className="rounded-xl border border-elf-orange/30 bg-elf-orange/10 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-mono text-[10px] uppercase tracking-widest text-elf-orange">Checkout cart</p>
              <p className="mt-1 text-xs text-white/60">{sessions.length} date{sessions.length === 1 ? "" : "s"} · {sessions.reduce((total, session) => total + session.slots.length, 0)} hour(s) added</p>
            </div>
            <span className="rounded-full bg-elf-orange px-3 py-1 font-mono text-[10px] font-bold text-black">ONE CHECKOUT</span>
          </div>
          <div className="mt-3 space-y-2">
            {sessions.map((session) => (
              <div key={session.date.toISOString()} className="flex items-center justify-between gap-3 rounded-lg bg-black/25 px-3 py-2">
                <span className="text-xs text-white"><strong>{format(session.date, "EEE, MMM d")}</strong><span className="text-white/50"> · {session.slots.length} hr{session.slots.length === 1 ? "" : "s"}</span></span>
                <button type="button" onClick={() => onRemoveSession(session.date)} className="font-mono text-[10px] uppercase tracking-widest text-white/50 hover:text-red-300">Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 lg:gap-12 w-full">
        
        {/* Calendar Column */}
        <div className="w-full lg:w-[350px] shrink-0 border border-white/10 rounded-xl p-4 bg-white/5 backdrop-blur-md shadow-inner">
          <div className="flex items-center justify-between mb-4">
            <button onClick={handlePrevMonth} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <ChevronLeft size={16} className="text-white/70" />
            </button>
            <span className="font-mono text-xs uppercase tracking-widest font-bold text-white">
              {format(currentMonth, "MMMM yyyy")}
            </span>
            <button onClick={handleNextMonth} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
              <ChevronRight size={16} className="text-white/70" />
            </button>
          </div>
          
          <div className="grid grid-cols-7 gap-1 text-center mb-2">
            {weekDays.map(day => (
              <div key={day} className="text-[9px] font-mono uppercase tracking-widest text-white/40">
                {day}
              </div>
            ))}
          </div>
          
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              const isSelected = isSameDay(day, activeDate);
              const isPast = isBefore(day, today);
              const isMonday = day.getDay() === 1;
              const isCurrentMonth = isSameMonth(day, monthStart);
              const isDisabled = isPast || isMonday;
              
              return (
                <button
                  key={idx}
                  onClick={() => !isDisabled && handleDateSelect(day)}
                  disabled={isDisabled}
                  className={`
                    h-8 flex items-center justify-center rounded-lg text-[13px] font-sans transition-all
                    ${!isCurrentMonth ? "text-white/30" : ""}
                    ${isDisabled ? "text-white/20 cursor-not-allowed opacity-50" : "hover:border-white hover:bg-white/10 border border-transparent"}
                    ${isSelected ? "bg-white text-black font-bold shadow-sm" : "text-white"}
                    ${isToday(day) && !isSelected ? "text-white/70 font-bold" : ""}
                  `}
                >
                  {format(day, dateFormat)}
                </button>
              );
            })}
          </div>
        </div>

        {/* Slots Column */}
        <div className="flex-1">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <span className="font-mono text-[10px] uppercase tracking-widest text-white/50 block">
                Available slots for
              </span>
              <div className="font-display text-lg text-white font-black uppercase">
                {format(activeDate, "EEEE, MMMM d")}
              </div>
            </div>
            {isLoading && (
              <div className="text-[10px] font-mono uppercase tracking-widest text-white/50 animate-pulse">
                Loading...
              </div>
            )}
          </div>
          
          {activeDate.getDay() === 1 ? (
            <div className="h-[200px] flex items-center justify-center border border-white/10 rounded-xl bg-white/5 backdrop-blur-sm text-center p-6">
              <div>
                <p className="font-display text-xl text-white font-bold uppercase tracking-widest">Studio Closed</p>
                <p className="font-sans text-[13px] text-white/50 mt-2">Mondays are our day off. Please select another date.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
              {timeSlots.map((slot) => (
                <button
                  type="button"
                  key={slot.id}
                  disabled={isLoading || slot.status === "BOOKED" || isPastSlotToday(slot.id)}
                  onClick={() => toggleSlot(slot.id)}
                  className={`py-3 px-2 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all duration-200 border backdrop-blur-sm relative overflow-hidden
                    ${
                      slot.status === "BOOKED" || isPastSlotToday(slot.id)
                        ? "border-red-500/20 bg-red-500/10 cursor-not-allowed opacity-80"
                        : isLoading
                        ? "border-white/5 bg-white/5 opacity-50 cursor-wait"
                        : selectedSlots.includes(slot.id)
                        ? "border-white bg-white text-black shadow-sm scale-[0.98]"
                        : "border-white/10 hover:border-white/50 bg-white/5 text-white hover:bg-white/10 shadow-sm"
                    }
                  `}
                >
                  <span className={`font-mono font-bold tracking-tight mb-1 text-[11px] whitespace-nowrap z-10 ${slot.status === "BOOKED" ? "text-white/50" : ""}`}>{slot.time}</span>
                  {slot.status === "BOOKED" || isPastSlotToday(slot.id) ? (
                    <span className="text-[10px] font-bold uppercase tracking-widest text-red-400/90 z-10 text-center px-1">
                      {isPastSlotToday(slot.id) ? "Passed" : slot.bandName || "Booked"}
                    </span>
                  ) : (
                    <span className={`text-[9px] uppercase tracking-widest z-10 ${selectedSlots.includes(slot.id) ? 'text-black/70' : 'text-white/60 font-bold'}`}>Available</span>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-4 items-center">
        <button 
          onClick={onBack}
          className="h-[50px] px-8 bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 hover:text-white font-bold tracking-widest uppercase transition-colors rounded-xl text-xs"
        >
          Back
        </button>
        <div className="flex-1 text-center font-mono text-[10px] text-white/50 uppercase tracking-widest">
          {selectedSlots.length ? `${selectedSlots.length} hr(s) ready to add` : sessions.length ? "Add another date or continue" : "Choose your first session"}
        </div>
        <button
          onClick={handleAddSession}
          disabled={selectedSlots.length === 0}
          className="h-[50px] px-5 bg-elf-orange/15 text-elf-orange border border-elf-orange/40 hover:bg-elf-orange hover:text-black font-bold tracking-widest uppercase transition-all rounded-xl text-[10px] disabled:opacity-40"
        >
          Add to cart
        </button>
        <button 
          onClick={handleContinue} 
          disabled={selectedSlots.length === 0 && sessions.length === 0}
          className="h-[50px] px-8 bg-white text-black hover:bg-white/90 font-bold tracking-widest uppercase transition-all rounded-xl text-xs shadow-sm transform hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {sessions.length ? "Continue" : "Add & continue"}
        </button>
      </div>
    </div>
  );
}
