import type { StoredChartDrawing, StoredChartMarketReference, StoredRiskRewardAnalysis, StoredRiskRewardChartTimeExtent } from './storedShapes';

export type SavedAnalysisId = string;

export interface SavedRiskRewardAnalysis {
  readonly analysis: StoredRiskRewardAnalysis;
  readonly extent: StoredRiskRewardChartTimeExtent;
}

export interface SavedAnalysis {
  readonly id: SavedAnalysisId;
  readonly market: StoredChartMarketReference;
  readonly drawings: readonly StoredChartDrawing[];
  readonly riskRewards: readonly SavedRiskRewardAnalysis[];
  /** P25.1 optional user-given label (trimmed, non-empty, at most 80 characters); absent on every released record. */
  readonly label?: string;
}

export function defineSavedAnalysis(analysis: SavedAnalysis): SavedAnalysis {
  return analysis;
}
