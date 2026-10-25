import { describe, expect, it } from 'vitest';
import { describeTradeDuration, projectTradeDurationMs } from '../src/application/performance/tradeDuration';
import { projectTradePicture } from '../src/application/trade-visualizer';
import { parseDecimalString, type DecimalString, type TradeExecutionId, type TradeExecutionRecord, type TradeId, type TradeRecord } from '../src/domain/trades';

function dec(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`fixture decimal ${value}`);
  return parsed.value;
}
const tradeId = 'trade-1' as TradeId;
const at = (hhmm: string, day = '20') => `2026-09-${day}T${hhmm}:00.000Z`;
function trade(overrides: Partial<TradeRecord> = {}): TradeRecord {
  return { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: at('09:00'), closedAt: at('12:00'), createdAt: at('09:00'), updatedAt: at('12:00'), ...overrides };
}
function fill(id: string, type: 'entry' | 'exit', quantity: string, executedAt: string): TradeExecutionRecord {
  return { id: id as TradeExecutionId, tradeId, type, price: dec('100'), quantity: dec(quantity), executedAt, createdAt: executedAt };
}
const H = 60 * 60_000;
const open = trade({ status: 'open', closedAt: null });

describe('T-050a how long a trade lasted (performance owner)', () => {
  it('a closed trade runs from its entry fill to its exit fill', () => {
    const duration = projectTradeDurationMs(trade(), [fill('e', 'entry', '1', at('09:00')), fill('x', 'exit', '1', at('12:00'))], Date.parse(at('18:00')));
    expect(duration).toBe(10_800_000);
    expect(describeTradeDuration(duration!)).toBe('3 h');
  });

  it('with no fills it runs from opened to closed', () => {
    const duration = projectTradeDurationMs(trade({ openedAt: at('07:00', '20'), closedAt: at('12:00', '22') }), [], Date.parse(at('18:00', '25')));
    expect(duration).toBe(53 * H);
    expect(describeTradeDuration(duration!)).toBe('2 days 5 h');
  });

  it('an open trade ends at now, even after a partial exit', () => {
    const nowMs = Date.parse(at('12:00'));
    expect(projectTradeDurationMs(open, [fill('e', 'entry', '2', at('09:00'))], nowMs)).toBe(3 * H);
    expect(projectTradeDurationMs(open, [fill('e', 'entry', '2', at('09:00')), fill('x', 'exit', '1', at('10:00'))], nowMs)).toBe(10_800_000);
  });

  it('gives null for draft and cancelled trades and without a start, and 0 for an exit before the entry', () => {
    const fills = [fill('e', 'entry', '1', at('09:00')), fill('x', 'exit', '1', at('12:00'))];
    const nowMs = Date.parse(at('18:00'));
    expect(projectTradeDurationMs(trade({ status: 'draft' }), fills, nowMs)).toBeNull();
    expect(projectTradeDurationMs(trade({ status: 'cancelled' }), fills, nowMs)).toBeNull();
    expect(projectTradeDurationMs(trade({ openedAt: null }), [], nowMs)).toBeNull();
    expect(projectTradeDurationMs(trade(), [fill('e', 'entry', '1', at('12:00')), fill('x', 'exit', '1', at('09:00'))], nowMs)).toBe(0);
  });

  it('words', () => {
    expect(describeTradeDuration(45 * 60_000)).toBe('45 min');
    expect(describeTradeDuration(185 * 60_000)).toBe('3 h 5 min');
    expect(describeTradeDuration(48 * H)).toBe('2 days');
  });

  it('the trade picture reads it: an open trade with a partial exit lasts until now', () => {
    const model = projectTradePicture({
      trade: open,
      plans: [],
      executions: [fill('e', 'entry', '2', at('09:00')), fill('x', 'exit', '1', at('10:00'))],
      fees: [],
      candles: null,
      now: at('12:00'),
    });
    expect(model.info.find(row => row.key === 'duration')).toMatchObject({ value: String(3 * H), text: '3 h' });
  });
});
