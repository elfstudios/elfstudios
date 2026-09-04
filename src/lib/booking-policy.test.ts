import assert from "node:assert/strict";
import test from "node:test";
import {
  calculatePrice,
  canRequestReschedule,
  normalizeBookingDate,
  sessionEnd,
  validateRescheduleTarget,
  validateSlots,
} from "./booking-policy.ts";

test("pricing follows attendee bands", () => {
  assert.equal(calculatePrice(1, 1).totalPaise, 40_000);
  assert.equal(calculatePrice(5, 2).totalPaise, 80_000);
  assert.equal(calculatePrice(6, 2).totalPaise, 80_000);
  assert.equal(calculatePrice(7, 1).totalPaise, 70_000);
});

test("every ten booked hours earns one free hour", () => {
  const result = calculatePrice(5, 10);
  assert.equal(result.subtotalPaise, 400_000);
  assert.equal(result.discountPaise, 40_000);
  assert.equal(result.totalPaise, 360_000);
  assert.equal(result.freeHours, 1);
  assert.equal(calculatePrice(5, 20).totalPaise, 720_000);
  assert.equal(calculatePrice(5, 20).freeHours, 2);
});

test("slot validation rejects duplicates and invalid hours", () => {
  assert.deepEqual(validateSlots(["12", "11"]), ["11", "12"]);
  assert.throws(() => validateSlots(["11", "11"]));
  assert.throws(() => validateSlots(["10"]));
});

test("rescheduling closes forty-eight hours before the session", () => {
  const date = normalizeBookingDate("2026-05-05");
  assert.equal(canRequestReschedule(date, ["17"], new Date("2026-05-03T10:00:00.000Z")).allowed, true);
  assert.equal(canRequestReschedule(date, ["17"], new Date("2026-05-03T12:00:00.000Z")).allowed, false);
});

test("session end uses the final booked hour in IST", () => {
  const date = normalizeBookingDate("2026-05-05");
  assert.equal(sessionEnd(date, ["17", "18"]).toISOString(), "2026-05-05T13:30:00.000Z");
});

test("customer target may be up to seven days after original date", () => {
  const original = normalizeBookingDate("2026-05-05");
  assert.doesNotThrow(() => validateRescheduleTarget(original, normalizeBookingDate("2026-05-12"), ["17"], new Date("2026-05-01")));
  assert.throws(() => validateRescheduleTarget(original, normalizeBookingDate("2026-05-13"), ["17"], new Date("2026-05-01")));
});
