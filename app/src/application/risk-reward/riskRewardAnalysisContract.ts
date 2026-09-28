import type { DecimalString, TradeSide } from '../../domain/trades';

export type RiskRewardAnalysisId = string;

export interface RiskRewardAnalysisLevels {
  readonly entry: DecimalString;
  readonly stop: DecimalString;
  readonly target: DecimalString;
}

export interface RiskRewardAnalysis {
  readonly id: RiskRewardAnalysisId;
  readonly side: TradeSide;
  readonly levels: RiskRewardAnalysisLevels;
}

export function defineRiskRewardAnalysis(
  analysis: RiskRewardAnalysis,
): RiskRewardAnalysis {
  return analysis;
}
