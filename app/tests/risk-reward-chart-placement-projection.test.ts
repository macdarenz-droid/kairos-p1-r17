import { describe, expect, it } from 'vitest';
import type { RiskRewardChartSemantics } from '../src/application/risk-reward';
import {
  projectRiskRewardChartPlacement,
  type RiskRewardChartTimeExtent,
} from '../src/app/riskRewardChartPlacementProjection';
import { parsePositiveDecimalString } from '../src/domain/trades';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const semantics: RiskRewardChartSemantics = {
  id: 'risk-reward-placement-projection',
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

describe('P19.5 Risk/Reward chart logical placement projection', () => {
  it('preserves analysis identity and caller-supplied logical start/end timestamps', () => {
    const extent: RiskRewardChartTimeExtent = {
      start: '2026-09-06T10:00:00Z',
      end: '2026-09-06T11:00:00Z',
    };

    expect(projectRiskRewardChartPlacement(semantics, extent)).toEqual({
      id: 'risk-reward-placement-projection',
      start: extent.start,
      end: extent.end,
    });
  });

  it('does not validate, reorder, or normalize the caller-owned logical extent', () => {
    const extent: RiskRewardChartTimeExtent = {
      start: '2026-09-06T11:00:00Z',
      end: '2026-09-06T10:00:00Z',
    };

    expect(projectRiskRewardChartPlacement(semantics, extent)).toEqual({
      id: semantics.id,
      start: extent.start,
      end: extent.end,
    });
  });
});
