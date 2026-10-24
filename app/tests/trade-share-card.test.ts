import { describe, expect, it } from 'vitest';
import { describeTradeShareCard, projectTradePicture, projectTradeShareCard, type TradePictureInput } from '../src/application/trade-visualizer';
import { parseDecimalString, type DecimalString, type TradeExecutionId, type TradeFeeId, type TradeFeeRecord, type TradeId, type TradePlanId, type TradeRecord } from '../src/domain/trades';

function dec(value: string): DecimalString { const parsed = parseDecimalString(value); if (!parsed.ok) throw new Error(value); return parsed.value; }
const tradeId = 'trade-1' as TradeId;
const opened = '2026-09-20T09:00:00.000Z', closed = '2026-09-20T12:00:00.000Z';
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed, createdAt: opened, updatedAt: closed };
const plans = [{ id: 'p1' as TradePlanId, tradeId, plannedEntryPrice: dec('100'), plannedStopPrice: dec('90'), plannedTargetPrice: dec('130'), plannedQuantity: dec('2'), createdAt: opened, updatedAt: opened }];
const fill = (id: string, type: 'entry' | 'exit', price: string, at: string) => ({ id: id as TradeExecutionId, tradeId, type, price: dec(price), quantity: dec('2'), executedAt: at, createdAt: at });
const fee = { id: 'f1' as TradeFeeId, tradeId, executionId: null, amount: dec('1'), currency: 'USDT', createdAt: closed } as TradeFeeRecord;
const input = (exit: string, overrides: Partial<TradePictureInput> = {}): TradePictureInput => ({
  trade, plans, executions: [fill('e1', 'entry', '100', opened), fill('x1', 'exit', exit, closed)], fees: [fee], candles: null, now: '2026-09-24T12:00:00.000Z', ...overrides,
});
const card = (pictureInput: TradePictureInput, options: { hideMoney?: boolean; strategyName?: string | null } = {}) =>
  projectTradeShareCard(projectTradePicture(pictureInput), { hideMoney: options.hideMoney ?? false, strategyName: options.strategyName ?? null });
/** Every money amount of the trade above, as the picture writes them. */
const MONEY = ['39 USDT', '+39 USDT', '40 USDT', '1 USDT', '20 USDT', '2'];

describe('T-052c what the share card says', () => {
  it('names the market, the direction and the verdict, with the result after fees as the headline', () => {
    const won = card(input('120'), { strategyName: 'Breakout' });
    expect([won.symbol, won.side, won.verdict]).toEqual(['BTCUSDT', 'Long', 'Won']);
    expect(won.headline).toEqual({ text: '+39 USDT', outcome: 'profit' });
    expect(won.facts.map(fact => [fact.label, fact.text])).toEqual([
      ['× what you risked', '+1.95× what you risked'], ['Planned reward', 'Reward is 3× the risk'], ['How long it lasted', '3 h'],
      ['Strategy', 'Breakout'], ['Money at risk', '20 USDT'], ['Size', '2'],
    ]);
    expect([won.opened, won.closed]).toEqual([opened, closed]);
    expect(Object.isFrozen(won) && Object.isFrozen(won.facts)).toBe(true);
    expect(describeTradeShareCard(won)).toBe('BTCUSDT long, won, +39 USDT, +1.95× what you risked, strategy Breakout');
  });

  it('says Lost, Break-even, Open, Planned, Cancelled or No result yet', () => {
    expect(card(input('90')).verdict).toBe('Lost');
    expect(card(input('90')).headline.outcome).toBe('loss');
    expect(card(input('100.5')).verdict).toBe('Break-even');
    expect(card(input('120', { trade: { ...trade, status: 'open', closedAt: null }, executions: [fill('e1', 'entry', '100', opened)] })).verdict).toBe('Open');
    expect(card(input('120', { trade: { ...trade, status: 'draft', openedAt: null, closedAt: null }, executions: [], fees: [] })).verdict).toBe('Planned');
    expect(card(input('120', { trade: { ...trade, status: 'cancelled' } })).verdict).toBe('Cancelled');
    // With no result, the plan is the headline; with no plan either, the verdict.
    const noResult = card(input('120', { executions: [fill('e1', 'entry', '100', opened)] }));
    expect([noResult.verdict, noResult.headline.text]).toEqual(['No result yet', 'Reward is 3× the risk']);
    expect(noResult.facts.map(fact => fact.key)).not.toContain('planned-reward');
    expect(card(input('120', { executions: [fill('e1', 'entry', '100', opened)], plans: [] })).headline.text).toBe('No result yet');
  });

  it('"Hide money amounts" leaves no money amount anywhere, and keeps × what you risked as the headline', () => {
    const hidden = card(input('120'), { hideMoney: true, strategyName: 'Breakout' });
    expect(hidden.headline).toEqual({ text: '+1.95× what you risked', outcome: 'profit' });
    expect(hidden.facts.map(fact => fact.key)).toEqual(['planned-reward', 'duration', 'strategy']);
    const words = [hidden.headline.text, ...hidden.facts.map(fact => fact.text), describeTradeShareCard(hidden)];
    for (const amount of MONEY) expect(words.some(text => text === amount || text.includes(` ${amount}`) || text.startsWith(`${amount} `))).toBe(false);
    expect(words.join(' ')).not.toMatch(/\d USDT/);
    expect(describeTradeShareCard(hidden)).toBe('BTCUSDT long, won, +1.95× what you risked, strategy Breakout');
    // With no × what you risked either, the verdict is the headline.
    expect(card(input('120', { plans: [] }), { hideMoney: true }).headline.text).toBe('Won');
  });

  it('names a forex pair as the picture does, and leaves out facts it does not have', () => {
    const forex = card(input('1.105', {
      trade: { ...trade, symbol: 'EURUSD', marketType: 'forex', grossPnlCurrency: 'USD' }, plans: [],
      executions: [{ ...fill('e1', 'entry', '1.1', opened), quantity: dec('10000') }, { ...fill('x1', 'exit', '1.105', closed), quantity: dec('10000') }], fees: [],
    }), { hideMoney: true });
    expect(forex.symbol).toBe('EUR/USD');
    expect(forex.facts.map(fact => fact.key)).toEqual(['duration']);
    expect(JSON.stringify(forex)).not.toContain('USD ');
  });
});
