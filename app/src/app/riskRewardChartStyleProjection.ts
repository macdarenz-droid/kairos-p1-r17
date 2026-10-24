import type { RiskRewardChartSemantics } from '../application/risk-reward';
import { semanticTokens } from '../design-system/tokens/semantic';

export interface RiskRewardChartStyleRoleProjection<Role extends string> {
  readonly role: Role;
  readonly token: string;
}

export interface RiskRewardChartStyleProjection {
  readonly entry: RiskRewardChartStyleRoleProjection<'entry'>;
  readonly stop: RiskRewardChartStyleRoleProjection<'stop'>;
  readonly target: RiskRewardChartStyleRoleProjection<'target'>;
  readonly risk: RiskRewardChartStyleRoleProjection<'risk'>;
  readonly reward: RiskRewardChartStyleRoleProjection<'reward'>;
}

export function projectRiskRewardChartStyle(
  semantics: RiskRewardChartSemantics,
): RiskRewardChartStyleProjection {
  if (semantics.levels.entry.role !== 'entry') throw new Error('Risk/Reward entry semantic role drifted');
  if (semantics.levels.stop.role !== 'stop') throw new Error('Risk/Reward stop semantic role drifted');
  if (semantics.levels.target.role !== 'target') throw new Error('Risk/Reward target semantic role drifted');
  if (semantics.zones.risk.role !== 'risk') throw new Error('Risk/Reward risk-zone semantic role drifted');
  if (semantics.zones.reward.role !== 'reward') throw new Error('Risk/Reward reward-zone semantic role drifted');

  return {
    entry: { role: semantics.levels.entry.role, token: semanticTokens.trade.entry },
    stop: { role: semantics.levels.stop.role, token: semanticTokens.trade.stop },
    target: { role: semantics.levels.target.role, token: semanticTokens.trade.target },
    risk: { role: semantics.zones.risk.role, token: semanticTokens.trade.riskZone },
    reward: { role: semantics.zones.reward.role, token: semanticTokens.trade.rewardZone },
  };
}
