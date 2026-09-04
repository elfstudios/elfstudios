"use client";

import React, { useState } from "react";
import { Step1AttendeeCount } from "./Step1AttendeeCount";
import { Step2DateTime } from "./Step2DateTime";
import { Step4Details } from "./Step4Details";
import { Step5Summary } from "./Step5Summary";
import Image from "next/image";

export type CartSession = { date: Date; slots: string[] };

export function BookingFlow() {
  const [step, setStep] = useState(1);
  const [attendees, setAttendees] = useState(0);
  const [date, setDate] = useState<Date | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [sessions, setSessions] = useState<CartSession[]>([]);
  const [bandName, setBandName] = useState("");
  const [equipmentRequests, setEquipmentRequests] = useState("");
  
  const handleNext = () => setStep((s) => Math.min(s + 1, 4));
  const handleBack = () => setStep((s) => Math.max(s - 1, 1));
  const addSession = (sessionDate: Date, slots: string[]) => {
    setSessions((current) => {
      const key = sessionDate.toISOString().slice(0, 10);
      const existing = current.find((session) => session.date.toISOString().slice(0, 10) === key);
      if (existing) {
        return current.map((session) => session === existing
          ? { ...session, slots: [...new Set([...session.slots, ...slots])].sort((a, b) => Number(a) - Number(b)) }
          : session,
        );
      }
      return [...current, { date: sessionDate, slots: [...slots].sort((a, b) => Number(a) - Number(b)) }]
        .sort((a, b) => a.date.getTime() - b.date.getTime());
    });
    setSelectedSlots([]);
  };
  const removeSession = (sessionDate: Date) => {
    const key = sessionDate.toISOString().slice(0, 10);
    setSessions((current) => current.filter((session) => session.date.toISOString().slice(0, 10) !== key));
  };

  const steps = ["Attendees", "Date & Time", "Details", "Checkout"];

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col relative z-10 h-full min-h-0 items-center justify-center">
      
      {/* BACKGROUND LAYER (Step 1 Always Renders Here) */}
      <div 
        className={`w-full max-w-2xl mx-auto flex flex-col transition-all duration-700 ease-in-out ${
          step > 1 ? 'blur-md opacity-40 pointer-events-none scale-[0.98]' : 'scale-100 opacity-100'
        }`}
      >
        {/* Step 1 Header on the Base Page */}
        <div className="text-center flex flex-col items-center space-y-2 mb-12 w-full shrink-0 mt-8">
          <h1 className="text-2xl md:text-3xl font-display font-semibold tracking-[0.2em] uppercase text-white drop-shadow-sm">
            Book Session
          </h1>
          <p className="text-white/40 font-mono text-[10px] md:text-xs uppercase tracking-[0.3em] mt-3">
            Start by telling us who’s jamming.
          </p>
        </div>

        <Step1AttendeeCount 
          attendees={attendees} 
          setAttendees={setAttendees} 
          onNext={handleNext} 
        />
      </div>

      {/* POPUP OVERLAY (Steps 2, 3, 4) */}
      {step > 1 && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/60 backdrop-blur-sm animate-in fade-in duration-500">
          
          <div className="bg-[#1E1E1E] border border-white/10 p-6 md:p-10 w-full max-w-5xl rounded-[2rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-500">
            
            {/* Modal Header & Tracker */}
            <div className="text-center flex flex-col items-center space-y-2 mb-6 w-full shrink-0">
              <Image 
                src="/assets/ELF JAMPAD black.png" 
                alt="Elf Jampad Logo" 
                width={80} 
                height={26} 
                className="mb-2 object-contain mx-auto invert opacity-70"
              />
              <div className="flex gap-2 w-full max-w-[300px] mx-auto mt-4">
                {steps.map((label, index) => {
                  const stepNum = index + 1;
                  const isActive = step === stepNum;
                  const isDone = step > stepNum;
                  
                  return (
                    <div 
                      key={stepNum} 
                      className={`flex-1 h-1 rounded-full transition-all duration-500 shadow-sm ${
                        isActive ? "bg-white shadow-white/20" : isDone ? "bg-white/40" : "bg-white/10"
                      }`}
                      title={label}
                    />
                  );
                })}
              </div>
            </div>

            {/* Modal Scrollable Content Wrapper */}
            <div className={`flex-1 w-full min-h-0 overflow-y-auto custom-scrollbar text-sm pb-4 px-2 ${step !== 2 ? 'max-w-xl mx-auto' : ''}`}>
              {step === 2 && (
                <Step2DateTime 
                  onNext={handleNext} 
                  onBack={handleBack} 
                  date={date}
                  setDate={setDate}
                  selectedSlots={selectedSlots}
                  setSelectedSlots={setSelectedSlots}
                  sessions={sessions}
                  onAddSession={addSession}
                  onRemoveSession={removeSession}
                />
              )}

              {step === 3 && (
                <Step4Details 
                  onNext={handleNext} 
                  onBack={handleBack} 
                  bandName={bandName}
                  setBandName={setBandName}
                  equipmentRequests={equipmentRequests}
                  setEquipmentRequests={setEquipmentRequests}
                />
              )}
              
              {step === 4 && (
                <Step5Summary 
                  attendees={attendees} 
                  date={date}
                  slots={selectedSlots}
                  sessions={sessions}
                  bandName={bandName}
                  equipmentRequests={equipmentRequests}
                  onNext={() => {}} // Will be handled inside Step5Summary
                  onBack={handleBack} 
                  onCancel={() => window.location.href = "https://www.elfstudios.in/elf-jampad"} 
                />
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
