import { describe, expect, it } from 'vitest';
import type { RiskRewardChartSemantics } from '../src/application/risk-reward';
import { projectRiskRewardChartObject } from '../src/app/riskRewardChartObjectProjection';
import type { RiskRewardChartPlacementProjection } from '../src/app/riskRewardChartPlacementProjection';
import type { RiskRewardChartStyleProjection } from '../src/app/riskRewardChartStyleProjection';
import { parsePositiveDecimalString } from '../src/domain/trades';

function decimal(value: string) {
  const parsed = parsePositiveDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid test decimal: ${value}`);
  return parsed.value;
}

const semantics: RiskRewardChartSemantics = {
  id: 'risk-reward-object-projection',
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

const style: RiskRewardChartStyleProjection = {
  entry: { role: 'entry', token: 'var(--trade-entry)' },
  stop: { role: 'stop', token: 'var(--trade-stop)' },
  target: { role: 'target', token: 'var(--trade-target)' },
  risk: { role: 'risk', token: 'var(--trade-risk-zone)' },
  reward: { role: 'reward', token: 'var(--trade-reward-zone)' },
};

const placement: RiskRewardChartPlacementProjection = {
  id: semantics.id,
  start: '2026-09-06T10:00:00Z',
  end: '2026-09-06T11:00:00Z',
};

describe('P19.6 Risk/Reward provider-neutral logical chart-object projection', () => {
  it('composes level spans from authoritative semantic prices, style roles/tokens, and logical placement', () => {
    expect(projectRiskRewardChartObject(semantics, style, placement)).toMatchObject({
      id: semantics.id,
      side: 'long',
      levels: {
        entry: { role: 'entry', token: style.entry.token, start: placement.start, end: placement.end, price: semantics.levels.entry.price },
        stop: { role: 'stop', token: style.stop.token, start: placement.start, end: placement.end, price: semantics.levels.stop.price },
        target: { role: 'target', token: style.target.token, start: placement.start, end: placement.end, price: semantics.levels.target.price },
      },
    });
  });

  it('composes risk/reward logical rectangles without recomputing or normalizing semantic zone bounds', () => {
    expect(projectRiskRewardChartObject(semantics, style, placement).zones).toEqual({
      risk: {
        role: 'risk', token: style.risk.token, start: placement.start, end: placement.end,
        from: semantics.zones.risk.from, to: semantics.zones.risk.to,
      },
      reward: {
        role: 'reward', token: style.reward.token, start: placement.start, end: placement.end,
        from: semantics.zones.reward.from, to: semantics.zones.reward.to,
      },
    });
  });
});
