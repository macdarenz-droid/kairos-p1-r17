import { describe, expect, it } from 'vitest';
import { projectPriceMove, type PriceMoveInput } from '../src/application/performance/priceMove';
import { projectTradePicture, type TradePictureInput } from '../src/application/trade-visualizer';
import {
  parseDecimalString,
  type DecimalString,
  type TradeExecutionId,
  type TradeExecutionRecord,
  type TradeFeeId,
  type TradeFeeRecord,
  type TradeId,
  type TradePlanId,
  type TradeRecord,
} from '../src/domain/trades';
import type { MarketCandle } from '../src/services/market-data/MarketCandleHistoryPort';

function dec(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`fixture decimal ${value}`);
  return parsed.value;
}
const tradeId = 'trade-1' as TradeId;
const at = (time: string) => `2026-09-20T${time}:00.000Z`;
const ms = (time: string) => Date.parse(at(time));
function fill(id: string, type: 'entry' | 'exit', price: string, quantity: string, executedAt: string): TradeExecutionRecord {
  return { id: id as TradeExecutionId, tradeId, type, price: dec(price), quantity: dec(quantity), executedAt, createdAt: executedAt };
}
function candle(open: string, close: string, high: string, low: string): MarketCandle {
  return { openTime: at(open), closeTime: `2026-09-20T${close}:59.999Z`, open: dec(low), high: dec(high), low: dec(low), close: dec(high) };
}
/** One-hour candles: 09:00 ends before the entry at 10:00, and 13:00 opens at the exit at 13:00. */
const hourly: MarketCandle[] = [
  candle('09:00', '09:59', '200', '100'),
  candle('10:00', '10:59', '105', '98'),
  candle('11:00', '11:59', '112', '101'),
  candle('12:00', '12:59', '108', '99'),
  candle('13:00', '13:59', '150', '90'),
];
const long = (overrides: Partial<PriceMoveInput> = {}): PriceMoveInput => ({
  side: 'long', executions: [fill('e1', 'entry', '100', '1', at('10:00')), fill('x1', 'exit', '105', '1', at('13:00'))],
  startMs: ms('10:00'), endMs: ms('13:00'), stillOpen: false, candles: hourly, ...overrides,
});

describe('T-050f how far price went for and against you', () => {
  it('measures a long from the candles in the trade only, not "about"', () => {
    expect(projectPriceMove(long())).toEqual({
      available: true, averageEntry: '100', highest: '112', highestAt: at('11:00'), lowest: '98', lowestAt: at('10:00'),
      forYou: '12', againstYou: '2', shownForYou: '12', shownAgainstYou: '2', forYouIsAbout: false, againstYouIsAbout: false, soFar: false, candleCount: 3,
    });
  });

  it('says "about" when the extreme candle runs past the entry or the exit', () => {
    const move = projectPriceMove(long({ startMs: ms('10:15'), endMs: ms('10:45'), candles: [{ ...candle('08:00', '11:59', '120', '90') }] }));
    expect(move).toMatchObject({ available: true, forYou: '20', againstYou: '10', forYouIsAbout: true, againstYouIsAbout: true, candleCount: 1 });
  });

  it('measures a short the other way round', () => {
    expect(projectPriceMove(long({ side: 'short' }))).toMatchObject({ available: true, forYou: '2', againstYou: '12' });
  });

  it('marks an open trade as "so far"', () => {
    expect(projectPriceMove(long({ stillOpen: true }))).toMatchObject({ available: true, soFar: true });
  });

  it('refuses an entry the candles never reach, and keeps a real 0', () => {
    expect(projectPriceMove(long({ executions: [fill('e1', 'entry', '120', '1', at('10:00'))] }))).toEqual({ available: false, reason: 'entry-outside-candles' });
    expect(projectPriceMove(long({ executions: [fill('e1', 'entry', '98', '1', at('10:00'))] }))).toMatchObject({ available: true, againstYou: '0', forYou: '14' });
  });

  it('says why there is nothing to measure', () => {
    expect(projectPriceMove(long({ candles: null }))).toEqual({ available: false, reason: 'no-candles' });
    expect(projectPriceMove(long({ executions: [] }))).toEqual({ available: false, reason: 'no-entry' });
  });

  it('keeps the exact move and shows it to the most places among the entries and the extreme', () => {
    const move = projectPriceMove(long({ executions: [fill('e1', 'entry', '100', '1', at('10:00')), fill('e2', 'entry', '100.5', '2', at('10:00'))] }));
    if (!move.available) throw new Error(move.reason);
    expect(move.averageEntry.startsWith('100.333')).toBe(true);
    expect(move.forYou.startsWith('11.666')).toBe(true);
    expect(move.shownForYou).toBe('11.7');
  });
});

describe('T-050f the price move on the trade picture', () => {
  /** The picture's rows before T-050f: the price move adds none. */
  const INFO_KEYS = ['market', 'direction', 'opened', 'closed', 'planned-entry', 'stop', 'target', 'average-exit', 'size', 'result', 'planned-reward', 'actual-r', 'duration', 'status'];
  const opened = '2026-09-20T09:00:00.000Z', closed = '2026-09-20T12:00:00.000Z', now = '2026-09-24T12:00:00.000Z';
  const trade = (overrides: Partial<TradeRecord> = {}): TradeRecord => ({ id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed, createdAt: opened, updatedAt: closed, ...overrides });
  const plans = [{ id: 'plan-1' as TradePlanId, tradeId, plannedEntryPrice: dec('100'), plannedStopPrice: dec('90'), plannedTargetPrice: dec('130'), plannedQuantity: dec('2'), createdAt: opened, updatedAt: opened }];
  const fee = { id: 'fee-1' as TradeFeeId, tradeId, executionId: null, amount: dec('1'), currency: 'USDT', createdAt: closed } as TradeFeeRecord;
  const longInput: TradePictureInput = {
    trade: trade(), plans, executions: [fill('e1', 'entry', '100', '2', opened), fill('x1', 'exit', '120', '2', closed)], fees: [fee],
    candles: [
      { openTime: '2026-09-20T08:00:00.000Z', closeTime: '2026-09-20T09:59:59.999Z', open: dec('98'), high: dec('105'), low: dec('95'), close: dec('104') },
      { openTime: '2026-09-20T10:00:00.000Z', closeTime: '2026-09-20T13:59:59.999Z', open: dec('104'), high: dec('125'), low: dec('103'), close: dec('121') },
    ],
    now,
  };

  it('carries the price move on the model, never as an info row', () => {
    const model = projectTradePicture(longInput);
    expect(model.priceMove.available).toBe(true);
    expect(model.info.map(row => row.key)).toEqual(INFO_KEYS);
  });

  it('measures an open, partly exited trade up to now', () => {
    const model = projectTradePicture({
      trade: trade({ status: 'open', openedAt: at('10:00'), closedAt: null }), plans: [], fees: [],
      executions: [fill('e1', 'entry', '100', '2', at('10:00')), fill('x1', 'exit', '105', '1', at('11:00'))],
      candles: hourly, now: '2026-09-20T13:30:00.000Z',
    });
    expect(model.priceMove).toMatchObject({ available: true, forYou: '50', forYouIsAbout: true, soFar: true });
  });
});
