import {
  defineRiskRewardAnalysis,
  projectRiskRewardChartSemantics,
  type RiskRewardAnalysis,
  type RiskRewardChartSemantics,
} from '../application/risk-reward';
import type { ChartTimestamp } from '../features/chart';
import {
  projectRiskRewardChartObject,
  type RiskRewardChartObjectProjection,
} from './riskRewardChartObjectProjection';
import {
  projectRiskRewardChartPlacement,
  type RiskRewardChartPlacementProjection,
  type RiskRewardChartTimeExtent,
} from './riskRewardChartPlacementProjection';
import {
  projectRiskRewardChartStyle,
  type RiskRewardChartStyleProjection,
} from './riskRewardChartStyleProjection';
import type {
  AnalysisSavedTradeChartReferenceProjection,
  AnalysisSavedTradeChartReferenceUnavailableReason,
} from './analysisSavedTradeChartReferenceProjection';

export type AnalysisSavedTradeRiskRewardUnavailableReason =
  | 'reference-unavailable'
  | 'planned-entry-missing'
  | 'planned-stop-missing'
  | 'planned-target-missing'
  | 'extent-invalid';

export type AnalysisSavedTradeRiskRewardReferenceProjection =
  | {
      readonly kind: 'unavailable';
      readonly reason: AnalysisSavedTradeRiskRewardUnavailableReason;
      readonly referenceReason: AnalysisSavedTradeChartReferenceUnavailableReason | null;
    }
  | {
      readonly kind: 'risk-reward-ready';
      readonly analysis: RiskRewardAnalysis;
      readonly semantics: RiskRewardChartSemantics;
      readonly style: RiskRewardChartStyleProjection;
      readonly placement: RiskRewardChartPlacementProjection;
      readonly chartObject: RiskRewardChartObjectProjection;
    };

function freezeSemantics(semantics: RiskRewardChartSemantics): RiskRewardChartSemantics {
  return Object.freeze({
    ...semantics,
    levels: Object.freeze({
      entry: Object.freeze({ ...semantics.levels.entry }),
      stop: Object.freeze({ ...semantics.levels.stop }),
      target: Object.freeze({ ...semantics.levels.target }),
    }),
    zones: Object.freeze({
      risk: Object.freeze({ ...semantics.zones.risk }),
      reward: Object.freeze({ ...semantics.zones.reward }),
    }),
  });
}

function freezeStyle(style: RiskRewardChartStyleProjection): RiskRewardChartStyleProjection {
  return Object.freeze({
    entry: Object.freeze({ ...style.entry }),
    stop: Object.freeze({ ...style.stop }),
    target: Object.freeze({ ...style.target }),
    risk: Object.freeze({ ...style.risk }),
    reward: Object.freeze({ ...style.reward }),
  });
}

function freezeChartObject(chartObject: RiskRewardChartObjectProjection): RiskRewardChartObjectProjection {
  return Object.freeze({
    ...chartObject,
    levels: Object.freeze({
      entry: Object.freeze({ ...chartObject.levels.entry }),
      stop: Object.freeze({ ...chartObject.levels.stop }),
      target: Object.freeze({ ...chartObject.levels.target }),
    }),
    zones: Object.freeze({
      risk: Object.freeze({ ...chartObject.zones.risk }),
      reward: Object.freeze({ ...chartObject.zones.reward }),
    }),
  });
}

function isValidExtent(extent: RiskRewardChartTimeExtent): boolean {
  const start = Date.parse(extent.start);
  const end = Date.parse(extent.end);
  return Number.isFinite(start) && Number.isFinite(end) && start <= end;
}

/**
 * Delegates exact P14 planned levels from Gate438 into the released P19
 * provider-neutral logical Risk/Reward owners. The caller supplies the exact
 * chart time extent; this boundary validates but never normalizes it.
 */
export function projectAnalysisSavedTradeRiskRewardReference(
  reference: AnalysisSavedTradeChartReferenceProjection,
  extent: Readonly<{ readonly start: ChartTimestamp; readonly end: ChartTimestamp }>,
): AnalysisSavedTradeRiskRewardReferenceProjection {
  const unavailable = (
    reason: AnalysisSavedTradeRiskRewardUnavailableReason,
    referenceReason: AnalysisSavedTradeChartReferenceUnavailableReason | null = null,
  ): AnalysisSavedTradeRiskRewardReferenceProjection => Object.freeze({
    kind: 'unavailable' as const,
    reason,
    referenceReason,
  });

  if (reference.kind !== 'reference-ready') {
    return unavailable('reference-unavailable', reference.reason);
  }

  const { entry, stop, target } = reference.facts.planned;
  if (entry === null) return unavailable('planned-entry-missing');
  if (stop === null) return unavailable('planned-stop-missing');
  if (target === null) return unavailable('planned-target-missing');
  if (!isValidExtent(extent)) return unavailable('extent-invalid');

  const analysis = Object.freeze(defineRiskRewardAnalysis({
    id: `journal-risk-reward:${reference.tradeId}`,
    side: reference.facts.side,
    levels: Object.freeze({ entry, stop, target }),
  }));
  const semantics = freezeSemantics(projectRiskRewardChartSemantics(analysis));
  const style = freezeStyle(projectRiskRewardChartStyle(semantics));
  const placement = Object.freeze(projectRiskRewardChartPlacement(semantics, extent));
  const chartObject = freezeChartObject(projectRiskRewardChartObject(semantics, style, placement));

  return Object.freeze({
    kind: 'risk-reward-ready' as const,
    analysis,
    semantics,
    style,
    placement,
    chartObject,
  });
}
