import { describe, expect, it } from 'vitest';
import type { RiskRewardChartSemantics } from '../src/application/risk-reward';
import { projectRiskRewardChartStyle } from '../src/app/riskRewardChartStyleProjection';
import { semanticTokens } from '../src/design-system/tokens/semantic';
import { parsePositiveDecimalString } from '../src/domain/trades';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const semantics: RiskRewardChartSemantics = {
  id: 'risk-reward-style-projection',
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
};

describe('P19.4 Risk/Reward chart semantic style projection', () => {
  it('maps all five P19.3 semantic roles to existing P2/P3 trade token references', () => {
    expect(projectRiskRewardChartStyle(semantics)).toEqual({
      entry: { role: 'entry', token: semanticTokens.trade.entry },
      stop: { role: 'stop', token: semanticTokens.trade.stop },
      target: { role: 'target', token: semanticTokens.trade.target },
      risk: { role: 'risk', token: semanticTokens.trade.riskZone },
      reward: { role: 'reward', token: semanticTokens.trade.rewardZone },
    });
  });

  it('returns CSS-variable semantic references instead of hard-coded visual values', () => {
    for (const style of Object.values(projectRiskRewardChartStyle(semantics))) {
      expect(style.token).toMatch(/^var\(--kairos-/);
      expect(style.token).not.toMatch(/^(#|rgb|hsl)/);
    }
  });
});
