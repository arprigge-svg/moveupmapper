'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, state, monthlyPmt, amortize, calculate } = require('../payoff.js');

function withState(overrides = {}) {
  Object.keys(state).forEach(k => delete state[k]);
  Object.assign(state, DEFAULTS, overrides);
  return calculate();
}

test('monthlyPmt matches standard amortization formula', () => {
  assert.ok(Math.abs(monthlyPmt(300000, 6, 360) - 1798.6515754582708) < 1e-6);
});

test('amortize: with no extra payment, months equals the loan term and matches the standard payment', () => {
  const r = amortize(350000, 6.75, 300, 0, 0);
  assert.equal(r.months, 300);
  assert.ok(Math.abs(r.P - monthlyPmt(350000, 6.75, 300)) < 1e-9);
});

test('amortize: a lump sum reduces starting balance and shortens payoff', () => {
  const noLump = amortize(350000, 6.75, 300, 0, 0);
  const withLump = amortize(350000, 6.75, 300, 0, 10000);
  assert.ok(withLump.months < noLump.months);
  assert.ok(withLump.totalInterest < noLump.totalInterest);
});

test('calculate: extra monthly payment scenario matches the hand-verified reference', () => {
  const r = withState();
  assert.equal(r.origMonths, 300);
  assert.equal(r.newMonths, 249);
  assert.equal(r.monthsSaved, 51);
  assert.ok(Math.abs(r.interestSaved - 74726.76451216574) < 1e-3);
  assert.ok(Math.abs(r.oppCost - 100374.62285022353) < 1e-3);
  assert.ok(Math.abs(r.postPayoffBenefit - 19825.72397376811) < 1e-3);
  assert.ok(Math.abs(r.netBenefit - (-5822.134364289683)) < 1e-3);
});

test('calculate: lump sum scenario matches the hand-verified reference', () => {
  const r = withState({ paymentType: 'lumpsum' });
  assert.equal(r.newMonths, 279);
  assert.equal(r.monthsSaved, 21);
  assert.ok(Math.abs(r.interestSaved - 40836.7579619555) < 1e-3);
  assert.ok(Math.abs(r.oppCost - 47254.1820930148) < 1e-3);
});

test('calculate: no extra payment means no time or interest saved', () => {
  const r = withState({ extraMonthly: 0 });
  assert.equal(r.monthsSaved, 0);
  assert.equal(r.interestSaved, 0);
});

test('calculate: net benefit reconciles interest saved plus post-payoff benefit minus opportunity cost', () => {
  const r = withState();
  assert.ok(Math.abs(r.netBenefit - (r.interestSaved + r.postPayoffBenefit - r.oppCost)) < 1e-6);
});
