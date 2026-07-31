'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, state, monthlyPmt, calculate } = require('../refi.js');

// calculate() reads from the module's internal `state` object, so tests reset
// it to DEFAULTS + overrides in place (mutating, not reassigning, the export).
function withState(overrides = {}) {
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, DEFAULTS, overrides);
  return calculate();
}

test('monthlyPmt matches standard amortization formula', () => {
  assert.ok(Math.abs(monthlyPmt(300000, 6, 360) - 1798.6515754582708) < 1e-6);
});

test('calculate: matches the hand-verified reference scenario', () => {
  const r = withState();
  assert.ok(Math.abs(r.P1 - 2418.1903382442647) < 1e-6);
  assert.ok(Math.abs(r.P2 - 2042.504997552422) < 1e-6);
  assert.ok(Math.abs(r.monthlySavings - 375.6853406918426) < 1e-6);
  assert.ok(Math.abs(r.breakEvenMonths - 15.970812140156205) < 1e-6);
  assert.ok(Math.abs(r.netBenefit - 21777.60429370705) < 1e-4);
});

test('calculate: rolling all closing costs into the loan removes upfront cost but grows the balance', () => {
  const r = withState({ rolledMode: 'all' });
  assert.equal(r.outOfPocket, 2000); // prepaid costs still out of pocket
  assert.equal(r.newLoanBal, 354000);
});

test('calculate: shortening the term can raise the payment even as it saves interest', () => {
  const r = withState({ newTermYears: 15 });
  assert.equal(r.termShortened, true);
  assert.ok(r.monthlySavings < 0);
});

test('calculate: break-even is 0 or negative-safe when out-of-pocket cost is fully rolled in and savings are positive', () => {
  const r = withState({ rolledMode: 'all', closingCosts: 0, prepaidCosts: 0 });
  assert.ok(r.monthlySavings > 0);
  assert.equal(r.breakEvenMonths, 0);
});

test('calculate: points cost scales with loan balance and percent, and lowers the effective rate', () => {
  const r = withState({ points: 2, pointsReduction: 0.25 });
  assert.ok(Math.abs(r.pointsCost - (2 * 350000 / 100)) < 1e-9);
  assert.ok(Math.abs(r.effectiveNewRate - (5.75 - 2 * 0.25)) < 1e-9);
});
