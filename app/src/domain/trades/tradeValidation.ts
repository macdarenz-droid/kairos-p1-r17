import { areNormalTradeTags } from './tradeTags';
import type { DecimalString, TradePlanRecord, TradeRecord } from './tradeTypes';

const DECIMAL_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/;
const POSITIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;

export type DomainValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: string };

export function parseDecimalString(value: string): DomainValidationResult<DecimalString> {
  const normalized = value.trim();
  if (!DECIMAL_PATTERN.test(normalized)) {
    return { ok: false, reason: 'invalid-decimal' };
  }
  return { ok: true, value: normalized as DecimalString };
}

export function parsePositiveDecimalString(value: string): DomainValidationResult<DecimalString> {
  const parsed = parseDecimalString(value);
  if (!parsed.ok || !POSITIVE_DECIMAL_PATTERN.test(parsed.value) || /^0(?:\.0+)?$/.test(parsed.value)) {
    return { ok: false, reason: 'must-be-positive' };
  }
  return parsed;
}

/** U11: where a trade was traded, at most this many characters. */
export const TRADE_EXCHANGE_MAX_LENGTH = 40;
/** U11: "Why I'm taking it", at most this many characters. */
export const TRADE_PLAN_REASON_MAX_LENGTH = 500;
/** U15 (D265): a trade's note, at most this many characters. */
export const TRADE_NOTE_MAX_LENGTH = 2000;
/** U11: the most leverage Kairos accepts, as a whole number (1000 means 1000×). */
export const TRADE_LEVERAGE_MAX = 1000;

/** A trimmed text of 1 to `max` characters. */
const isTrimmedText = (value: unknown, max: number): boolean =>
  typeof value === 'string' && value === value.trim() && value !== '' && Array.from(value).length <= max;

/** Where a trade was traded, written the one way: one line, trimmed, its inner spaces and line breaks joined into one space. */
export function writeTradeExchange(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** A positive decimal no larger than `max` (a whole number), compared as text: never through Number(). */
function isPositiveDecimalAtMost(value: unknown, max: number): boolean {
  if (typeof value !== 'string' || !parsePositiveDecimalString(value).ok || value !== value.trim()) return false;
  const [whole, fraction = ''] = value.split('.');
  const limit = String(max);
  if (whole.length !== limit.length) return whole.length < limit.length;
  return whole < limit || (whole === limit && /^0*$/.test(fraction));
}

/**
 * U11 (D237–D239): the one check of a trade's optional fields. Each may be absent; when present the contract size is a
 * positive decimal, where it was traded is a one-line name of at most 40 characters, the tags are in their one written
 * form (never an empty list: no tags is an absent key), and the leverage is a positive decimal of at most 1000.
 */
export function validateTradeFields(trade: Pick<TradeRecord, 'contractSize' | 'exchange' | 'tags' | 'leverage' | 'note'>): DomainValidationResult<true> {
  if (trade.contractSize != null && !(typeof trade.contractSize === 'string' && parsePositiveDecimalString(trade.contractSize).ok && trade.contractSize === trade.contractSize.trim())) {
    return { ok: false, reason: 'invalid-contract-size' };
  }
  if (trade.exchange != null && !(isTrimmedText(trade.exchange, TRADE_EXCHANGE_MAX_LENGTH) && trade.exchange === writeTradeExchange(trade.exchange))) {
    return { ok: false, reason: 'invalid-exchange' };
  }
  if (trade.tags !== undefined && !(areNormalTradeTags(trade.tags) && trade.tags.length > 0)) return { ok: false, reason: 'invalid-tags' };
  if (trade.leverage != null && !isPositiveDecimalAtMost(trade.leverage, TRADE_LEVERAGE_MAX)) return { ok: false, reason: 'invalid-leverage' };
  if (trade.note != null && !isTrimmedText(trade.note, TRADE_NOTE_MAX_LENGTH)) return { ok: false, reason: 'invalid-note' };
  return { ok: true, value: true };
}

/** U11: the one check of a plan's optional fields: "Why I'm taking it" is absent, or a trimmed text of at most 500 characters. */
export function validateTradePlanFields(plan: Pick<TradePlanRecord, 'reason'>): DomainValidationResult<true> {
  if (plan.reason != null && !isTrimmedText(plan.reason, TRADE_PLAN_REASON_MAX_LENGTH)) return { ok: false, reason: 'invalid-plan-reason' };
  return { ok: true, value: true };
}

export function validateTradeRecord(trade: TradeRecord): DomainValidationResult<TradeRecord> {
  if (trade.grossPnlCurrency != null && (typeof trade.grossPnlCurrency !== 'string' || !trade.grossPnlCurrency.trim() || trade.grossPnlCurrency !== trade.grossPnlCurrency.trim().toUpperCase())) {
    return { ok: false, reason: 'invalid-pnl-currency' };
  }
  if (!trade.symbol.trim()) return { ok: false, reason: 'symbol-required' };
  if (trade.status === 'draft' && (trade.openedAt !== null || trade.closedAt !== null)) {
    return { ok: false, reason: 'draft-cannot-have-execution-times' };
  }
  if (trade.status === 'open' && trade.openedAt === null) {
    return { ok: false, reason: 'open-requires-opened-at' };
  }
  if (trade.status === 'closed' && (trade.openedAt === null || trade.closedAt === null)) {
    return { ok: false, reason: 'closed-requires-open-and-close-times' };
  }
  if (trade.closedAt !== null && trade.openedAt === null) {
    return { ok: false, reason: 'close-requires-open' };
  }
  if (trade.openedAt !== null && trade.closedAt !== null && trade.closedAt < trade.openedAt) {
    return { ok: false, reason: 'close-before-open' };
  }
  const fields = validateTradeFields(trade);
  if (!fields.ok) return fields;
  return { ok: true, value: trade };
}
