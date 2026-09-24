import type { RiskRewardAnalysis } from '../application/risk-reward';
import type { ChartDrawing, ChartMarketReference } from '../features/chart';
import type { RiskRewardChartTimeExtent } from './riskRewardChartPlacementProjection';

export type SavedAnalysisId = string;

export interface SavedRiskRewardAnalysis {
  readonly analysis: RiskRewardAnalysis;
  readonly extent: RiskRewardChartTimeExtent;
}

export interface SavedAnalysis {
  readonly id: SavedAnalysisId;
  readonly market: ChartMarketReference;
  readonly drawings: readonly ChartDrawing[];
  readonly riskRewards: readonly SavedRiskRewardAnalysis[];
  /** P25.1 optional user-given label (trimmed, non-empty, at most 80 characters); absent on every released record. */
  readonly label?: string;
}

export function defineSavedAnalysis(analysis: SavedAnalysis): SavedAnalysis {
  return analysis;
}
