import { describe, expect, it } from 'vitest';
import {
  defineRiskRewardAnalysis,
  type RiskRewardAnalysis,
} from '../src/application/risk-reward';
import { parsePositiveDecimalString } from '../src/domain/trades';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

describe('P19.1 Risk/Reward analysis semantic contract', () => {
  it('preserves provider-neutral analysis identity, side, and semantic levels', () => {
    const analysis: RiskRewardAnalysis = {
      id: 'risk-reward-1',
      side: 'long',
      levels: {
        entry: decimal('100'),
        stop: decimal('90'),
        target: decimal('120'),
      },
    };

    expect(defineRiskRewardAnalysis(analysis)).toEqual(analysis);
  });
});
