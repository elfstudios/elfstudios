"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Clock, Mail, Phone, RotateCcw, Search, Users, XCircle } from "lucide-react";

type Booking = {
  id: string; bandName: string | null; ticketNumber: string | null; attendees: number;
  date: string; slots: string[]; totalAmount: number; status: string; paymentStatus: string;
  equipmentRequests: string | null;
  order: { totalHours: number; freeHours: number } | null;
  user: { name: string | null; email: string | null; phone: string | null };
  history: { id: string; type: string; reason: string | null; createdAt: string }[];
};
const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 10));
const fmtHour = (hour: number) => `${hour % 12 || 12}:00 ${hour >= 12 ? "PM" : "AM"}`;
const slotLabel = (slot: string) => `${fmtHour(Number(slot))}–${fmtHour(Number(slot) + 1)}`;
const displayDate = (date: string) => new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(date));

export function AdminBookingsClient({ initialBookings }: { initialBookings: Booking[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("ALL");
  const [active, setActive] = useState<{ booking: Booking; action: "CANCEL" | "RESCHEDULE" } | null>(null);
  const [date, setDate] = useState("");
  const [slots, setSlots] = useState<string[]>([]);
  const [booked, setBooked] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const visible = useMemo(() => initialBookings.filter((booking) => {
    const text = `${booking.bandName} ${booking.ticketNumber} ${booking.user.name} ${booking.user.email} ${booking.user.phone}`.toLowerCase();
    return (status === "ALL" || booking.status === status) && text.includes(query.toLowerCase());
  }), [initialBookings, query, status]);

  function open(booking: Booking, action: "CANCEL" | "RESCHEDULE") {
    setActive({ booking, action }); setDate(""); setSlots([]); setBooked([]); setReason(""); setError("");
  }
  async function loadAvailability(value: string) {
    setDate(value); setSlots([]); setBooked([]);
    if (!value) return;
    const response = await fetch(`/api/bookings?date=${value}`, { cache: "no-store" });
    if (response.ok) {
      const data = await response.json();
      setBooked(data.bookings.flatMap((item: { id: string; slots: string[] }) => item.id === active?.booking.id ? [] : item.slots));
    }
  }
  async function submit() {
    if (!active) return;
    setSubmitting(true); setError("");
    const response = await fetch(`/api/admin/bookings/${active.booking.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: active.action, reason, requestedDate: date, requestedSlots: slots }),
    });
    const data = await response.json(); setSubmitting(false);
    if (!response.ok) return setError(data.error || "Unable to update booking.");
    setActive(null); router.refresh();
  }

  return (
    <div className="space-y-6">
      <div><h1 className="text-3xl font-black uppercase tracking-tighter">Manage Bookings</h1><p className="mt-2 text-gray-500">Cancel or reschedule any session. Customers are notified by email.</p></div>
      <div className="flex flex-col gap-3 rounded-2xl border bg-white p-4 sm:flex-row">
        <label className="relative flex-1"><Search className="absolute left-3 top-3 h-5 w-5 text-gray-400"/><span className="sr-only">Search bookings</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search band, ticket, email or phone" className="h-11 w-full rounded-xl border pl-10 pr-3 text-sm"/></label>
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="h-11 rounded-xl border px-3 text-sm"><option value="ALL">All statuses</option><option>CONFIRMED</option><option>PENDING</option><option>CANCELLED</option></select>
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {visible.map((booking) => (
          <article key={booking.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-widest text-orange-600">{booking.ticketNumber || "No ticket"}</p><h2 className="mt-1 text-xl font-black">{booking.bandName || "Unknown band"}</h2><p className="text-sm text-gray-500">{booking.user.name || booking.user.email}</p></div><span className={`rounded-full px-3 py-1 text-[10px] font-bold ${booking.status === "CONFIRMED" ? "bg-green-100 text-green-700" : booking.status === "CANCELLED" ? "bg-red-100 text-red-700" : "bg-yellow-100 text-yellow-700"}`}>{booking.status}</span></div>
            <div className="mt-5 grid gap-3 text-sm text-gray-600 sm:grid-cols-2">
              <p className="flex gap-2"><CalendarDays className="h-4 w-4 text-orange-500"/>{displayDate(booking.date)}</p><p className="flex gap-2"><Clock className="h-4 w-4 text-orange-500"/>{booking.slots.map(slotLabel).join(", ")}</p><p className="flex gap-2"><Users className="h-4 w-4 text-orange-500"/>{booking.attendees} · ₹{booking.totalAmount.toLocaleString("en-IN")}</p><p className="flex gap-2"><Phone className="h-4 w-4 text-orange-500"/>{booking.user.phone || "No phone"}</p><p className="flex gap-2 sm:col-span-2"><Mail className="h-4 w-4 text-orange-500"/>{booking.user.email || "No email"}</p>
            </div>
            {booking.order && <p className="mt-4 rounded-xl bg-orange-50 px-3 py-2 text-xs font-medium text-orange-800">Cart checkout · {booking.order.totalHours} total hour{booking.order.totalHours === 1 ? "" : "s"}{booking.order.freeHours ? ` · ${booking.order.freeHours} loyalty free hour${booking.order.freeHours === 1 ? "" : "s"}` : ""}</p>}
            {booking.status === "CONFIRMED" && <div className="mt-5 grid grid-cols-2 gap-3"><button onClick={() => open(booking, "RESCHEDULE")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-black text-xs font-bold text-white"><RotateCcw className="h-4 w-4"/>Reschedule</button><button onClick={() => open(booking, "CANCEL")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-200 text-xs font-bold text-red-600"><XCircle className="h-4 w-4"/>Cancel</button></div>}
          </article>
        ))}
      </div>
      {visible.length === 0 && <div className="rounded-2xl border border-dashed p-10 text-center text-gray-500">No matching bookings.</div>}

      {active && <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center sm:p-4"><div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl sm:p-7">
        <div className="flex justify-between gap-4"><div><p className="text-xs uppercase tracking-widest text-orange-600">{active.booking.ticketNumber}</p><h2 className="text-2xl font-black">{active.action === "CANCEL" ? "Cancel booking" : "Reschedule booking"}</h2></div><button onClick={() => setActive(null)} aria-label="Close" className="h-11 w-11 rounded-full bg-gray-100 text-2xl">×</button></div>
        {active.action === "RESCHEDULE" && <div className="mt-6 space-y-4"><label className="block text-xs font-bold uppercase tracking-widest text-gray-500">New date<input type="date" value={date} min={new Date().toISOString().slice(0,10)} onChange={(event) => loadAvailability(event.target.value)} className="mt-2 h-12 w-full rounded-xl border px-3 text-base font-normal text-black"/></label><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{HOURS.map((slot) => {const unavailable=booked.includes(slot);const selected=slots.includes(slot);return <button type="button" key={slot} disabled={!date || unavailable} onClick={() => setSlots((current) => selected ? current.filter((item) => item !== slot) : current.length < active.booking.slots.length ? [...current,slot] : current)} className={`min-h-12 rounded-xl border text-xs ${unavailable ? "bg-red-50 text-red-300" : selected ? "bg-black text-white" : "bg-white"}`}>{slotLabel(slot)}{unavailable && <span className="block text-[9px]">Booked</span>}</button>})}</div><p className="text-xs text-gray-500">Select exactly {active.booking.slots.length} hour(s).</p></div>}
        <label className="mt-6 block text-xs font-bold uppercase tracking-widest text-gray-500">Reason / note<textarea value={reason} onChange={(event) => setReason(event.target.value)} className="mt-2 min-h-24 w-full rounded-xl border p-3 text-base font-normal text-black"/></label>
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        <div className="mt-6 flex gap-3"><button onClick={() => setActive(null)} className="min-h-12 flex-1 rounded-xl border">Back</button><button disabled={submitting || (active.action === "RESCHEDULE" && (!date || slots.length !== active.booking.slots.length))} onClick={submit} className={`min-h-12 flex-[2] rounded-xl font-bold text-white disabled:opacity-40 ${active.action === "CANCEL" ? "bg-red-600" : "bg-black"}`}>{submitting ? "Saving…" : active.action === "CANCEL" ? "Confirm cancellation" : "Confirm reschedule"}</button></div>
      </div></div>}
    </div>
  );
}
