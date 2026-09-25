import { describe, expect, it } from 'vitest';
import { describePatternGroupLabel, describePatternLeftOut, describePatternSummary, describeTradePattern } from '../src/application/patterns/patternWords';
import { TRADE_PATTERN_KINDS, type PatternTradesSummary, type TradePattern, type TradePatternGroup, type TradePatternKind } from '../src/application/patterns/tradePatterns';
import type { DecimalString } from '../src/domain/trades';

function summary(values: Partial<PatternTradesSummary>): PatternTradesSummary {
  return { tradeCount: 0, won: 0, lost: 0, breakEven: 0, noResult: 0, resultCount: 0, enough: false, wonPercent: null, total: null, ...values };
}
const total = (amount: string, currency = 'USDT'): PatternTradesSummary['total'] =>
  ({ available: true, currency, total: amount as DecimalString, outcome: amount.startsWith('-') ? 'loss' : 'profit', tradeCount: 12 });
const notShown = (reason: 'mixed-currencies' | 'missing-currency-evidence' | 'unavailable-trade-outcome'): PatternTradesSummary['total'] =>
  ({ available: false, currency: null, total: null, outcome: null, tradeCount: 12, reason });
const enough = (extra: Partial<PatternTradesSummary>) => summary({ tradeCount: 12, won: 7, lost: 4, breakEven: 1, resultCount: 12, enough: true, wonPercent: 58, total: total('50'), ...extra });
const group = (key: string, name: string | null = null): TradePatternGroup => ({ key, name, summary: summary({}), barSteps: 0 });
const pattern = (kind: TradePatternKind, unplaced: number): TradePattern => ({ kind, groups: [], unplaced });

const TABLE: Record<TradePatternKind, [string, string]> = {
  plan: ['Keeping your plan', "Trades where you kept your stop, your planned size and your strategy's rules, next to trades where you did not."],
  'after-result': ['After a win or a loss', 'How your next trade went after a win or a loss. Kairos looks at the last trade you closed before you opened each one.'],
  strategy: ['By strategy', 'Your trades by the strategy you named on them.'],
  weekday: ['By day of the week', 'By the day you opened each trade, in your time zone.'],
  'time-of-day': ['By time of day', 'By the hour you opened each trade, in your time zone.'],
  direction: ['Long or short', 'Trades where you bought first, next to trades where you sold first.'],
};

describe('T-042d the patterns\' plain words', () => {
  it('gives each pattern its title and intro', () => {
    for (const kind of TRADE_PATTERN_KINDS) {
      expect(describeTradePattern(kind)).toEqual({ title: TABLE[kind][0], intro: TABLE[kind][1] });
    }
  });

  it('labels each group', () => {
    expect(describePatternGroupLabel('weekday', group('weekday:0'))).toBe('Monday');
    expect(describePatternGroupLabel('weekday', group('weekday:6'))).toBe('Sunday');
    expect(describePatternGroupLabel('time-of-day', group('hours:2'))).toBe('Morning (08:00 to 11:59)');
    expect(describePatternGroupLabel('direction', group('long'))).toBe('Long (you bought first)');
    expect(describePatternGroupLabel('direction', group('short'))).toBe('Short (you sold first)');
    expect(describePatternGroupLabel('plan', group('kept'))).toBe('You kept your plan');
    expect(describePatternGroupLabel('plan', group('broken'))).toBe('You went against your plan');
    expect(describePatternGroupLabel('after-result', group('after-win'))).toBe('After a win');
    expect(describePatternGroupLabel('after-result', group('after-loss'))).toBe('After a loss');
    expect(describePatternGroupLabel('strategy', group('strategy:abc', 'Breakout 2'))).toBe('Breakout 2');
    expect(describePatternGroupLabel('strategy', group('no-strategy'))).toBe('No strategy named');
  });

  it('says how a group went, or that there are not enough trades yet', () => {
    expect(describePatternSummary(summary({}))).toEqual(['No trades.']);
    expect(describePatternSummary(summary({ tradeCount: 1, won: 1, resultCount: 1 }))).toEqual(['1 trade.', 'Not enough trades with a result yet (1 of 10).']);
    expect(describePatternSummary(summary({ tradeCount: 3, won: 2, lost: 1, resultCount: 3 }))).toEqual(['3 trades.', 'Not enough trades with a result yet (3 of 10).']);
    expect(describePatternSummary(enough({}))).toEqual(['12 trades.', 'Won 7, lost 4, break-even 1: 58% won.', 'Result after fees: 50 USDT.']);
    expect(describePatternSummary(enough({ lost: 3, breakEven: 0, noResult: 2, resultCount: 10, wonPercent: 70, total: notShown('unavailable-trade-outcome') })))
      .toEqual(['12 trades, 2 with no result.', 'Won 7, lost 3: 70% won.', 'Result after fees: not shown, because a trade has no result yet.']);
    expect(describePatternSummary(enough({ total: total('-20') }))[2]).toBe('Result after fees: -20 USDT.');
    expect(describePatternSummary(enough({ total: notShown('mixed-currencies') }))[2]).toBe('Result after fees: not shown, because the trades are in different currencies.');
    expect(describePatternSummary(enough({ total: notShown('missing-currency-evidence') }))[2]).toBe('Result after fees: not shown, because a trade has no currency.');
    expect(describePatternSummary(enough({ total: total('0.000000011') }))[2]).toBe('Result after fees: 0.000000011 USDT.');
    expect(Object.isFrozen(describePatternSummary(enough({})))).toBe(true);
  });

  it('says what was left out', () => {
    expect(describePatternLeftOut(pattern('plan', 2))).toBe('Left out: 2 trades with nothing planned to compare.');
    expect(describePatternLeftOut(pattern('after-result', 1))).toBe('Left out: 1 trade with no trade before it in these 90 days, or whose trade before broke even or has no result.');
    expect(describePatternLeftOut(pattern('weekday', 1))).toBe('Left out: 1 trade with no clear opening time.');
    for (const kind of TRADE_PATTERN_KINDS) expect(describePatternLeftOut(pattern(kind, 0))).toBeNull();
  });

  it('uses honest, plain words', () => {
    const labels = ['kept', 'broken', 'after-win', 'after-loss', 'no-strategy', 'long', 'short', ...Array.from({ length: 7 }, (_, i) => `weekday:${i}`), ...Array.from({ length: 6 }, (_, i) => `hours:${i}`)]
      .map(key => describePatternGroupLabel('plan', group(key)));
    const texts = [...TRADE_PATTERN_KINDS.flatMap(kind => [describeTradePattern(kind).title, describeTradePattern(kind).intro]), ...labels];
    for (const text of texts) {
      expect(text.length).toBeGreaterThan(0);
      expect(text).not.toMatch(/P&L|win rate|execution|fill|predict|\bwill\b|buy now|sell now/i);
    }
  });
});
