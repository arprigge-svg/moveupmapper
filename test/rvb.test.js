'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { DEFAULTS, mortgagePI, loanBalance, computePMIDropOff, calculate } = require('../rvb.js');

test('mortgagePI matches standard amortization formula', () => {
  assert.ok(Math.abs(mortgagePI(300000, 6, 30) - 1798.6515754582708) < 1e-6);
});

test('mortgagePI: zero principal returns 0', () => {
  assert.equal(mortgagePI(0, 6, 30), 0);
});

test('mortgagePI: zero rate is a straight division', () => {
  assert.equal(mortgagePI(120000, 0, 30), 120000 / 360);
});

test('loanBalance: reaches 0 exactly at term end', () => {
  assert.equal(loanBalance(300000, 6, 30, 360), 0);
});

test('loanBalance: zero-rate balance is linear', () => {
  assert.ok(Math.abs(loanBalance(100000, 0, 30, 180) - 50000) < 1e-9);
});

test('loanBalance: month 12 balance matches reference amortization', () => {
  assert.ok(Math.abs(loanBalance(300000, 6, 30, 12) - 296315.96486316976) < 1e-6);
});

test('computePMIDropOff: returns 0 when already at or under 80% LTV', () => {
  assert.equal(computePMIDropOff(360000, 450000, 6.875, 30), 0);
});

test('computePMIDropOff: returns 0 when loan is 0', () => {
  assert.equal(computePMIDropOff(0, 450000, 6.875, 30), 0);
});

test('computePMIDropOff: finds the month balance crosses 80% LTV', () => {
  assert.equal(computePMIDropOff(380000, 450000, 6.875, 30), 54);
});

function baseState(overrides = {}) {
  return {
    ...DEFAULTS,
    purchasePrice: 450000,
    downPayment: 90000,
    dpMode: 'dollar',
    mortgageRate: 6.875,
    mortgageTerm: 30,
    homeGrowth: 0,
    propTaxRate: 0,
    propTaxGrowth: 0,
    monthlyPMI: 0,
    monthlyHOA: 0,
    monthlyHOI: 0,
    maintenancePct: 0,
    closingCosts: 9000,
    rent: 0,
    rentersInsurance: 0,
    rentIncrease: 0,
    inflation: 0,
    itemizeDeductions: false,
    horizonYears: 10,
    ...overrides,
  };
}

test('calculate: loan equals purchase price minus down payment', () => {
  const s = baseState();
  const c = calculate(s);
  assert.equal(c.loan, 360000);
  assert.ok(Math.abs(c.pi - mortgagePI(360000, 6.875, 30)) < 1e-9);
});

test('calculate: year-0 equity equals the down payment when there is no appreciation', () => {
  const s = baseState();
  const c = calculate(s);
  assert.ok(Math.abs(c.equityValues[0] - 90000) < 1e-9);
});

test('calculate: year-0 savings pool equals down payment plus closing costs', () => {
  const s = baseState();
  const c = calculate(s);
  assert.equal(c.savingsValues[0], 90000 + 9000);
});

test('calculate: 20% down payment means PMI is not required regardless of monthlyPMI input', () => {
  const s = baseState({ monthlyPMI: 150 }); // 90000/450000 = 20%
  const c = calculate(s);
  assert.equal(c.pmiRequired, false);
});

test('calculate: below 20% down payment with monthlyPMI set requires PMI until dropoff', () => {
  const s = baseState({ downPayment: 45000, monthlyPMI: 150 }); // 10% down
  const c = calculate(s);
  assert.equal(c.pmiRequired, true);
  assert.ok(c.pmiDropOff > 0);
});

test('calculate: total interest plus total principal reconstructs total P&I paid', () => {
  const s = baseState();
  const c = calculate(s);
  assert.ok(Math.abs((c.totalPrincipalPaid + c.totalInterestPaid) - c.totalPIPaid) < 1e-6);
});

test('calculate: horizonYears is clamped to [5, 30]', () => {
  const cLow = calculate(baseState({ horizonYears: 1 }));
  const cHigh = calculate(baseState({ horizonYears: 60 }));
  assert.equal(cLow.YEARS, 5);
  assert.equal(cHigh.YEARS, 30);
});
