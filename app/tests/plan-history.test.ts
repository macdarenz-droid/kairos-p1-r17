import { describe, expect, it } from 'vitest';
import { describePlanHistory } from '../src/application/trades';
import type { DecimalString, TradeId, TradePlanId, TradePlanRecord } from '../src/domain/trades';

const tradeId = 'plan-history-trade' as TradeId;
const at = (minutes: number): string => new Date(Date.UTC(2026, 9, 24, 10, 0) + minutes * 60_000).toISOString();

type PlanChange = Partial<Omit<TradePlanRecord, 'id' | 'tradeId' | 'plannedEntryPrice' | 'plannedStopPrice' | 'plannedTargetPrice' | 'plannedQuantity'>> & {
  entry?: string | null; stop?: string | null; target?: string | null; quantity?: string | null;
};
/** One saved version of a plan. Anything not named is empty. */
function version(id: string, updatedAt: string, change: PlanChange = {}): TradePlanRecord {
  const price = (value: string | null | undefined): DecimalString | null => (value ?? null) as DecimalString | null;
  const { entry, stop, target, quantity, ...rest } = change;
  return {
    id: id as TradePlanId, tradeId,
    plannedEntryPrice: price(entry), plannedStopPrice: price(stop), plannedTargetPrice: price(target), plannedQuantity: price(quantity),
    createdAt: updatedAt, updatedAt, ...rest,
  };
}
const textsOf = (before: PlanChange, after: PlanChange): string[] =>
  describePlanHistory([version('a', at(0), before), version('b', at(10), after)], 'UTC').map(line => line.text);

