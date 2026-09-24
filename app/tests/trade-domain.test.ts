import { describe, expect, it } from 'vitest';
import {
  createTradeDomainId,
  parseDecimalString,
  parsePositiveDecimalString,
  validateTradeRecord,
  type TradeId,
  type TradeRecord,
} from '../src/domain/trades';

const baseTrade: TradeRecord = {
  id: 'trade-1' as TradeId,
  symbol: 'AAPL',
  marketType: 'stock',
  side: 'long',
  status: 'draft',
  source: 'manual',
  openedAt: null,
  closedAt: null,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
};

describe('P9.1 trade domain', () => {
  it('accepts canonical decimal strings without coercing missing or invalid values to zero', () => {
    expect(parseDecimalString('123.4500')).toEqual({ ok: true, value: '123.4500' });
    expect(parseDecimalString('')).toEqual({ ok: false, reason: 'invalid-decimal' });
    expect(parseDecimalString('1e3')).toEqual({ ok: false, reason: 'invalid-decimal' });
  });

  it('requires positive execution quantities and prices', () => {
    expect(parsePositiveDecimalString('0')).toEqual({ ok: false, reason: 'must-be-positive' });
    expect(parsePositiveDecimalString('-1')).toEqual({ ok: false, reason: 'must-be-positive' });
    expect(parsePositiveDecimalString('0.01')).toEqual({ ok: true, value: '0.01' });
  });

  it('enforces lifecycle timestamp invariants without calculating financial metrics', () => {
    expect(validateTradeRecord(baseTrade).ok).toBe(true);
    expect(validateTradeRecord({ ...baseTrade, status: 'open' })).toEqual({ ok: false, reason: 'open-requires-opened-at' });
    expect(validateTradeRecord({ ...baseTrade, status: 'closed', openedAt: '2026-09-01T02:00:00Z', closedAt: '2026-09-01T01:00:00Z' })).toEqual({ ok: false, reason: 'close-before-open' });
  });

  it('creates UUID-shaped stable domain identifiers', () => {
    expect(createTradeDomainId<TradeId>()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });
});
