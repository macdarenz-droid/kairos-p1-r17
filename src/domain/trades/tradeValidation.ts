import type { DecimalString, TradeRecord } from './tradeTypes';

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

export function validateTradeRecord(trade: TradeRecord): DomainValidationResult<TradeRecord> {
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
  return { ok: true, value: trade };
}
