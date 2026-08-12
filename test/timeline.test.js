'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  addDays,
  parseDateInput,
  toDateInputValue,
  nextBusinessDay,
  daysBetween,
  computeTimeline,
} = require('../timeline.js');

function d(y, m, day) { return new Date(y, m - 1, day); }

test('addDays: month rollover, year rollover, leap day, and does not mutate input', () => {
  assert.deepEqual(addDays(d(2026, 1, 25), 10), d(2026, 2, 4));
  assert.deepEqual(addDays(d(2026, 12, 28), 10), d(2027, 1, 7));
  assert.deepEqual(addDays(d(2028, 2, 28), 1), d(2028, 2, 29)); // 2028 is a leap year
  assert.deepEqual(addDays(d(2028, 2, 29), 1), d(2028, 3, 1));

  const original = d(2026, 6, 15);
  const originalTime = original.getTime();
  addDays(original, 5);
  assert.equal(original.getTime(), originalTime);
});

test('parseDateInput / toDateInputValue: round-trip without UTC drift', () => {
  const parsed = parseDateInput('2026-11-16');
  assert.equal(parsed.getFullYear(), 2026);
  assert.equal(parsed.getMonth(), 10);
  assert.equal(parsed.getDate(), 16);
  assert.equal(toDateInputValue(parsed), '2026-11-16');
  assert.equal(toDateInputValue(d(2026, 1, 5)), '2026-01-05');
});

test('nextBusinessDay: rolls Saturday/Sunday to Monday, leaves weekdays alone', () => {
  // 2026-08-15 is a Saturday.
  assert.deepEqual(nextBusinessDay(d(2026, 8, 15)), d(2026, 8, 17));
  // 2026-08-16 is a Sunday.
  assert.deepEqual(nextBusinessDay(d(2026, 8, 16)), d(2026, 8, 17));
  // 2026-08-17 is a Monday.
  assert.deepEqual(nextBusinessDay(d(2026, 8, 17)), d(2026, 8, 17));
});

test('daysBetween: whole-day difference', () => {
  assert.equal(daysBetween(d(2026, 1, 1), d(2026, 1, 11)), 10);
  assert.equal(daysBetween(d(2026, 1, 1), d(2026, 1, 1)), 0);
});

function durations(overrides = {}) {
  return { daysToSell: 45, daysToBuy: 30, escrowDays: 30, ...overrides };
}

test('computeTimeline buyFirst: exact dates, moveIn before finalClose, sorted ascending', () => {
  const start = d(2026, 1, 5); // a Monday
  const res = computeTimeline('buyFirst', durations(), start);
  const byId = Object.fromEntries(res.steps.map((s) => [s.id, s]));

  assert.deepEqual(byId.shopStart.date, start);
  assert.deepEqual(byId.purchaseContract.date, addDays(start, 30));
  assert.deepEqual(byId.purchaseClose.date, nextBusinessDay(addDays(byId.purchaseContract.date, 30)));
  assert.deepEqual(byId.listHome.date, byId.purchaseClose.date);
  assert.deepEqual(byId.saleContract.date, addDays(byId.listHome.date, 45));
  assert.deepEqual(byId.saleClose.date, nextBusinessDay(addDays(byId.saleContract.date, 30)));

  assert.deepEqual(res.moveInDate, byId.purchaseClose.date);
  assert.deepEqual(res.finalCloseDate, byId.saleClose.date);
  assert.ok(res.finalCloseDate.getTime() > res.moveInDate.getTime());

  for (let i = 1; i < res.steps.length; i++) {
    assert.ok(res.steps[i].date.getTime() >= res.steps[i - 1].date.getTime());
  }
});

test('computeTimeline sellFirst: shopping overlaps the sale escrow, moveIn === finalClose', () => {
  const start = d(2026, 1, 5);
  const res = computeTimeline('sellFirst', durations(), start);
  const byId = Object.fromEntries(res.steps.map((s) => [s.id, s]));

  assert.deepEqual(byId.shopStart.date, byId.saleContract.date);
  assert.ok(byId.saleClose.date.getTime() <= res.finalCloseDate.getTime());
  assert.deepEqual(res.moveInDate, res.finalCloseDate);

  for (let i = 1; i < res.steps.length; i++) {
    assert.ok(res.steps[i].date.getTime() >= res.steps[i - 1].date.getTime());
  }
});

test('computeTimeline sellFirst: out-of-insertion-order case still renders sorted', () => {
  // A short escrow + long daysToBuy can push purchaseContract/purchaseClose
  // earlier relative to saleClose than the builder's push order would imply.
  const start = d(2026, 1, 5);
  const res = computeTimeline('sellFirst', durations({ daysToSell: 10, escrowDays: 10, daysToBuy: 60 }), start);
  for (let i = 1; i < res.steps.length; i++) {
    assert.ok(res.steps[i].date.getTime() >= res.steps[i - 1].date.getTime());
  }
});

test('computeTimeline simultaneous: equal durations => no gap, single synced close', () => {
  const start = d(2026, 1, 5);
  const res = computeTimeline('simultaneous', durations({ daysToSell: 30, daysToBuy: 30 }), start);
  const byId = Object.fromEntries(res.steps.map((s) => [s.id, s]));

  assert.equal(res.gapDays, 0);
  assert.equal(byId.saleContract.note, null);
  assert.equal(byId.purchaseContract.note, null);
  assert.deepEqual(res.moveInDate, res.finalCloseDate);
  assert.deepEqual(res.finalCloseDate, nextBusinessDay(addDays(byId.saleContract.date, 30)));
});

test('computeTimeline simultaneous: sale faster than purchase => note on sale step', () => {
  const start = d(2026, 1, 5);
  const res = computeTimeline('simultaneous', durations({ daysToSell: 20, daysToBuy: 50 }), start);
  const byId = Object.fromEntries(res.steps.map((s) => [s.id, s]));

  assert.equal(res.gapDays, 30);
  assert.ok(byId.saleContract.note && byId.saleContract.note.includes('home purchase'));
  assert.equal(byId.purchaseContract.note, null);
  assert.deepEqual(res.finalCloseDate, nextBusinessDay(addDays(byId.purchaseContract.date, 30)));
});

test('computeTimeline simultaneous: purchase faster than sale => note on purchase step', () => {
  const start = d(2026, 1, 5);
  const res = computeTimeline('simultaneous', durations({ daysToSell: 60, daysToBuy: 25 }), start);
  const byId = Object.fromEntries(res.steps.map((s) => [s.id, s]));

  assert.equal(res.gapDays, 35);
  assert.ok(byId.purchaseContract.note && byId.purchaseContract.note.includes('home sale'));
  assert.equal(byId.saleContract.note, null);
  assert.deepEqual(res.finalCloseDate, nextBusinessDay(addDays(byId.saleContract.date, 30)));
});

test('computeTimeline: does not mutate the startDate object passed in', () => {
  const start = d(2026, 1, 5);
  const startTime = start.getTime();
  computeTimeline('buyFirst', durations(), start);
  computeTimeline('sellFirst', durations(), start);
  computeTimeline('simultaneous', durations(), start);
  assert.equal(start.getTime(), startTime);
});

test('computeTimeline: throws on unknown strategy', () => {
  assert.throws(() => computeTimeline('bogus', durations(), d(2026, 1, 1)));
});
