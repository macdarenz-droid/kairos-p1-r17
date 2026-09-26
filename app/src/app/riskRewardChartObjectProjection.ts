import type { DecimalString, TradeSide } from '../domain/trades';
import type { RiskRewardChartSemantics } from '../application/risk-reward';
import type { ChartTimestamp } from '../features/chart';
import type { RiskRewardChartPlacementProjection } from './riskRewardChartPlacementProjection';
import type { RiskRewardChartStyleProjection } from './riskRewardChartStyleProjection';

export interface RiskRewardChartLogicalLevelSpan<
  Role extends 'entry' | 'stop' | 'target',
> {
  readonly role: Role;
  readonly token: string;
  readonly start: ChartTimestamp;
  readonly end: ChartTimestamp;
  readonly price: DecimalString;
}

export interface RiskRewardChartLogicalZone<Role extends 'risk' | 'reward'> {
  readonly role: Role;
  readonly token: string;
  readonly start: ChartTimestamp;
  readonly end: ChartTimestamp;
  readonly from: DecimalString;
  readonly to: DecimalString;
}

export interface RiskRewardChartObjectProjection {
  readonly id: RiskRewardChartSemantics['id'];
  readonly side: TradeSide;
  readonly levels: {
    readonly entry: RiskRewardChartLogicalLevelSpan<'entry'>;
    readonly stop: RiskRewardChartLogicalLevelSpan<'stop'>;
    readonly target: RiskRewardChartLogicalLevelSpan<'target'>;
  };
  readonly zones: {
    readonly risk: RiskRewardChartLogicalZone<'risk'>;
    readonly reward: RiskRewardChartLogicalZone<'reward'>;
  };
}

export function projectRiskRewardChartObject(
  semantics: RiskRewardChartSemantics,
  style: RiskRewardChartStyleProjection,
  placement: RiskRewardChartPlacementProjection,
): RiskRewardChartObjectProjection {
  return {
    id: semantics.id,
    side: semantics.side,
    levels: {
      entry: {
        role: style.entry.role,
        token: style.entry.token,
        start: placement.start,
        end: placement.end,
        price: semantics.levels.entry.price,
      },
      stop: {
        role: style.stop.role,
        token: style.stop.token,
        start: placement.start,
        end: placement.end,
        price: semantics.levels.stop.price,
      },
      target: {
        role: style.target.role,
        token: style.target.token,
        start: placement.start,
        end: placement.end,
        price: semantics.levels.target.price,
      },
    },
    zones: {
      risk: {
        role: style.risk.role,
        token: style.risk.token,
        start: placement.start,
        end: placement.end,
        from: semantics.zones.risk.from,
        to: semantics.zones.risk.to,
      },
      reward: {
        role: style.reward.role,
        token: style.reward.token,
        start: placement.start,
        end: placement.end,
        from: semantics.zones.reward.from,
        to: semantics.zones.reward.to,
      },
    },
  };
}
