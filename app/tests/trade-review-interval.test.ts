import { describe, expect, it } from 'vitest';
import {
  normalizeTradeSymbol,
  pickTradeReviewInterval,
  tradeReviewTimes,
  tradeReviewVisibleRange,
} from '../src/features/analysis/tradeReviewInterval';
import { BINANCE_SPOT_CANDLE_INTERVALS } from '../src/services/market-data/providers/binance/binanceSpotCandleHistoryRequest';
import type { JournalHistoryEntry } from '../src/application/journal';

const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;
const now = Date.parse('2026-09-24T12:00:00.000Z');

describe('pickTradeReviewInterval', () => {
  it.each([
    ['1 hour ago', HOUR, '5m'],
    ['2 days ago', 2 * DAY, '15m'],
    ['10 days ago', 10 * DAY, '1h'],
    ['30 days ago', 30 * DAY, '4h'],
    ['200 days ago', 200 * DAY, '1d'],
    ['3 years ago', 3 * 365 * DAY, '1w'],
  ])('%s → %s', (_label, elapsed, expected) => {
    expect(pickTradeReviewInterval(now - elapsed, now)).toBe(expected);
  });

  it('keeps the start within 400 candles, switching at the exact limit', () => {
    expect(pickTradeReviewInterval(now - 400 * 5 * MINUTE, now)).toBe('5m');
    expect(pickTradeReviewInterval(now - 400 * 5 * MINUTE - 1, now)).toBe('15m');
  });

  it('only returns timeframes Binance Spot offers', () => {
    for (const elapsed of [0, HOUR, DAY, 30 * DAY, 400 * DAY, 3000 * DAY]) {
      expect(BINANCE_SPOT_CANDLE_INTERVALS).toContain(pickTradeReviewInterval(now - elapsed, now));
    }
  });
});

describe('tradeReviewVisibleRange', () => {
  it('a 3-hour trade on 5m keeps at least 20 candles each side', () => {
    const start = now - 5 * HOUR, end = start + 3 * HOUR;
    // 20% of 3 h is 36 min (7.2 candles), so the 20-candle floor (100 min) wins.
    expect(tradeReviewVisibleRange(start, end, 5 * MINUTE)).toEqual({ fromMs: start - 100 * MINUTE, toMs: end + 100 * MINUTE });
  });

  it('a long trade is padded by 20% of its length on each side', () => {
    const start = now - 30 * DAY, end = start + 20 * DAY;
    expect(tradeReviewVisibleRange(start, end, HOUR)).toEqual({ fromMs: start - 4 * DAY, toMs: end + 4 * DAY });
  });

  it('an open trade ends at now', () => {
    const entry = {
      trade: { status: 'open', openedAt: '2026-09-24T09:00:00.000Z', closedAt: null, createdAt: '2026-09-24T08:00:00.000Z' },
      executions: [{ type: 'entry', executedAt: '2026-09-24T09:05:00.000Z' }],
    } as unknown as JournalHistoryEntry;
    const times = tradeReviewTimes(entry);
    expect(times).toEqual({ startMs: Date.parse('2026-09-24T09:05:00.000Z'), endMs: null });
    const range = tradeReviewVisibleRange(times.startMs!, times.endMs ?? now, 5 * MINUTE);
    expect(range.toMs).toBe(now + 100 * MINUTE);
  });
});

describe('tradeReviewTimes', () => {
  it('uses the earliest fill and the last exit', () => {
    const entry = {
      trade: { status: 'closed', openedAt: '2026-09-20T09:00:00.000Z', closedAt: '2026-09-20T12:00:00.000Z', createdAt: '2026-09-20T08:00:00.000Z' },
      executions: [
        { type: 'exit', executedAt: '2026-09-20T11:00:00.000Z' },
        { type: 'entry', executedAt: '2026-09-20T09:30:00.000Z' },
        { type: 'exit', executedAt: '2026-09-20T11:30:00.000Z' },
      ],
    } as unknown as JournalHistoryEntry;
    expect(tradeReviewTimes(entry)).toEqual({ startMs: Date.parse('2026-09-20T09:30:00.000Z'), endMs: Date.parse('2026-09-20T11:30:00.000Z') });
  });

  it('falls back to opened, then created, and to closedAt without exits', () => {
    const base = { status: 'closed', closedAt: '2026-09-20T12:00:00.000Z', createdAt: '2026-09-20T08:00:00.000Z' };
    expect(tradeReviewTimes({ trade: { ...base, openedAt: '2026-09-20T09:00:00.000Z' }, executions: [] } as unknown as JournalHistoryEntry))
      .toEqual({ startMs: Date.parse('2026-09-20T09:00:00.000Z'), endMs: Date.parse('2026-09-20T12:00:00.000Z') });
    expect(tradeReviewTimes({ trade: { ...base, openedAt: null }, executions: [] } as unknown as JournalHistoryEntry).startMs)
      .toBe(Date.parse('2026-09-20T08:00:00.000Z'));
  });
});

describe('normalizeTradeSymbol', () => {
  it.each([['BTC/USDT', 'BTCUSDT'], ['eth-usdt', 'ETHUSDT'], [' SOL USDT ', 'SOLUSDT'], ['BTCUSDT', 'BTCUSDT']])('%s → %s', (input, expected) => {
    expect(normalizeTradeSymbol(input)).toBe(expected);
  });
});
