import { describe, expect, it } from 'vitest';
import { COACH_NOTE_KINDS, type CoachNote, type CoachTrade } from '../src/application/coach/coachNotes';
import { describeCoachNote, describeCoachTradeFacts, describeTradePlanVsExecution } from '../src/application/coach/coachWords';
import type { StrategyRuleResult } from '../src/application/discipline/strategyCheck';
import type { DecimalString, TradeId } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
const trade = (symbol: string): CoachTrade => ({ tradeId: `trade-${symbol}` as TradeId, symbol, closedAt: '2026-09-02T10:00:00.000Z' });
const stopTrade = (symbol: string, stop = '95', averageExit = '90') => ({ ...trade(symbol), stop: d(stop), averageExit: d(averageExit) });
const sizeTrade = (symbol: string, planned = '1', traded = '3') => ({ ...trade(symbol), planned: d(planned), traded: d(traded) });
const noStop: StrategyRuleResult = { kind: 'stop-planned', ruleId: 'stop', verdict: 'broken', reason: 'no-stop', stop: null };
const strategyTrade = (symbol: string) => ({ ...trade(symbol), strategyName: 'Breakout', broken: [noStop] });

const notes: Record<CoachNote['kind'], CoachNote> = {
  'daily-limit': { kind: 'daily-limit', key: 'daily-limit', limit: 3, today: 5, exceeded: true },
  'stop-passed': { kind: 'stop-passed', key: 'stop-passed', trades: [stopTrade('BTCUSDT')] },
  'size-over-plan': { kind: 'size-over-plan', key: 'size-over-plan', trades: [sizeTrade('BTCUSDT')] },
  'strategy-rules-broken': { kind: 'strategy-rules-broken', key: 'strategy-rules-broken', trades: [strategyTrade('XRPUSDT')] },
  'mistake-repeated': { kind: 'mistake-repeated', key: 'mistake-repeated:moved-stop', itemId: 'moved-stop', label: 'Moved my stop', count: 2, trades: [trade('BTCUSDT'), trade('ETHUSDT')] },
  'reviews-missing': { kind: 'reviews-missing', key: 'reviews-missing', reviewedCount: 2, closedCount: 4, percent: 50, trades: [trade('SOLUSDT'), trade('XRPUSDT')] },
};

describe('T-041c the coach words', () => {
  it('gives each kind its topic, title and step', () => {
    expect(describeCoachNote(notes['daily-limit'])).toEqual({ topic: 'Your goals', title: 'You opened 5 trades today, more than your limit of 3.', step: "Stop for today. Use the time to review today's trades instead." });
    expect(describeCoachNote({ kind: 'daily-limit', key: 'daily-limit', limit: 1, today: 1, exceeded: false }).title).toBe('You reached your limit of 1 trade today.');
    expect(describeCoachNote({ kind: 'daily-limit', key: 'daily-limit', limit: 3, today: 3, exceeded: false }).title).toBe('You reached your limit of 3 trades today.');
    expect(describeCoachNote(notes['stop-passed'])).toEqual({ topic: 'Your plan', title: '1 trade this month closed beyond its stop.', step: 'Decide your stop before you enter, and close the trade when the price reaches it. Prices can jump past a stop; if you moved yours, say why in your review.' });
    expect(describeCoachNote(notes['size-over-plan'])).toEqual({ topic: 'Your plan', title: '1 trade this month was bigger than you planned.', step: 'Work out your size before you enter, and trade only that size. The "How much can I buy?" calculator in the Library can help.' });
    expect(describeCoachNote(notes['strategy-rules-broken'])).toEqual({ topic: 'Your strategy', title: '1 trade this month broke a rule of its strategy.', step: 'Read the rules that were broken, and plan your next trade so it keeps them.' });
    expect(describeCoachNote(notes['mistake-repeated'])).toEqual({ topic: 'Your mistakes', title: 'You marked "Moved my stop" on 2 trades this month.', step: 'Add a step to your checklist that guards against it (More → Settings → Your checklist), and tick it before you enter.' });
    expect(describeCoachNote(notes['reviews-missing'])).toEqual({ topic: 'Your reviews', title: 'You reviewed 2 of your 4 closed trades this month.', step: 'In your trade history, tap "After the trade" on each trade that is not reviewed yet, while you still remember it.' });
  });

  it('uses plurals by the number of trades', () => {
    expect(describeCoachNote({ kind: 'stop-passed', key: 'stop-passed', trades: [stopTrade('A'), stopTrade('B')] }).title).toBe('2 trades this month closed beyond their stop.');
    expect(describeCoachNote({ kind: 'size-over-plan', key: 'size-over-plan', trades: [sizeTrade('A'), sizeTrade('B')] }).title).toBe('2 trades this month were bigger than you planned.');
    expect(describeCoachNote({ kind: 'strategy-rules-broken', key: 'strategy-rules-broken', trades: [strategyTrade('A'), strategyTrade('B')] }).title).toBe('2 trades this month broke a rule of their strategy.');
    expect(describeCoachNote({ kind: 'reviews-missing', key: 'reviews-missing', reviewedCount: 0, closedCount: 1, percent: 0, trades: [trade('A')] }).title).toBe('You reviewed 0 of your 1 closed trade this month.');
  });

  it('gives each trade its facts in the card line words', () => {
    const cardLine = describeTradePlanVsExecution({ stop: { verdict: 'passed', stop: d('95'), averageExit: d('90') }, size: { verdict: 'bigger', planned: d('1'), traded: d('3') } });
    expect(describeCoachTradeFacts(notes['stop-passed'], 0)).toEqual([cardLine[0]]);
    expect(describeCoachTradeFacts(notes['size-over-plan'], 0)).toEqual([cardLine[1]]);
    expect(describeCoachTradeFacts(notes['strategy-rules-broken'], 0)).toEqual(['Strategy: Breakout.', 'Stop: no planned stop on this trade.']);
    for (const kind of ['mistake-repeated', 'reviews-missing', 'daily-limit'] as const) expect(describeCoachTradeFacts(notes[kind], 0)).toEqual([]);
    expect(describeCoachTradeFacts(notes['stop-passed'], 5)).toEqual([]);
    expect(Object.isFrozen(describeCoachTradeFacts(notes['stop-passed'], 0))).toBe(true);
  });

  it('shows tiny numbers exactly as the note holds them', () => {
    const facts = describeCoachTradeFacts({ kind: 'size-over-plan', key: 'size-over-plan', trades: [sizeTrade('A', '0.00000001', '0.000000011')] }, 0);
    expect(facts).toEqual(['You planned a size of 0.00000001 and traded 0.000000011.']);
  });

  it('never gives a market call and never leaves a note empty', () => {
    for (const kind of COACH_NOTE_KINDS) {
      const words = describeCoachNote(notes[kind]);
      expect(words.title.length).toBeGreaterThan(0);
      expect(words.step.length).toBeGreaterThan(0);
      expect(words.topic.length).toBeGreaterThan(0);
      for (const text of [words.title, words.step]) {
        expect(text).not.toMatch(/buy now|sell now/i);
        expect(text).not.toMatch(/\d+\.\d|\bprice (of|at) \d/);
      }
    }
  });
});
