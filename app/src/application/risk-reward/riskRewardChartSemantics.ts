import type { DecimalString, TradeSide } from '../../domain/trades';
import type {
  RiskRewardAnalysis,
  RiskRewardAnalysisId,
} from './riskRewardAnalysisContract';
import {
  projectRiskRewardZoneSemantics,
  type RiskRewardZoneSemantics,
} from './riskRewardZoneSemantics';

export type RiskRewardChartLevelRole = 'entry' | 'stop' | 'target';

export interface RiskRewardChartSemanticPriceLevel {
  readonly role: RiskRewardChartLevelRole;
  readonly price: DecimalString;
}

export interface RiskRewardChartSemanticLevels {
  readonly entry: RiskRewardChartSemanticPriceLevel;
  readonly stop: RiskRewardChartSemanticPriceLevel;
  readonly target: RiskRewardChartSemanticPriceLevel;
}

export interface RiskRewardChartSemantics {
  readonly id: RiskRewardAnalysisId;
  readonly side: TradeSide;
  readonly levels: RiskRewardChartSemanticLevels;
  readonly zones: RiskRewardZoneSemantics;
}

export function projectRiskRewardChartSemantics(
  analysis: RiskRewardAnalysis,
): RiskRewardChartSemantics {
  return {
    id: analysis.id,
    side: analysis.side,
    levels: {
      entry: { role: 'entry', price: analysis.levels.entry },
      stop: { role: 'stop', price: analysis.levels.stop },
      target: { role: 'target', price: analysis.levels.target },
    },
    zones: projectRiskRewardZoneSemantics(analysis),
  };
}
