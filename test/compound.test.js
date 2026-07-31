'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULTS, GOAL_DEFAULTS, simulate, simulateWithdrawal, calculate, calculateGoal,
} = require('../compound.js');

test('simulate: matches hand-computed annual compounding (periods=1, no contribution growth)', () => {
  const { values, finalValue } = simulate(10000, 6000, 0, 7, 3, 1);
  assert.equal(values.length, 4);
  assert.ok(Math.abs(values[1] - 16700) < 1e-6);
  assert.ok(Math.abs(values[2] - 23869) < 1e-6);
  assert.ok(Math.abs(values[3] - 31539.83) < 1e-2);
  assert.ok(Math.abs(finalValue - 31539.83) < 1e-2);
});

test('simulate: zero contribution and zero return leaves the balance unchanged', () => {
  const { finalValue } = simulate(10000, 0, 0, 0, 10, 12);
  assert.ok(Math.abs(finalValue - 10000) < 1e-6);
});

function baseGrowthState(overrides = {}) {
  return {
    ...DEFAULTS,
    initialBalance: 10000, contribution: 500, frequency: 12, contribGrowth: 3,
    annualReturn: 7, returnVariance: 0, duration: 20, inflationRate: 3,
    expenseRatio: 0, managementFee: 0, accountType: 'taxable', annualTaxDrag: 0,
    withdrawalEnabled: false,
    ...overrides,
  };
}

test('calculate: matches the hand-verified reference scenario', () => {
  const c = calculate(baseGrowthState());
  assert.ok(Math.abs(c.base.finalValue - 358042.4663985319) < 1e-3);
  assert.ok(Math.abs(c.totalContrib - 161222.24693388282) < 1e-3);
  assert.ok(Math.abs(c.totalInvested - 171222.24693388282) < 1e-3);
  assert.ok(Math.abs(c.multiple - 2.091097814741267) < 1e-6);
});

test('calculate: totalGain equals finalValue minus totalInvested', () => {
  const c = calculate(baseGrowthState());
  assert.ok(Math.abs(c.totalGain - (c.base.finalValue - c.totalInvested)) < 1e-6);
});

test('calculate: duration is clamped to [1, 50]', () => {
  const cLow = calculate(baseGrowthState({ duration: 0 }));
  const cHigh = calculate(baseGrowthState({ duration: 100 }));
  assert.equal(cLow.years, 1);
  assert.equal(cHigh.years, 50);
});

test('calculate: zero returnVariance means no optimistic/pessimistic scenarios', () => {
  const c = calculate(baseGrowthState({ returnVariance: 0 }));
  assert.equal(c.hasVar, false);
  assert.equal(c.optimist, null);
  assert.equal(c.pessimist, null);
});

test('calculate: positive returnVariance produces an optimistic scenario above and pessimistic below base', () => {
  const c = calculate(baseGrowthState({ returnVariance: 2 }));
  assert.equal(c.hasVar, true);
  assert.ok(c.optimist.finalValue > c.base.finalValue);
  assert.ok(c.pessimist.finalValue < c.base.finalValue);
});

test('calculate: expense ratio and management fee reduce the net return and final value vs. no drag', () => {
  const noDrag = calculate(baseGrowthState());
  const withDrag = calculate(baseGrowthState({ expenseRatio: 0.5, managementFee: 0.25 }));
  assert.ok(Math.abs(withDrag.netRet - (7 - 0.75)) < 1e-9);
  assert.ok(withDrag.base.finalValue < noDrag.base.finalValue);
  assert.ok(withDrag.lifetimeDragCost > 0);
});

test('calculate: tax drag only applies to taxable accounts', () => {
  const taxable = calculate(baseGrowthState({ accountType: 'taxable', annualTaxDrag: 1 }));
  const roth = calculate(baseGrowthState({ accountType: 'roth', annualTaxDrag: 1 }));
  assert.ok(Math.abs(taxable.netRet - 6) < 1e-9);
  assert.ok(Math.abs(roth.netRet - 7) < 1e-9);
});

test('calculate: withdrawal simulation produces a depletion year when withdrawals exceed sustainable growth', () => {
  const c = calculate(baseGrowthState({
    withdrawalEnabled: true, withdrawalAmount: 500000, withdrawalType: 'fixed',
    continueContribs: false,
  }));
  assert.ok(c.wdBase.depletionYear != null);
});

test('simulateWithdrawal: a percent-of-balance withdrawal never fully depletes the account', () => {
  const { values, depletionYear } = simulateWithdrawal(
    100000, 6, 12, 0, 'percent', 5, false, 0, 0, 0, 50, false, 3
  );
  assert.equal(depletionYear, null);
  assert.equal(values.length, 51);
});

function baseGoalState(overrides = {}) {
  return {
    ...GOAL_DEFAULTS,
    currentSavings: 0, annualReturn: 7, goalInflation: 3, yearsToRetirement: 30,
    annualWithdrawal: 80000, withdrawalYears: 25, goalContribGrowth: 3,
    ...overrides,
  };
}

test('calculateGoal: when return equals inflation, target nest egg simplifies to nominal withdrawal times years', () => {
  const g = calculateGoal(baseGoalState({ annualReturn: 3, goalInflation: 3 }));
  assert.ok(Math.abs(g.targetNestEgg - g.W_nom * g.d) < 1e-4);
});

test('calculateGoal: matches the hand-verified reference scenario', () => {
  const g = calculateGoal(baseGoalState({ annualReturn: 3, goalInflation: 3 }));
  assert.ok(Math.abs(g.W_nom - 194180.99769517296) < 1e-3);
  assert.ok(Math.abs(g.targetNestEgg - 4854524.942379324) < 1e-2);
  assert.ok(Math.abs(g.flatAnnual - 102038.51864050509) < 1e-2);
});

test('calculateGoal: sufficiently large current savings closes the gap entirely, requiring no contributions', () => {
  const g = calculateGoal(baseGoalState({ currentSavings: 100_000_000 }));
  assert.equal(g.gap, 0);
  assert.equal(g.flatAnnual, 0);
  assert.equal(g.growingAnnualYr1, 0);
});

test('calculateGoal: gap equals target nest egg minus grown savings, floored at 0', () => {
  const g = calculateGoal(baseGoalState());
  assert.ok(Math.abs(g.gap - Math.max(0, g.targetNestEgg - g.savingsGrown)) < 1e-6);
});
