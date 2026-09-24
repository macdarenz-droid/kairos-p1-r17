import type { MarketType, TradeSide, TradeStatus } from '../../domain/trades';
import type { SaveManualTradeInput } from './saveManualTrade';

export type ManualTradeDraftMarketType = MarketType | '';
export type ManualTradeDraftSide = TradeSide | '';
export type ManualTradeDraftStatus = TradeStatus | '';

export interface ManualTradeDraftPlan {
  readonly plannedEntryPrice: string;
  readonly plannedStopPrice: string;
  readonly plannedTargetPrice: string;
  readonly plannedQuantity: string;
}

export interface ManualTradeDraft {
  readonly priceCurrency?: string;
  readonly symbol: string;
  readonly marketType: ManualTradeDraftMarketType;
  readonly side: ManualTradeDraftSide;
  readonly status: ManualTradeDraftStatus;
  readonly openedAt: string;
  readonly closedAt: string;
  readonly plan: ManualTradeDraftPlan;
}

export type ManualTradeDraftRequiredField = 'marketType' | 'side' | 'status';

export type PrepareManualTradeSubmissionResult =
  | {
      readonly ok: true;
      readonly input: SaveManualTradeInput;
    }
  | {
      readonly ok: false;
      readonly type: 'draft-incomplete';
      readonly field: ManualTradeDraftRequiredField;
      readonly reason: 'selection-required';
    };

export function createEmptyManualTradeDraft(): ManualTradeDraft {
  return {
    symbol: '',
    marketType: '',
    side: '',
    status: '',
    openedAt: '',
    closedAt: '',
    plan: {
      plannedEntryPrice: '',
      plannedStopPrice: '',
      plannedTargetPrice: '',
      plannedQuantity: '',
    },
  };
}

function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function hasPlanValue(plan: ManualTradeDraftPlan): boolean {
  return Object.values(plan).some((value) => value.trim() !== '');
}

export function prepareManualTradeSubmission(
  draft: ManualTradeDraft,
): PrepareManualTradeSubmissionResult {
  if (!draft.marketType) {
    return { ok: false, type: 'draft-incomplete', field: 'marketType', reason: 'selection-required' };
  }
  if (!draft.side) {
    return { ok: false, type: 'draft-incomplete', field: 'side', reason: 'selection-required' };
  }
  if (!draft.status) {
    return { ok: false, type: 'draft-incomplete', field: 'status', reason: 'selection-required' };
  }

  const input: SaveManualTradeInput = {
    ...(draft.priceCurrency?.trim() ? { grossPnlCurrency: draft.priceCurrency } : {}),
    symbol: draft.symbol,
    marketType: draft.marketType,
    side: draft.side,
    status: draft.status,
    openedAt: optionalText(draft.openedAt),
    closedAt: optionalText(draft.closedAt),
    ...(hasPlanValue(draft.plan)
      ? {
          plan: {
            plannedEntryPrice: optionalText(draft.plan.plannedEntryPrice),
            plannedStopPrice: optionalText(draft.plan.plannedStopPrice),
            plannedTargetPrice: optionalText(draft.plan.plannedTargetPrice),
            plannedQuantity: optionalText(draft.plan.plannedQuantity),
          },
        }
      : {}),
  };

  return { ok: true, input };
}
