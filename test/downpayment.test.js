'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { monthlyPmt, pmiDropoffMonth, buildScenarios, simulate } = require('../downpayment.js');

test('monthlyPmt matches standard amortization formula', () => {
  assert.ok(Math.abs(monthlyPmt(300000, 6, 360) - 1798.6515754582708) < 1e-6);
});

test('monthlyPmt: zero principal returns 0', () => {
  assert.equal(monthlyPmt(0, 6, 360), 0);
});

test('pmiDropoffMonth: returns 0 when loan is already at or under 78% of home price', () => {
  const pmt = monthlyPmt(300000, 6.875, 360);
  assert.equal(pmiDropoffMonth(300000, 450000, 6.875, pmt), 0);
});

test('pmiDropoffMonth: finds the month balance crosses the 78% LTV threshold', () => {
  const loan = 380000, homePrice = 450000, rate = 6.875;
  const pmt = monthlyPmt(loan, rate, 360);
  assert.equal(pmiDropoffMonth(loan, homePrice, rate, pmt), 74);
});

function baseState(overrides = {}) {
  return {
    homePrice: 500000,
    savings: 150000,
    mortgageRate: 6.75,
    loanTerm: 30,
    horizon: 10,
    investReturn: 7.0,
    pmiRate: 0.85,
    pmiMode: 'pct',
    pmiDollar: 0,
    appreciation: 0,
    customDpMode: 'pct',
    customDp: 0,
    discountPoints: 0,
    pointsReduction: 0.25,
    ...overrides,
  };
}

test('buildScenarios: generates min / 20% / max scenarios in the expected amounts', () => {
  const s = baseState();
  const scenarios = buildScenarios(s);
  assert.equal(scenarios.length, 3);
  assert.equal(scenarios[0].key, 'min');
  assert.ok(Math.abs(scenarios[0].dp - 25000) < 1e-6);
  assert.equal(scenarios[1].key, 'twenty');
  assert.ok(Math.abs(scenarios[1].dp - 100000) < 1e-6);
  assert.equal(scenarios[2].key, 'max');
  assert.ok(Math.abs(scenarios[2].dp - 150000) < 1e-6);
});

test('buildScenarios: appends a custom scenario when customDp is set', () => {
  const s = baseState({ customDp: 15, customDpMode: 'pct' }); // 15% of 500k = 75000
  const scenarios = buildScenarios(s);
  const custom = scenarios.find(sc => sc.key === 'custom');
  assert.ok(custom);
  assert.ok(Math.abs(custom.dp - 75000) < 1e-6);
});

test('buildScenarios: discount points shrink the max affordable down payment', () => {
  const withoutPoints = buildScenarios(baseState());
  const withPoints = buildScenarios(baseState({ discountPoints: 2 }));
  const maxWithout = withoutPoints.find(sc => sc.key === 'max').dp;
  const maxWith = withPoints.find(sc => sc.key === 'max').dp;
  assert.ok(maxWith < maxWithout);
});

test('simulate: loan amount per scenario equals home price minus down payment', () => {
  const s = baseState();
  const scenarios = buildScenarios(s);
  const { results } = simulate(scenarios, s);
  results.forEach(r => {
    assert.ok(Math.abs(r.loan - (s.homePrice - r.dp)) < 1e-6);
  });
});

test('simulate: PMI only applies below 20% down, and stops applying by 20% down', () => {
  const s = baseState();
  const scenarios = buildScenarios(s);
  const { results } = simulate(scenarios, s);
  const min = results.find(r => r.key === 'min');
  const twenty = results.find(r => r.key === 'twenty');
  assert.equal(min.hasPMI, true);
  assert.equal(twenty.hasPMI, false);
});

test('simulate: min-down scenario has zero saved burden relative to itself, others may accumulate more portfolio', () => {
  const s = baseState();
  const scenarios = buildScenarios(s);
  const { results } = simulate(scenarios, s);
  const min = results.find(r => r.key === 'min');
  const max = results.find(r => r.key === 'max');
  // Max down puts less cash to invest initially, but has a lower monthly burden (no PMI, smaller loan)
  assert.ok(max.initialInvest < min.initialInvest);
});
