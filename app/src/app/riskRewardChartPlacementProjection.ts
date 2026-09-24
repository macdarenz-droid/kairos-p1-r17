import type { RiskRewardChartSemantics } from '../application/risk-reward';
import type { ChartTimestamp } from '../features/chart';

export interface RiskRewardChartTimeExtent {
  readonly start: ChartTimestamp;
  readonly end: ChartTimestamp;
}

export interface RiskRewardChartPlacementProjection {
  readonly id: RiskRewardChartSemantics['id'];
  readonly start: ChartTimestamp;
  readonly end: ChartTimestamp;
}

export function projectRiskRewardChartPlacement(
  semantics: RiskRewardChartSemantics,
  extent: RiskRewardChartTimeExtent,
): RiskRewardChartPlacementProjection {
  return {
    id: semantics.id,
    start: extent.start,
    end: extent.end,
  };
}
