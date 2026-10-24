import { describe, expect, it } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal/historyQuery';
import { MARKET_TILES_SHOWN, projectMarketTiles } from '../src/application/performance/marketTiles';
import type { VisualPnlOutcomeProjection } from '../src/application/visual-pnl';
import { parseDecimalString, type MarketType, type TradeRecord } from '../src/domain/trades';

function visual(amount: string, currency: string): VisualPnlOutcomeProjection {
  const parsed = parseDecimalString(amount);
  if (!parsed.ok) throw new Error(`fixture ${amount}`);
  const outcome = amount.startsWith('-') ? 'loss' : amount === '0' ? 'breakeven' : 'profit';
  return Object.freeze({ outcome, label: 'Profit', amount: parsed.value, currency, source: 'net-pnl' }) as VisualPnlOutcomeProjection;
}
let ids = 0;
function entry(symbol: string, amount: string, currency = 'USDT', marketType: MarketType = 'crypto'): JournalHistoryEntry {
  ids += 1;
  const at = new Date(Date.UTC(2026, 8, 1, 0, ids)).toISOString();
  return {
    trade: { id: `t-${ids}`, symbol, marketType, side: 'long', status: 'closed', openedAt: at, closedAt: at, createdAt: at, updatedAt: at } as TradeRecord,
    plans: [], executions: [], fees: [], metrics: null, metricsError: null, visualPnl: visual(amount, currency),
  };
}
const many = (symbol: string, amounts: readonly string[], currency = 'USDT') => amounts.map(amount => entry(symbol, amount, currency));

describe('T-051j your markets as tiles', () => {
  it('sizes tiles by money made or lost, largest first, with each market\'s counts', () => {
    const btc = many('BTCUSDT', ['50', '60', '40', '-10', '-20']);
    const eth = many('ETHUSDT', ['-10', '-20']);
    const tiles = projectMarketTiles([...btc, ...eth]);
    expect([tiles.sizeBasis, tiles.currency]).toEqual(['money', 'USDT']);
    expect(tiles.tiles.map(tile => [tile.key, tile.symbol, tile.size])).toEqual([['crypto:BTCUSDT', 'BTCUSDT', 3], ['crypto:ETHUSDT', 'ETHUSDT', 1]]);
    expect(tiles.tiles[0]).toMatchObject({ marketType: 'crypto', marketCount: 1, total: { available: true, total: '120', currency: 'USDT', tradeCount: 5 }, outcomes: { won: 3, lost: 2, resultCount: 5 } });
    expect(tiles.tiles[0]!.tradeIds).toEqual(btc.map(item => item.trade.id));
    expect(Object.isFrozen(tiles) && Object.isFrozen(tiles.tiles) && Object.isFrozen(tiles.tiles[0])).toBe(true);
  });

  it('sizes by trades when currencies differ, or every total is 0', () => {
    const mixed = projectMarketTiles([...many('BTCUSDT', ['5', '5', '5']), ...many('SAP.DE', ['100'], 'EUR')]);
    expect([mixed.sizeBasis, mixed.currency]).toEqual(['trades', null]);
    expect(mixed.tiles.map(tile => [tile.symbol, tile.size])).toEqual([['BTCUSDT', 3], ['SAP.DE', 1]]);
    const flat = projectMarketTiles([...many('BTCUSDT', ['0']), ...many('ETHUSDT', ['0', '0'])]);
    expect([flat.sizeBasis, flat.currency]).toEqual(['trades', 'USDT']);
    expect(flat.tiles.map(tile => tile.symbol)).toEqual(['ETHUSDT', 'BTCUSDT']);
  });

  it('keeps a symbol saved under two market types apart', () => {
    const tiles = projectMarketTiles([entry('BTCUSDT', '10'), entry('BTCUSDT', '20', 'USDT', 'futures')]);
    expect(tiles.tiles.map(tile => tile.key)).toEqual(['futures:BTCUSDT', 'crypto:BTCUSDT']);
  });

  it(`joins markets past ${MARKET_TILES_SHOWN} into "other"`, () => {
    const entries = Array.from({ length: 14 }, (_, index) => entry(`M${String(index).padStart(2, '0')}`, String(100 - index)));
    const tiles = projectMarketTiles(entries);
    expect(tiles.tiles).toHaveLength(12);
    const other = tiles.tiles[11]!;
    expect(other).toMatchObject({ key: 'other', symbol: null, marketType: null, marketCount: 3, total: { available: true, total: String(89 + 88 + 87) } });
    expect(other.tradeIds).toEqual(entries.slice(11).map(item => item.trade.id));
    expect(tiles.tiles.slice(0, 11).map(tile => tile.symbol)).toEqual(entries.slice(0, 11).map(item => item.trade.symbol));
  });

  it('orders equal totals by trades, then by symbol A to Z, and counts the "other" tile on its own (fix r1)', () => {
    const tiles = projectMarketTiles([...many('XRPUSDT', ['5']), ...many('ADAUSDT', ['5']), ...many('SOLUSDT', ['2', '3'])]);
    expect(tiles.tiles.map(tile => tile.symbol)).toEqual(['SOLUSDT', 'ADAUSDT', 'XRPUSDT']);
    const entries = [...Array.from({ length: 11 }, (_, index) => entry(`M${String(index).padStart(2, '0')}`, String(100 - index))), entry('W1', '9'), entry('W2', '-8'), entry('W3', '0')];
    const other = projectMarketTiles(entries).tiles[11]!;
    expect(other.outcomes).toMatchObject({ tradeCount: 3, won: 1, lost: 1, breakEven: 1, resultCount: 3 });
    expect(other.total).toMatchObject({ available: true, total: '1', tradeCount: 3 });
  });
});
