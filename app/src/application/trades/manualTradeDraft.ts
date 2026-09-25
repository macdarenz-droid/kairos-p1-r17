import type { MarketType, TradeSide, TradeStatus } from '../../domain/trades';
import { parseForexPair, type ForexPair, type ForexPairProblem } from '../markets/forexPair';
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
    }
  | { readonly ok: false; readonly type: 'forex-pair'; readonly field: 'symbol'; readonly reason: ForexPairProblem }
  | { readonly ok: false; readonly type: 'forex-price-currency'; readonly field: 'grossPnlCurrency'; readonly reason: 'not-the-quote-currency'; readonly pair: ForexPair };

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

  // P31: a forex symbol must be a currency pair, and — only when its quote is a currency Kairos knows — its prices and result are in the pair's quote currency (D97).
  let priceCurrency = draft.priceCurrency;
  if (draft.marketType === 'forex') {
    const parsed = parseForexPair(draft.symbol);
    if (!parsed.ok) return { ok: false, type: 'forex-pair', field: 'symbol', reason: parsed.reason };
    if (parsed.pair.quoteKnown) {
      const typed = draft.priceCurrency?.trim().toUpperCase() ?? '';
      if (typed !== '' && typed !== parsed.pair.quote) {
        return { ok: false, type: 'forex-price-currency', field: 'grossPnlCurrency', reason: 'not-the-quote-currency', pair: parsed.pair };
      }
      priceCurrency = parsed.pair.quote;
    }
  }

  const input: SaveManualTradeInput = {
    ...(priceCurrency?.trim() ? { grossPnlCurrency: priceCurrency } : {}),
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
