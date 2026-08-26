"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Ban, CalendarDays, Loader2, Trash2 } from "lucide-react";

type CalendarBlock = {
  id: string;
  date: string;
  slots: string[];
  note: string | null;
  googleCalendarEventId: string | null;
  googleCalendarSyncedAt: string | null;
};

type Props = { initialBlocks: CalendarBlock[] };

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 11));

function todayKey() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  return new Date(now.getTime() - offset * 60_000).toISOString().slice(0, 10);
}

function slotLabel(slot: string) {
  const hour = Number(slot);
  const display = hour > 12 ? hour - 12 : hour;
  return `${display} ${hour >= 12 ? "PM" : "AM"}`;
}

function dateLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(value));
}

function isWholeDay(slots: string[]) {
  return slots.length === HOURS.length && HOURS.every((slot) => slots.includes(slot));
}

export function CalendarBlocksManager({ initialBlocks }: Props) {
  const router = useRouter();
  const [date, setDate] = useState(todayKey());
  const [slots, setSlots] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const upcomingBlocks = useMemo(
    () => [...initialBlocks].sort((a, b) => a.date.localeCompare(b.date)),
    [initialBlocks],
  );

  function toggleSlot(slot: string) {
    setSlots((selected) => selected.includes(slot)
      ? selected.filter((value) => value !== slot)
      : [...selected, slot].sort((a, b) => Number(a) - Number(b)));
  }

  async function saveBlock(wholeDay: boolean) {
    setMessage("");
    setError("");
    if (!wholeDay && !slots.length) {
      setError("Select at least one time slot.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/admin/calendar-blocks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          slots: wholeDay ? HOURS : slots,
          note: wholeDay && !note.trim() ? "Holiday" : note,
          wholeDay,
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to block the selected slots.");

      setSlots([]);
      setNote("");
      const subject = wholeDay ? "Full day" : "Slots";
      setMessage(payload.calendar?.synced
        ? `${subject} blocked and added to Google Calendar.`
        : `${subject} blocked in the booking system. Google Calendar was not updated${payload.calendar?.reason ? `: ${payload.calendar.reason}` : "."}`);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to block the selected slots.");
    } finally {
      setSaving(false);
    }
  }

  async function blockSlots(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveBlock(false);
  }

  async function removeBlock(id: string) {
    setMessage("");
    setError("");
    setDeleting(id);
    try {
      const response = await fetch(`/api/admin/calendar-blocks/${id}`, { method: "DELETE" });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || "Unable to remove the block.");
      setMessage(payload.calendar?.synced
        ? "Block removed from bookings and Google Calendar."
        : "Block removed from the booking system. Google Calendar could not be updated.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to remove the block.");
    } finally {
      setDeleting(null);
    }
  }

  return (
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(320px,0.7fr)]">
      <form onSubmit={blockSlots} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-red-50 p-2 text-red-600"><Ban size={19} /></div>
          <div>
            <h2 className="font-display text-xl font-black uppercase tracking-tight">Block studio slots</h2>
            <p className="mt-1 text-sm text-gray-500">Block individual sessions or mark a full date as a holiday. Both sync to Google Calendar.</p>
          </div>
        </div>

        <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-gray-600">
          Date
          <input
            type="date"
            value={date}
            min={todayKey()}
            onChange={(event) => setDate(event.target.value)}
            className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-black outline-none transition focus:border-black"
            required
          />
        </label>

        <div className="mt-5">
          <p className="text-xs font-bold uppercase tracking-wider text-gray-600">Slots</p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
            {HOURS.map((slot) => {
              const selected = slots.includes(slot);
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => toggleSlot(slot)}
                  className={`rounded-lg border px-2 py-2 text-xs font-bold transition ${selected ? "border-red-600 bg-red-600 text-white" : "border-gray-200 bg-white text-gray-700 hover:border-red-300"}`}
                >
                  {slotLabel(slot)}
                </button>
              );
            })}
          </div>
        </div>

        <label className="mt-5 block text-xs font-bold uppercase tracking-wider text-gray-600">
          Note <span className="font-normal normal-case text-gray-400">(optional)</span>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={500}
            placeholder="e.g. Artist rehearsal / maintenance"
            className="mt-2 block w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-black outline-none transition placeholder:text-gray-400 focus:border-black"
          />
        </label>

        {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {message && <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}

        <div className="mt-5 flex flex-wrap gap-3">
          <button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-black px-4 py-2.5 text-sm font-bold text-white transition hover:bg-elf-orange disabled:cursor-not-allowed disabled:opacity-60">
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Ban size={16} />}
            {saving ? "Blocking…" : "Block selected slots"}
          </button>
          <button
            type="button"
            onClick={() => saveBlock(true)}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:border-red-400 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <CalendarDays size={16} />}
            Block entire day (holiday)
          </button>
        </div>
      </form>

      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-gray-100 p-2 text-black"><CalendarDays size={19} /></div>
          <div>
            <h2 className="font-display text-xl font-black uppercase tracking-tight">Upcoming blocks</h2>
            <p className="mt-1 text-sm text-gray-500">{upcomingBlocks.length ? `${upcomingBlocks.length} active block${upcomingBlocks.length === 1 ? "" : "s"}` : "No slots are manually blocked."}</p>
          </div>
        </div>

        <div className="mt-5 max-h-[360px] space-y-3 overflow-y-auto pr-1">
          {upcomingBlocks.map((block) => (
            <div key={block.id} className="rounded-xl border border-red-100 bg-red-50/50 p-3">
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-black">{dateLabel(block.date)}</p>
                  <p className="mt-1 text-xs font-semibold text-red-700">{isWholeDay(block.slots) ? "Entire day — Holiday" : block.slots.map(slotLabel).join(", ")}</p>
                  {block.note && <p className="mt-1 text-xs text-gray-600">{block.note}</p>}
                  <p className="mt-2 text-[11px] text-gray-500">{block.googleCalendarEventId ? "Google Calendar synced" : "Google Calendar not synced"}</p>
                </div>
                <button
                  type="button"
                  aria-label={`Remove block on ${dateLabel(block.date)}`}
                  onClick={() => removeBlock(block.id)}
                  disabled={deleting === block.id}
                  className="self-start rounded-lg p-2 text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                >
                  {deleting === block.id ? <Loader2 size={17} className="animate-spin" /> : <Trash2 size={17} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </section>
  );
}
