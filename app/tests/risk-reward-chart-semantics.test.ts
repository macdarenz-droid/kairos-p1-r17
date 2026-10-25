import { describe, expect, it } from 'vitest';
import {
  projectRiskRewardChartSemantics,
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
    id: `risk-reward-chart-${side}`,
    side,
    levels: {
      entry: decimal(entry),
      stop: decimal(stop),
      target: decimal(target),
    },
  };
}

describe('P19.3 Risk/Reward chart composition semantic contract', () => {
  it('composes identity, side, three semantic price levels, and P19.2 zones without rendering ownership', () => {
    expect(projectRiskRewardChartSemantics(analysis('long', '100', '90', '120'))).toEqual({
      id: 'risk-reward-chart-long',
      side: 'long',
      levels: {
        entry: { role: 'entry', price: decimal('100') },
        stop: { role: 'stop', price: decimal('90') },
        target: { role: 'target', price: decimal('120') },
      },
      zones: {
        risk: { role: 'risk', from: decimal('100'), to: decimal('90') },
        reward: { role: 'reward', from: decimal('100'), to: decimal('120') },
      },
    });
  });

  it('preserves short-side source price ordering and semantic roles without normalization', () => {
    expect(projectRiskRewardChartSemantics(analysis('short', '100', '110', '80'))).toEqual({
      id: 'risk-reward-chart-short',
      side: 'short',
      levels: {
        entry: { role: 'entry', price: decimal('100') },
        stop: { role: 'stop', price: decimal('110') },
        target: { role: 'target', price: decimal('80') },
      },
      zones: {
        risk: { role: 'risk', from: decimal('100'), to: decimal('110') },
        reward: { role: 'reward', from: decimal('100'), to: decimal('80') },
      },
    });
  });
});
