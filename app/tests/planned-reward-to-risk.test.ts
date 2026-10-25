import { describe, expect, it } from 'vitest';
import { projectPlannedRewardToRisk } from '../src/application/risk-reward';
import type { DecimalString, TradeSide } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;

describe('projectPlannedRewardToRisk — the one owner of the planned reward-to-risk', () => {
  it.each([
    ['long 100/90/130', 'long', '100', '90', '130', { ok: true, value: { riskDistance: '10', rewardDistance: '30', ratio: '3' } }],
    ['short 100/110/80', 'short', '100', '110', '80', { ok: true, value: { riskDistance: '10', rewardDistance: '20', ratio: '2' } }],
    ['exact decimals', 'long', '0.3', '0.1', '0.6', { ok: true, value: { riskDistance: '0.2', rewardDistance: '0.3', ratio: '1.5' } }],
    ['long stop above entry', 'long', '100', '110', '130', { ok: false, reason: 'levels-not-ordered' }],
    ['short target above entry', 'short', '100', '110', '120', { ok: false, reason: 'levels-not-ordered' }],
    ['stop equal to entry', 'long', '100', '100', '130', { ok: false, reason: 'levels-not-ordered' }],
    ['not a decimal', 'long', 'abc', '90', '130', { ok: false, reason: 'invalid-decimal' }],
  ] as const)('%s', (_label, side, entry, stop, target, expected) => {
    expect(projectPlannedRewardToRisk(side as TradeSide, d(entry), d(stop), d(target))).toEqual(expected);
  });
});
