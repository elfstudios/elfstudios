import { prisma } from "@/lib/prisma";
import { BOOKING_POLICY, sessionEnd, sessionStart, toDateKey } from "@/lib/booking-policy";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const TIME_ZONE = "Asia/Kolkata";

type CalendarBooking = {
  id: string;
  attendees: number;
  date: Date;
  slots: string[];
  ticketNumber: string | null;
  bandName: string | null;
  equipmentRequests: string | null;
  totalAmount: number;
  status: string;
  paymentStatus: string;
  googleCalendarEventId: string | null;
  user: { name: string | null; email: string | null; phone: string | null };
};

type CalendarBlock = {
  id: string;
  date: Date;
  slots: string[];
  note: string | null;
  googleCalendarEventId: string | null;
};

type GoogleCalendarConfig = {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  calendarId: string;
};

function calendarConfig(): GoogleCalendarConfig | null {
  const clientId = process.env.GOOGLE_CALENDAR_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CALENDAR_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_CALENDAR_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  return {
    clientId,
    clientSecret,
    refreshToken,
    calendarId: process.env.GOOGLE_CALENDAR_ID || "primary",
  };
}

export function isGoogleCalendarConfigured() {
  return calendarConfig() !== null;
}

async function accessToken(config: GoogleCalendarConfig) {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const payload = await response.json().catch(() => null) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  } | null;
  if (!response.ok || !payload?.access_token) {
    const reason = [payload?.error, payload?.error_description].filter(Boolean).join(": ");
    throw new Error(
      `Google Calendar authorization failed (${response.status})${reason ? `: ${reason}` : ""}.`,
    );
  }
  return payload.access_token;
}

async function calendarRequest(path: string, init: RequestInit, config: GoogleCalendarConfig) {
  const token = await accessToken(config);
  const response = await fetch(`${GOOGLE_CALENDAR_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Google Calendar request failed (${response.status}): ${detail}`);
  }
  return response;
}

function eventPayload(booking: CalendarBooking) {
  const customerName = booking.user.name || booking.bandName || "Studio booking";
  const lines = [
    `Ticket: ${booking.ticketNumber || booking.id}`,
    `Customer: ${customerName}`,
    booking.user.email ? `Email: ${booking.user.email}` : null,
    booking.user.phone ? `Phone: ${booking.user.phone}` : null,
    `Attendees: ${booking.attendees}`,
    booking.equipmentRequests ? `Requirements: ${booking.equipmentRequests}` : null,
    `Payment: ${booking.paymentStatus}`,
    `Amount: ₹${booking.totalAmount.toLocaleString("en-IN")}`,
    "Created by Elf Jampad Booking.",
  ].filter(Boolean).join("\n");

  return {
    summary: `Jampad — ${booking.bandName || customerName} — ${booking.ticketNumber || booking.id}`,
    description: lines,
    start: { dateTime: sessionStart(booking.date, booking.slots).toISOString(), timeZone: TIME_ZONE },
    end: { dateTime: sessionEnd(booking.date, booking.slots).toISOString(), timeZone: TIME_ZONE },
    extendedProperties: { private: { elfBookingId: booking.id, ticketNumber: booking.ticketNumber || "" } },
  };
}

function blockEventPayload(block: CalendarBlock) {
  const fullDaySlots = Array.from(
    { length: BOOKING_POLICY.closingHour - BOOKING_POLICY.openingHour },
    (_, index) => String(BOOKING_POLICY.openingHour + index),
  );
  const isWholeDay = block.slots.length === fullDaySlots.length
    && fullDaySlots.every((slot) => block.slots.includes(slot));
  const title = isWholeDay
    ? `Jampad — Holiday${block.note && block.note !== "Holiday" ? ` — ${block.note}` : ""}`
    : block.note ? `Jampad — Blocked — ${block.note}` : "Jampad — Blocked";
  const nextDate = new Date(block.date);
  nextDate.setUTCDate(nextDate.getUTCDate() + 1);
  return {
    summary: title,
    description: [
      isWholeDay
        ? "Full-day studio holiday created from the Elf Jampad admin panel."
        : "Manual studio block created from the Elf Jampad admin panel.",
      block.note ? `Note: ${block.note}` : null,
    ].filter(Boolean).join("\n"),
    ...(isWholeDay
      ? { start: { date: toDateKey(block.date) }, end: { date: toDateKey(nextDate) } }
      : {
        start: { dateTime: sessionStart(block.date, block.slots).toISOString(), timeZone: TIME_ZONE },
        end: { dateTime: sessionEnd(block.date, block.slots).toISOString(), timeZone: TIME_ZONE },
      }),
    colorId: "11",
    extendedProperties: { private: { elfCalendarBlockId: block.id } },
  };
}

