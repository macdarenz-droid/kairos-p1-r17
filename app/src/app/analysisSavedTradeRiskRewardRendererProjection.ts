import type { TradeSide } from '../domain/trades';
import {
  projectChartDecimal,
  projectChartTimestamp,
  type ChartEpochSeconds,
} from '../features/chart/chartSeriesProjection';
import type {
  AnalysisSavedTradeRiskRewardReferenceProjection,
  AnalysisSavedTradeRiskRewardUnavailableReason,
} from './analysisSavedTradeRiskRewardReferenceProjection';
import type {
  RiskRewardChartLogicalLevelSpan,
  RiskRewardChartLogicalZone,
  RiskRewardChartObjectProjection,
} from './riskRewardChartObjectProjection';

export interface AnalysisSavedTradeRiskRewardRendererLevel<Role extends 'entry' | 'stop' | 'target'> {
  readonly role: Role;
  readonly token: string;
  readonly start: ChartEpochSeconds;
  readonly end: ChartEpochSeconds;
  readonly price: number;
}

export interface AnalysisSavedTradeRiskRewardRendererZone<Role extends 'risk' | 'reward'> {
  readonly role: Role;
  readonly token: string;
  readonly start: ChartEpochSeconds;
  readonly end: ChartEpochSeconds;
  readonly from: number;
  readonly to: number;
}

export interface AnalysisSavedTradeRiskRewardRendererObject {
  readonly id: string;
  readonly side: TradeSide;
  readonly levels: {
    readonly entry: AnalysisSavedTradeRiskRewardRendererLevel<'entry'>;
    readonly stop: AnalysisSavedTradeRiskRewardRendererLevel<'stop'>;
    readonly target: AnalysisSavedTradeRiskRewardRendererLevel<'target'>;
  };
  readonly zones: {
    readonly risk: AnalysisSavedTradeRiskRewardRendererZone<'risk'>;
    readonly reward: AnalysisSavedTradeRiskRewardRendererZone<'reward'>;
  };
}

export type AnalysisSavedTradeRiskRewardRendererProjection =
  | {
      readonly kind: 'unavailable';
      readonly reason: AnalysisSavedTradeRiskRewardUnavailableReason | 'renderer-evidence-invalid';
    }
  | {
      readonly kind: 'renderer-ready';
      readonly logicalObject: RiskRewardChartObjectProjection;
      readonly rendererObject: AnalysisSavedTradeRiskRewardRendererObject;
    };

function projectLevel<Role extends 'entry' | 'stop' | 'target'>(
  level: RiskRewardChartLogicalLevelSpan<Role>,
): AnalysisSavedTradeRiskRewardRendererLevel<Role> {
  return Object.freeze({
    role: level.role,
    token: level.token,
    start: projectChartTimestamp(level.start),
    end: projectChartTimestamp(level.end),
    price: projectChartDecimal(level.price),
  });
}

function projectZone<Role extends 'risk' | 'reward'>(
  zone: RiskRewardChartLogicalZone<Role>,
): AnalysisSavedTradeRiskRewardRendererZone<Role> {
  return Object.freeze({
    role: zone.role,
    token: zone.token,
    start: projectChartTimestamp(zone.start),
    end: projectChartTimestamp(zone.end),
    from: projectChartDecimal(zone.from),
    to: projectChartDecimal(zone.to),
  });
}

function hasExactReleasedEvidence(
  projection: Extract<AnalysisSavedTradeRiskRewardReferenceProjection, { readonly kind: 'risk-reward-ready' }>,
): boolean {
  const { analysis, semantics, style, placement, chartObject } = projection;
  const sameIdentity = analysis.id === semantics.id
    && semantics.id === placement.id
    && placement.id === chartObject.id;
  const sameSide = analysis.side === semantics.side && semantics.side === chartObject.side;
  const sameExtent = (
    value: { readonly start: string; readonly end: string },
  ): boolean => value.start === placement.start && value.end === placement.end;

  return sameIdentity
    && sameSide
    && chartObject.levels.entry.role === 'entry'
    && chartObject.levels.stop.role === 'stop'
    && chartObject.levels.target.role === 'target'
    && chartObject.zones.risk.role === 'risk'
    && chartObject.zones.reward.role === 'reward'
    && chartObject.levels.entry.price === semantics.levels.entry.price
    && chartObject.levels.stop.price === semantics.levels.stop.price
    && chartObject.levels.target.price === semantics.levels.target.price
    && chartObject.zones.risk.from === semantics.zones.risk.from
    && chartObject.zones.risk.to === semantics.zones.risk.to
    && chartObject.zones.reward.from === semantics.zones.reward.from
    && chartObject.zones.reward.to === semantics.zones.reward.to
    && chartObject.levels.entry.token === style.entry.token
    && chartObject.levels.stop.token === style.stop.token
    && chartObject.levels.target.token === style.target.token
    && chartObject.zones.risk.token === style.risk.token
    && chartObject.zones.reward.token === style.reward.token
    && sameExtent(chartObject.levels.entry)
    && sameExtent(chartObject.levels.stop)
    && sameExtent(chartObject.levels.target)
    && sameExtent(chartObject.zones.risk)
    && sameExtent(chartObject.zones.reward);
}

/**
 * Converts Gate448's exact provider-neutral logical Risk/Reward object into
 * renderer numbers through P17's released timestamp and Decimal conversions.
 * Exact logical evidence and token references remain separate and unchanged.
 */
export function projectAnalysisSavedTradeRiskRewardRenderer(
  projection: AnalysisSavedTradeRiskRewardReferenceProjection,
): AnalysisSavedTradeRiskRewardRendererProjection {
  if (projection.kind !== 'risk-reward-ready') {
    return Object.freeze({ kind: 'unavailable' as const, reason: projection.reason });
  }
  if (!hasExactReleasedEvidence(projection)) {
    return Object.freeze({ kind: 'unavailable' as const, reason: 'renderer-evidence-invalid' as const });
  }

  try {
    const { chartObject } = projection;
    const rendererObject: AnalysisSavedTradeRiskRewardRendererObject = Object.freeze({
      id: chartObject.id,
      side: chartObject.side,
      levels: Object.freeze({
        entry: projectLevel(chartObject.levels.entry),
        stop: projectLevel(chartObject.levels.stop),
        target: projectLevel(chartObject.levels.target),
      }),
      zones: Object.freeze({
        risk: projectZone(chartObject.zones.risk),
        reward: projectZone(chartObject.zones.reward),
      }),
    });

    return Object.freeze({
      kind: 'renderer-ready' as const,
      logicalObject: chartObject,
      rendererObject,
    });
  } catch {
    return Object.freeze({ kind: 'unavailable' as const, reason: 'renderer-evidence-invalid' as const });
  }
}