describe('describePlanHistory (what changed in a trade plan, in plain words)', () => {
  it('says nothing for no plan or a plan saved once', () => {
    expect(describePlanHistory([], 'UTC')).toEqual([]);
    expect(describePlanHistory([version('a', at(0), { entry: '100', stop: '95' })], 'UTC')).toEqual([]);
  });

  it('says nothing when a newer version changed nothing', () => {
    expect(textsOf({ entry: '100', stop: '95', reason: 'Clean break' }, { entry: '100', stop: '95', reason: 'Clean break' })).toEqual([]);
    // No reason as an absent key and as null say the same.
    expect(textsOf({ stop: '95' }, { stop: '95', reason: null })).toEqual([]);
  });

  it('says a stop, entry, target or size moved or changed, from and to', () => {
    expect(textsOf({ stop: '95' }, { stop: '97' })).toEqual(['Stop moved from 95 to 97']);
    expect(textsOf({ entry: '100' }, { entry: '101.5' })).toEqual(['Planned entry moved from 100 to 101.5']);
    expect(textsOf({ target: '110' }, { target: '120' })).toEqual(['Target moved from 110 to 120']);
    expect(textsOf({ quantity: '1' }, { quantity: '2' })).toEqual(['Planned quantity changed from 1 to 2']);
  });

  it('says a number was added, with its value', () => {
    expect(textsOf({ stop: '95' }, { stop: '95', target: '120' })).toEqual(['Target added: 120']);
    expect(textsOf({}, { stop: '95' })).toEqual(['Stop added: 95']);
    expect(textsOf({ stop: '95' }, { stop: '95', quantity: '3' })).toEqual(['Planned quantity added: 3']);
  });

  it('says a number was removed', () => {
    expect(textsOf({ entry: '100', stop: '95' }, { stop: '95' })).toEqual(['Planned entry removed']);
    expect(textsOf({ stop: '95', target: '110' }, { stop: '95' })).toEqual(['Target removed']);
    expect(textsOf({ entry: '100', stop: '95', target: '110', quantity: '1' }, {})).toEqual([
      'Planned entry removed', 'Stop removed', 'Target removed', 'Planned quantity removed',
    ]);
  });

  it('says "Why I\'m taking it" was added, changed or removed, without repeating the words typed', () => {
    expect(textsOf({ stop: '95' }, { stop: '95', reason: 'Clean break' })).toEqual(["Why I'm taking it added"]);
    expect(textsOf({ stop: '95', reason: 'Clean break' }, { stop: '95', reason: 'Chasing' })).toEqual(["Why I'm taking it changed"]);
    expect(textsOf({ stop: '95', reason: 'Clean break' }, { stop: '95' })).toEqual(["Why I'm taking it removed"]);
    expect(textsOf({ stop: '95', reason: 'Clean break' }, { stop: '95', reason: null })).toEqual(["Why I'm taking it removed"]);
  });

  it('gives one line per change when a version changes several things, all with the same time', () => {
    const lines = describePlanHistory([
      version('a', at(0), { entry: '100', stop: '95', target: '110', quantity: '1', reason: 'Clean break' }),
      version('b', at(7), { entry: '101', stop: '97', quantity: '2' }),
    ], 'UTC');
    expect(lines.map(line => line.text)).toEqual([
      'Planned entry moved from 100 to 101', 'Stop moved from 95 to 97', 'Target removed', 'Planned quantity changed from 1 to 2', "Why I'm taking it removed",
    ]);
    expect(new Set(lines.map(line => line.at))).toEqual(new Set([at(7)]));
    expect(new Set(lines.map(line => line.when)).size).toBe(1);
  });

  it('lists three versions oldest first, however they are given', () => {
    const first = version('p1', at(0), { stop: '95' });
    const second = version('p2', at(10), { stop: '97' });
    const third = version('p3', at(20), { stop: '97', target: '120' });
    const expected = [{ at: at(10), text: 'Stop moved from 95 to 97' }, { at: at(20), text: 'Target added: 120' }];
    for (const order of [[first, second, third], [third, first, second], [second, third, first]]) {
      expect(describePlanHistory(order, 'UTC').map(({ at: when, text }) => ({ at: when, text }))).toEqual(expected);
    }
  });

  it('keeps the order the versions were made in when they share a saved time', () => {
    const early = { ...version('z-first', at(5), { stop: '95' }), createdAt: at(1) };
    const late = { ...version('a-second', at(5), { stop: '97' }), createdAt: at(2) };
    expect(describePlanHistory([late, early], 'UTC').map(line => line.text)).toEqual(['Stop moved from 95 to 97']);
    const sameCreated = [version('b-second', at(5), { stop: '97' }), version('a-first', at(5), { stop: '95' })];
    expect(describePlanHistory(sameCreated, 'UTC').map(line => line.text)).toEqual(['Stop moved from 95 to 97']);
  });

  it("puts the newer version's saved time in `at`, as stored", () => {
    const [line] = describePlanHistory([version('a', '2026-10-24T09:00:00.000Z', { stop: '95' }), version('b', '2026-10-24T10:32:00.000Z', { stop: '97' })], 'UTC');
    expect(line!.at).toBe('2026-10-24T10:32:00.000Z');
  });

  it("says when in the trader's time zone", () => {
    const plans = [version('a', '2026-10-24T09:00:00.000Z', { stop: '95' }), version('b', '2026-10-24T10:32:00.000Z', { stop: '97' })];
    const [utc] = describePlanHistory(plans, 'UTC');
    const [tokyo] = describePlanHistory(plans, 'Asia/Tokyo');
    expect(utc!.when).toContain('10:32');
    expect(utc!.when).toContain('24');
    expect(utc!.when).toContain('at');
    expect(tokyo!.when).toContain('19:32');
    expect(tokyo!.when).toContain('24');
    expect(tokyo!.when).toContain('at');
    // The same moment is a different line of text in another zone, and the stored time does not move.
    expect(tokyo!.when).not.toBe(utc!.when);
    expect(tokyo!.at).toBe(utc!.at);
  });

  it('moves to the next day when the trader\'s zone is already there', () => {
    const plans = [version('a', '2026-10-24T09:00:00.000Z', { stop: '95' }), version('b', '2026-10-24T16:30:00.000Z', { stop: '97' })];
    const [utc] = describePlanHistory(plans, 'UTC');
    const [tokyo] = describePlanHistory(plans, 'Asia/Tokyo');
    expect(utc!.when).toContain('16:30');
    expect(utc!.when).toContain('24');
    expect(tokyo!.when).toContain('01:30');
    expect(tokyo!.when).toContain('25');
    expect(tokyo!.when).not.toContain('24');
  });

  it("uses the device's time zone when none is given, and when the zone is not known", () => {
    const plans = [version('a', '2026-10-24T09:00:00.000Z', { stop: '95' }), version('b', '2026-10-24T10:32:00.000Z', { stop: '97' })];
    const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
    expect(describePlanHistory(plans, null)).toEqual(describePlanHistory(plans, device));
    const unknown = describePlanHistory(plans, 'Not/AZone');
    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.when).toBe(describePlanHistory(plans, null)[0]!.when);
    expect(unknown[0]!.text).toBe('Stop moved from 95 to 97');
  });

  it('shows the stored text when a saved time cannot be read', () => {
    const [line] = describePlanHistory([version('a', '2026-10-24T09:00:00.000Z', { stop: '95' }), version('b', 'not-a-time', { stop: '97' })], 'UTC');
    expect(line).toMatchObject({ at: 'not-a-time', when: 'not-a-time', text: 'Stop moved from 95 to 97' });
  });
});
