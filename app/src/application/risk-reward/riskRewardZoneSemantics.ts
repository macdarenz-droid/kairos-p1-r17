import type { DecimalString } from '../../domain/trades';
import type { RiskRewardAnalysis } from './riskRewardAnalysisContract';

export type RiskRewardZoneRole = 'risk' | 'reward';

export interface RiskRewardSemanticPriceZone {
  readonly role: RiskRewardZoneRole;
  readonly from: DecimalString;
  readonly to: DecimalString;
}

export interface RiskRewardZoneSemantics {
  readonly risk: RiskRewardSemanticPriceZone;
  readonly reward: RiskRewardSemanticPriceZone;
}

export function projectRiskRewardZoneSemantics(
  analysis: RiskRewardAnalysis,
): RiskRewardZoneSemantics {
  return {
    risk: {
      role: 'risk',
      from: analysis.levels.entry,
      to: analysis.levels.stop,
    },
    reward: {
      role: 'reward',
      from: analysis.levels.entry,
      to: analysis.levels.target,
    },
  };
}