export async function syncBookingToGoogleCalendar(booking: CalendarBooking) {
  const config = calendarConfig();
  if (!config) return { synced: false, reason: "not-configured" as const };

  const calendarId = encodeURIComponent(config.calendarId);
  if (booking.status === "CANCELLED") {
    if (!booking.googleCalendarEventId) return { synced: false, reason: "no-event" as const };
    const response = await calendarRequest(
      `/calendars/${calendarId}/events/${encodeURIComponent(booking.googleCalendarEventId)}?sendUpdates=none`,
      { method: "DELETE" },
      config,
    );
    if (response.status === 204) {
      await prisma.booking.update({
        where: { id: booking.id },
        data: { googleCalendarEventId: null, googleCalendarSyncedAt: new Date() },
      });
    }
    return { synced: true, action: "deleted" as const };
  }

  if (booking.status !== "CONFIRMED" || booking.paymentStatus !== "PAID") {
    return { synced: false, reason: "not-confirmed" as const };
  }

  const payload = eventPayload(booking);
  if (booking.googleCalendarEventId) {
    await calendarRequest(
      `/calendars/${calendarId}/events/${encodeURIComponent(booking.googleCalendarEventId)}?sendUpdates=none`,
      { method: "PATCH", body: JSON.stringify(payload) },
      config,
    );
    await prisma.booking.update({ where: { id: booking.id }, data: { googleCalendarSyncedAt: new Date() } });
    return { synced: true, action: "updated" as const };
  }

  const response = await calendarRequest(
    `/calendars/${calendarId}/events?sendUpdates=none`,
    { method: "POST", body: JSON.stringify(payload) },
    config,
  );
  const event = await response.json() as { id?: string };
  if (!event.id) throw new Error("Google Calendar did not return an event ID.");
  await prisma.booking.update({
    where: { id: booking.id },
    data: { googleCalendarEventId: event.id, googleCalendarSyncedAt: new Date() },
  });
  return { synced: true, action: "created" as const };
}

export async function syncCalendarBlockToGoogleCalendar(block: CalendarBlock) {
  const config = calendarConfig();
  if (!config) return { synced: false, reason: "not-configured" as const };

  const calendarId = encodeURIComponent(config.calendarId);
  const payload = blockEventPayload(block);
  if (block.googleCalendarEventId) {
    await calendarRequest(
      `/calendars/${calendarId}/events/${encodeURIComponent(block.googleCalendarEventId)}?sendUpdates=none`,
      { method: "PATCH", body: JSON.stringify(payload) },
      config,
    );
    await prisma.calendarBlock.update({
      where: { id: block.id },
      data: { googleCalendarSyncedAt: new Date() },
    });
    return { synced: true, action: "updated" as const };
  }

  const response = await calendarRequest(
    `/calendars/${calendarId}/events?sendUpdates=none`,
    { method: "POST", body: JSON.stringify(payload) },
    config,
  );
  const event = await response.json() as { id?: string };
  if (!event.id) throw new Error("Google Calendar did not return an event ID.");
  await prisma.calendarBlock.update({
    where: { id: block.id },
    data: { googleCalendarEventId: event.id, googleCalendarSyncedAt: new Date() },
  });
  return { synced: true, action: "created" as const };
}

export async function deleteCalendarBlockFromGoogleCalendar(block: CalendarBlock) {
  const config = calendarConfig();
  if (!config || !block.googleCalendarEventId) return { synced: false, reason: "no-event" as const };

  const calendarId = encodeURIComponent(config.calendarId);
  await calendarRequest(
    `/calendars/${calendarId}/events/${encodeURIComponent(block.googleCalendarEventId)}?sendUpdates=none`,
    { method: "DELETE" },
    config,
  );
  return { synced: true, action: "deleted" as const };
}

export async function createGoogleCalendarTestEvent() {
  const config = calendarConfig();
  if (!config) throw new Error("Google Calendar is not configured yet.");

  const now = new Date();
  const start = new Date(now.getTime() + 10 * 60 * 1000);
  start.setUTCSeconds(0, 0);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const calendarId = encodeURIComponent(config.calendarId);
  const response = await calendarRequest(
    `/calendars/${calendarId}/events?sendUpdates=none`,
    {
      method: "POST",
      body: JSON.stringify({
        summary: "Elf Studios — Calendar Sync Test",
        description: "Temporary event created from the Elf Studios admin panel to verify Google Calendar sync.",
        start: { dateTime: start.toISOString(), timeZone: TIME_ZONE },
        end: { dateTime: end.toISOString(), timeZone: TIME_ZONE },
        colorId: "9",
      }),
    },
    config,
  );
  const event = await response.json() as { id?: string; htmlLink?: string };
  if (!event.id) throw new Error("Google Calendar did not return an event ID.");
  return { id: event.id, htmlLink: event.htmlLink || null, start: start.toISOString() };
}
