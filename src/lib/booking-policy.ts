const DEFAULT_CHANGE_CUTOFF_HOURS = 48;
const DEFAULT_RESCHEDULE_EXTENSION_DAYS = 7;
const DEFAULT_PENDING_HOLD_MINUTES = 15;

export const BOOKING_POLICY = {
  changeCutoffHours: readPositiveInt(
    process.env.BOOKING_CHANGE_CUTOFF_HOURS,
    DEFAULT_CHANGE_CUTOFF_HOURS,
  ),
  rescheduleExtensionDays: readPositiveInt(
    process.env.RESCHEDULE_EXTENSION_DAYS,
    DEFAULT_RESCHEDULE_EXTENSION_DAYS,
  ),
  pendingHoldMinutes: readPositiveInt(
    process.env.PENDING_BOOKING_HOLD_MINUTES,
    DEFAULT_PENDING_HOLD_MINUTES,
  ),
  openingHour: 11,
  closingHour: 23,
  maxAttendees: 10,
} as const;

function readPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export type PriceBreakdown = {
  pricePerHourPaise: number;
  subtotalPaise: number;
  discountPaise: number;
  totalPaise: number;
  freeHours: number;
  billableHours: number;
};

export function calculatePrice(attendees: number, hours: number): PriceBreakdown {
  if (!Number.isInteger(attendees) || attendees < 1 || attendees > BOOKING_POLICY.maxAttendees) {
    throw new Error(`Attendees must be between 1 and ${BOOKING_POLICY.maxAttendees}.`);
  }
  if (!Number.isInteger(hours) || hours < 1 || hours > 120) {
    throw new Error("Select between 1 and 120 hours.");
  }

  const pricePerHourPaise = (attendees <= 6 ? 400 : 700) * 100;
  const subtotalPaise = pricePerHourPaise * hours;
  // Loyalty applies to the whole checkout: every ten booked hours earns one
  // free hour. This deliberately works across dates when customers use cart
  // checkout rather than requiring ten consecutive hours in one session.
  const freeHours = Math.floor(hours / 10);
  const billableHours = hours - freeHours;
  const discountPaise = pricePerHourPaise * freeHours;

  return {
    pricePerHourPaise,
    subtotalPaise,
    discountPaise,
    totalPaise: subtotalPaise - discountPaise,
    freeHours,
    billableHours,
  };
}

export function validateSlots(slots: unknown): string[] {
  if (!Array.isArray(slots) || slots.length === 0) {
    throw new Error("Select at least one time slot.");
  }

  const normalized = [...new Set(slots.map(String))].sort((a, b) => Number(a) - Number(b));
  if (normalized.length !== slots.length) {
    throw new Error("Duplicate time slots are not allowed.");
  }

  for (const slot of normalized) {
    const hour = Number(slot);
    if (!Number.isInteger(hour) || hour < BOOKING_POLICY.openingHour || hour >= BOOKING_POLICY.closingHour) {
      throw new Error("One or more selected time slots are invalid.");
    }
  }
  return normalized;
}

export function normalizeBookingDate(input: unknown): Date {
  if (typeof input !== "string") throw new Error("A booking date is required.");
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input);
  if (!match) throw new Error("The booking date is invalid.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("The booking date is invalid.");
  }
  if (date.getUTCDay() === 1) {
    throw new Error("Mondays are closed. Please select another day.");
  }
  return date;
}

export function toDateKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function sessionStart(date: Date, slots: string[]): Date {
  const firstHour = Math.min(...slots.map(Number));
  // Booking dates are stored as UTC date-only values. Convert the selected IST hour to UTC.
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    firstHour - 6,
    30,
  ));
}

export function sessionEnd(date: Date, slots: string[]): Date {
  const lastHour = Math.max(...slots.map(Number)) + 1;
  // Booking dates are stored as UTC date-only values. Convert the selected IST hour to UTC.
  return new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    lastHour - 6,
    30,
  ));
}

export function canRequestCancellation(date: Date, slots: string[], now = new Date()) {
  const cutoff = new Date(sessionStart(date, slots).getTime() - BOOKING_POLICY.changeCutoffHours * 60 * 60 * 1000);
  return { allowed: now < cutoff, cutoff };
}

export function canRequestReschedule(date: Date, slots: string[], now = new Date()) {
  const cutoff = new Date(sessionStart(date, slots).getTime() - BOOKING_POLICY.changeCutoffHours * 60 * 60 * 1000);
  const latestDate = new Date(date.getTime() + BOOKING_POLICY.rescheduleExtensionDays * 24 * 60 * 60 * 1000);
  return { allowed: now < cutoff, cutoff, latestDate };
}

export function validateRescheduleTarget(originalDate: Date, requestedDate: Date, requestedSlots: string[], now = new Date()) {
  const latestDate = new Date(originalDate.getTime() + BOOKING_POLICY.rescheduleExtensionDays * 24 * 60 * 60 * 1000);
  if (requestedDate > latestDate) {
    throw new Error(`The new date must be within ${BOOKING_POLICY.rescheduleExtensionDays} days after the original session.`);
  }
  if (sessionStart(requestedDate, requestedSlots) <= now) {
    throw new Error("The new session time must be in the future.");
  }
}

export function formatRupees(paise: number) {
  return paise / 100;
}
