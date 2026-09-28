import { describe, expect, it } from 'vitest';
import {
  projectRiskRewardZoneSemantics,
  type RiskRewardAnalysis,
} from '../src/application/risk-reward';
import { parsePositiveDecimalString } from '../src/domain/trades';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

function analysis(side: 'long' | 'short', entry: string, stop: string, target: string): RiskRewardAnalysis {
  return {
    id: `risk-reward-${side}`,
    side,
    levels: {
      entry: decimal(entry),
      stop: decimal(stop),
      target: decimal(target),
    },
  };
}

describe('P19.2 Risk/Reward zone semantics projection', () => {
  it('projects long analysis into semantic risk and reward price zones without calculation ownership', () => {
    expect(projectRiskRewardZoneSemantics(analysis('long', '100', '90', '120'))).toEqual({
      risk: { role: 'risk', from: decimal('100'), to: decimal('90') },
      reward: { role: 'reward', from: decimal('100'), to: decimal('120') },
    });
  });

  it('preserves short-side price ordering rather than normalizing or validating it', () => {
    expect(projectRiskRewardZoneSemantics(analysis('short', '100', '110', '80'))).toEqual({
      risk: { role: 'risk', from: decimal('100'), to: decimal('110') },
      reward: { role: 'reward', from: decimal('100'), to: decimal('80') },
    });
  });
});
