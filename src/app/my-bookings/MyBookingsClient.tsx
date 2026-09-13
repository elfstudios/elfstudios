"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { CalendarDays, Clock, Coins, Music2, RotateCcw } from "lucide-react";

type ChangeRequest = {
  id: string;
  type: string;
  status: string;
  reason: string | null;
  requestedDate: string | null;
  requestedSlots: string[];
  adminNote: string | null;
  createdAt: string;
};

type Booking = {
  id: string;
  bandName: string | null;
  bookingName: string | null;
  ticketNumber: string | null;
  attendees: number;
  date: string;
  originalDate: string;
  slots: string[];
  totalAmount: number;
  status: string;
  paymentStatus: string;
  createdAt: string;
  changeRequests: ChangeRequest[];
};

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 10));

function dateKey(value: string) {
  return value.slice(0, 10);
}

function displayDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "full", timeZone: "UTC" }).format(new Date(value));
}

function slotLabel(slot: string) {
  const hour = Number(slot);
  const end = hour + 1;
  const fmt = (value: number) => `${value % 12 || 12}:00 ${value >= 12 ? "PM" : "AM"}`;
  return `${fmt(hour)}–${fmt(end)}`;
}

export function MyBookingsClient({ initialBookings, email, policy }: {
  initialBookings: Booking[];
  email: string;
  policy: { cutoffHours: number; extensionDays: number };
}) {
  const router = useRouter();
  const supabase = createClient();
  const [active, setActive] = useState<{ id: string; type: "RESCHEDULE" } | null>(null);
  const [reason, setReason] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newSlots, setNewSlots] = useState<string[]>([]);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedBooking = useMemo(
    () => initialBookings.find((booking) => booking.id === active?.id),
    [active, initialBookings],
  );

  async function loadAvailability(value: string) {
    setNewDate(value);
    setNewSlots([]);
    setBookedSlots([]);
    if (!value) return;
    const response = await fetch(`/api/bookings?date=${value}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setBookedSlots(data.bookings.flatMap((booking: { id: string; slots: string[] }) => booking.id === active?.id ? [] : booking.slots));
    }
  }

  function openRequest(id: string) {
    setActive({ id, type: "RESCHEDULE" });
    setReason("");
    setNewDate("");
    setNewSlots([]);
    setError("");
    setMessage("");
  }

  async function submitRequest() {
    if (!active) return;
    setSubmitting(true);
    setError("");
    const response = await fetch(`/api/my-bookings/${active.id}/requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: active.type,
        reason,
        requestedDate: newDate,
        requestedSlots: newSlots,
      }),
    });
    const data = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      setError(data.error || "Unable to submit request.");
      return;
    }
    setMessage("Your booking was rescheduled successfully.");
    setActive(null);
    router.refresh();
  }

  async function logout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <main className="min-h-screen bg-[#111] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-black/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-orange-400">Elf Jampad</p>
            <h1 className="text-xl font-black uppercase tracking-tight">My Bookings</h1>
          </div>
          <nav className="flex items-center gap-2 text-xs">
            <Link href="/book" className="rounded-lg border border-white/15 px-3 py-2.5 hover:bg-white/10">Book session</Link>
            <Link href="/wallet" className="inline-flex items-center gap-1 rounded-lg border border-orange-400/50 bg-orange-400/10 px-3 py-2.5 font-bold text-orange-200 hover:bg-orange-400/20"><Coins className="h-3.5 w-3.5"/>Wallet</Link>
            <button onClick={logout} className="rounded-lg px-3 py-2.5 text-white/60 hover:text-white">Logout</button>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <div className="mb-8 rounded-2xl border border-orange-400/20 bg-orange-400/10 p-4 text-sm text-orange-100">
          You may reschedule instantly until <strong>{policy.cutoffHours} hours</strong> before your session. A new date may be up to <strong>{policy.extensionDays} days after</strong> the original date. Customer cancellation is not available and payments are non-refundable.
        </div>
        {message && <p role="status" className="mb-6 rounded-xl bg-green-500/15 p-4 text-sm text-green-300">{message}</p>}
        <p className="mb-6 text-sm text-white/50">Signed in as {email}</p>

        <div className="grid gap-5 lg:grid-cols-2">
          {initialBookings.length === 0 && (
            <div className="rounded-2xl border border-dashed border-white/20 p-10 text-center text-white/50 lg:col-span-2">
              No bookings yet. <Link href="/book" className="text-orange-400 underline">Book your first session</Link>.
            </div>
          )}
          {initialBookings.map((booking) => {
            const confirmed = booking.status === "CONFIRMED";
            return (
              <article key={booking.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-5 shadow-xl">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-orange-400">{booking.ticketNumber || "Booking"}</p>
                    <h2 className="mt-1 text-2xl font-black">{booking.bandName || "Jam Session"}</h2>
                    {booking.bookingName && <p className="mt-1 text-xs text-white/50">Booked by {booking.bookingName}</p>}
                  </div>
                  <span className={`rounded-full px-3 py-1 text-[10px] font-bold uppercase ${confirmed ? "bg-green-500/15 text-green-300" : booking.status === "CANCELLED" ? "bg-red-500/15 text-red-300" : "bg-yellow-500/15 text-yellow-200"}`}>{booking.status}</span>
                </div>
                <dl className="space-y-3 text-sm text-white/70">
                  <div className="flex gap-3"><CalendarDays className="h-5 w-5 text-orange-400"/><div><dt className="sr-only">Date</dt><dd>{displayDate(booking.date)}</dd></div></div>
                  <div className="flex gap-3"><Clock className="h-5 w-5 text-orange-400"/><div><dt className="sr-only">Time</dt><dd>{booking.slots.map(slotLabel).join(", ")}</dd></div></div>
                  <div className="flex gap-3"><Music2 className="h-5 w-5 text-orange-400"/><div><dt className="sr-only">Booking details</dt><dd>{booking.attendees} attendees · ₹{booking.totalAmount.toLocaleString("en-IN")}</dd></div></div>
                </dl>

                {confirmed && (
                  <div className="mt-6">
                    <button onClick={() => openRequest(booking.id)} className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white text-xs font-bold uppercase text-black hover:bg-orange-300"><RotateCcw className="h-4 w-4"/>Reschedule booking</button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>

      {active && selectedBooking && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/75 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="request-title">
          <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl border border-white/10 bg-[#1b1b1b] p-5 shadow-2xl sm:rounded-3xl sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs uppercase tracking-widest text-orange-400">{selectedBooking.ticketNumber}</p><h2 id="request-title" className="mt-1 text-2xl font-black">Reschedule booking</h2></div>
              <button onClick={() => setActive(null)} aria-label="Close" className="h-11 w-11 rounded-full bg-white/10 text-2xl">×</button>
            </div>

            {(
              <div className="mt-6 space-y-5">
                <div>
                  <label htmlFor="new-date" className="mb-2 block text-xs uppercase tracking-widest text-white/50">New date</label>
                  <input id="new-date" type="date" value={newDate} min={new Date().toISOString().slice(0, 10)} max={new Date(new Date(selectedBooking.originalDate).getTime() + policy.extensionDays * 86400000).toISOString().slice(0, 10)} onChange={(event) => loadAvailability(event.target.value)} className="h-12 w-full rounded-xl border border-white/15 bg-black px-4 text-white [color-scheme:dark]"/>
                </div>
                <fieldset>
                  <legend className="mb-2 text-xs uppercase tracking-widest text-white/50">Choose exactly {selectedBooking.slots.length} hour(s)</legend>
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {HOURS.map((slot) => {
                      const unavailable = bookedSlots.includes(slot);
                      const selected = newSlots.includes(slot);
                      return <button type="button" key={slot} disabled={!newDate || unavailable} onClick={() => setNewSlots((current) => selected ? current.filter((item) => item !== slot) : current.length < selectedBooking.slots.length ? [...current, slot] : current)} className={`min-h-12 rounded-xl border px-2 text-xs ${unavailable ? "cursor-not-allowed border-red-500/20 bg-red-500/10 text-red-300/50" : selected ? "border-white bg-white text-black" : "border-white/15 bg-white/5 text-white"}`}>{slotLabel(slot)}{unavailable && <span className="block text-[9px]">Booked</span>}</button>;
                    })}
                  </div>
                </fieldset>
              </div>
            )}

            <div className="mt-6">
              <label htmlFor="reason" className="mb-2 block text-xs uppercase tracking-widest text-white/50">Reason (optional)</label>
              <textarea id="reason" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} className="min-h-24 w-full rounded-xl border border-white/15 bg-black p-4 text-white" placeholder="Tell us anything the studio should know"/>
            </div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/15 p-3 text-sm text-red-300">{error}</p>}
            <div className="mt-6 flex gap-3">
              <button onClick={() => setActive(null)} className="min-h-12 flex-1 rounded-xl border border-white/15">Back</button>
              <button disabled={submitting || !newDate || newSlots.length !== selectedBooking.slots.length} onClick={submitRequest} className="min-h-12 flex-[2] rounded-xl bg-white font-bold text-black disabled:opacity-40">{submitting ? "Rescheduling…" : "Confirm reschedule"}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
