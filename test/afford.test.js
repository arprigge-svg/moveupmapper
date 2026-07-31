'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { pmtFactor, solve } = require('../afford.js');

test('pmtFactor matches standard amortization factor', () => {
  const r = 6 / 100 / 12;
  const factor = pmtFactor(r, 360);
  assert.ok(Math.abs(factor * 300000 - 1798.6515754582708) < 1e-6);
});

test('pmtFactor: zero rate is 1/n', () => {
  assert.equal(pmtFactor(0, 240), 1 / 240);
});

function baseInputs(overrides = {}) {
  return {
    income: 120000, debts: 500, downPayment: 60000, rate: 6.75, term: 30,
    taxRate: 1.2, insRate: 0.5, hoa: 0, pmiRate: 0.85,
    discountPoints: 0, pointsReduction: 0.25,
    taxMode: 'pct', insMode: 'pct', pmiMode: 'pct',
    ...overrides,
  };
}

test('solve: returns null when income is 0', () => {
  assert.equal(solve(baseInputs({ income: 0 })), null);
});

test('solve: matches the hand-verified reference scenario', () => {
  const r = solve(baseInputs());
  assert.ok(Math.abs(r.P - 375295.08784425934) < 1e-4);
  assert.ok(Math.abs(r.mTotal - 2800) < 1e-6);
  assert.equal(r.binding, 'front');
  assert.equal(r.hasPmi, true);
});

test('solve: monthly total never exceeds the binding DTI limit (front here)', () => {
  const r = solve(baseInputs());
  const grossMo = 120000 / 12;
  assert.ok(r.mTotal <= grossMo * 0.28 + 1e-6);
});

test('solve: a smaller down payment lowers max price and keeps PMI on', () => {
  const withMoreDown = solve(baseInputs());
  const withLessDown = solve(baseInputs({ downPayment: 5000 }));
  assert.ok(withLessDown.P < withMoreDown.P);
  assert.equal(withLessDown.hasPmi, true);
});

test('solve: discount points lower the effective rate and raise buying power', () => {
  const withoutPoints = solve(baseInputs());
  const withPoints = solve(baseInputs({ discountPoints: 2 }));
  assert.ok(withPoints.effectiveRate < withoutPoints.effectiveRate);
  assert.ok(withPoints.P > withoutPoints.P);
  assert.ok(Math.abs(withPoints.pointsCost - 6556.251182907638) < 1e-4);
});

test('solve: back-end DTI equals front-end total plus debts, divided by gross income', () => {
  const r = solve(baseInputs());
  const grossMo = 120000 / 12;
  assert.ok(Math.abs(r.backDTI - (r.mTotal + 500) / grossMo) < 1e-9);
});
