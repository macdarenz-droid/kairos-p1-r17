import { describe, expect, it } from 'vitest';
import { projectLeveragePicture } from '../src/application/learn/leveragePicture';
import { projectPositionSizePlan, type PositionSizePlan } from '../src/application/learn/positionSizePlan';
import { decimalRound } from '../src/domain/calculations/decimalKernel';
import { calculateRiskBudget } from '../src/domain/calculations/riskCalculator';
import { parseLearnPictureSpec } from '../src/domain/learn/learnPicture';
import type { DecimalString } from '../src/domain/trades';

const plan = (accountSize: string, riskPercent: string, entryPrice: string, stopPrice: string) => projectPositionSizePlan({ accountSize, riskPercent, entryPrice, stopPrice });
function planOf(...input: [string, string, string, string]): PositionSizePlan {
  const result = plan(...input);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  expect(Object.isFrozen(result)).toBe(true);
  expect(Object.isFrozen(result.plan)).toBe(true);
  expect(Object.isFrozen(result.plan.picture)).toBe(true);
  expect(parseLearnPictureSpec(result.plan.picture)).not.toBeNull();
  return result.plan;
}
const leverage = (accountSize: string, tradeValue: string) => projectLeveragePicture({ accountSize, tradeValue });

describe('P24.3 decimalRound', () => {
  it('rounds down toward zero or half away from zero', () => {
    const cases: [string, number, 'down' | 'half-up', string][] = [
      ['33.333333333333', 8, 'down', '33.33333333'],
      ['2.999', 2, 'down', '2.99'],
      ['-1.239', 2, 'down', '-1.23'],
      ['2.995', 2, 'half-up', '3'],
      ['-2.345', 2, 'half-up', '-2.35'],
      ['0.000000009', 8, 'down', '0'],
    ];
    for (const [value, places, mode, expected] of cases) expect(decimalRound(value, places, mode)).toEqual({ ok: true, value: expected });
  });

  it('refuses places that are not 0 to 20 and a value that is not a decimal', () => {
    for (const places of [-1, 1.5, 21]) expect(decimalRound('1.5', places, 'down')).toEqual({ ok: false, reason: 'invalid-decimal' });
    expect(decimalRound('abc', 2, 'down')).toEqual({ ok: false, reason: 'invalid-decimal' });
  });
});

describe('P24.3 calculateRiskBudget', () => {
  it('is account size × percent ÷ 100', () => {
    expect(calculateRiskBudget('1000' as DecimalString, '1' as DecimalString)).toEqual({ ok: true, value: '10' });
    expect(calculateRiskBudget('2500.50' as DecimalString, '0.5' as DecimalString)).toEqual({ ok: true, value: '12.5025' });
    expect(calculateRiskBudget('1000' as DecimalString, 'x' as DecimalString)).toEqual({ ok: false, reason: 'invalid-decimal' });
  });
});

describe('P24.3 projectPositionSizePlan', () => {
  it('plans a long trade', () => {
    expect(planOf('1000', '1', '100', '95')).toEqual({
      side: 'long', accountSize: '1000', riskPercent: '1', entryPrice: '100', stopPrice: '95',
      riskBudget: '10', riskPerUnit: '5', size: '2', sizeWasRounded: false, amountAtRisk: '10', positionValue: '200', needsBorrowedMoney: false,
      picture: { kind: 'risk-box', side: 'long', target: false, highlight: 'risk' },
    });
  });

  it('plans a short trade when the stop is above the entry', () => {
    expect(planOf('1000', '1', '100', '105')).toMatchObject({ side: 'short', size: '2', picture: { side: 'short' } });
  });

  it('rounds the size down so the loss stays inside the budget', () => {
    expect(planOf('100', '1', '100', '97')).toMatchObject({ size: '0.33333333', sizeWasRounded: true, amountAtRisk: '0.99999999', positionValue: '33.333333' });
  });

  it('says when the trade is bigger than the account', () => {
    expect(planOf('1000', '1', '100', '99.9')).toMatchObject({ size: '100', positionValue: '10000', needsBorrowedMoney: true });
  });

  it('refuses a size that rounds to nothing', () => {
    expect(plan('1', '0.0001', '100000', '1')).toEqual({ ok: false, problems: [{ field: null, reason: 'too-small' }] });
  });

  it('names each box that is missing or wrong, in order', () => {
    expect(plan('', '', '', '')).toEqual({ ok: false, problems: ['accountSize', 'riskPercent', 'entryPrice', 'stopPrice'].map((field) => ({ field, reason: 'missing' })) });
    expect(plan('1,000', '1', '100', '95')).toEqual({ ok: false, problems: [{ field: 'accountSize', reason: 'not-a-number' }] });
    expect(plan('0', '1', '100', '-5')).toEqual({ ok: false, problems: [{ field: 'accountSize', reason: 'must-be-positive' }, { field: 'stopPrice', reason: 'must-be-positive' }] });
    expect(plan('', '150', '', '')).toEqual({ ok: false, problems: [
      { field: 'accountSize', reason: 'missing' }, { field: 'riskPercent', reason: 'percent-over-100' }, { field: 'entryPrice', reason: 'missing' }, { field: 'stopPrice', reason: 'missing' },
    ] });
    const refused = plan('', '', '', '');
    expect(Object.isFrozen(refused)).toBe(true);
    expect(!refused.ok && Object.isFrozen(refused.problems)).toBe(true);
  });

  it('refuses a stop at the entry and trims what was typed', () => {
    expect(plan('1000', '1', '100', '100')).toEqual({ ok: false, problems: [{ field: 'stopPrice', reason: 'stop-equals-entry' }] });
    expect(planOf(' 1000 ', '1', '100', '95').accountSize).toBe('1000');
  });
});

describe('P24.3 projectLeveragePicture', () => {
  function pictureOf(accountSize: string, tradeValue: string) {
    const result = leverage(accountSize, tradeValue);
    if (!result.ok) throw new Error(JSON.stringify(result.problems));
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.picture)).toBe(true);
    expect(Object.isFrozen(result.picture.picture)).toBe(true);
    expect(parseLearnPictureSpec(result.picture.picture)).not.toBeNull();
    return result.picture;
  }

  it('draws a trade five times the account', () => {
    expect(pictureOf('1000', '5000')).toEqual({
      accountSize: '1000', tradeValue: '5000', ratio: '5', ratioShown: '5', ratioIsRounded: false, usesBorrowedMoney: true,
      picture: { kind: 'leverage', accountSteps: 4, tradeSteps: 20 },
    });
  });

  it('draws a trade smaller than the account', () => {
    expect(pictureOf('3000', '1000')).toMatchObject({ ratioShown: '0.33', ratioIsRounded: true, usesBorrowedMoney: false, picture: { accountSteps: 20, tradeSteps: 7 } });
    expect(pictureOf('1000', '1000')).toMatchObject({ ratio: '1', ratioShown: '1', usesBorrowedMoney: false, picture: { accountSteps: 20, tradeSteps: 20 } });
    expect(pictureOf('1000', '1')).toMatchObject({ ratioShown: '0', picture: { accountSteps: 20, tradeSteps: 0 } });
  });

  it('names each box that is missing or wrong', () => {
    expect(leverage('', '')).toEqual({ ok: false, problems: [{ field: 'accountSize', reason: 'missing' }, { field: 'tradeValue', reason: 'missing' }] });
    expect(leverage('abc', '1000')).toEqual({ ok: false, problems: [{ field: 'accountSize', reason: 'not-a-number' }] });
  });
});
