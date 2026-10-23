import { describe, expect, it } from 'vitest';
import { describePriceMove } from '../src/application/performance/performanceWords';
import type { PriceMove } from '../src/application/performance/priceMove';
import { TRADE_PICTURE_MAX_TICKS, tradePictureTimeTicks } from '../src/features/journal/tradePictureAxis';

const HOUR = 3_600_000, DAY = 24 * HOUR;
const at = (iso: string) => Date.parse(iso);
const format = (options: Intl.DateTimeFormatOptions, ms: number) => new Intl.DateTimeFormat(undefined, options).format(ms);

describe('T-052b the picture\'s time axis', () => {
  it('labels round hours inside a few hours, with the hour and minute', () => {
    const ticks = tradePictureTimeTicks(at('2026-09-20T09:00:00.000Z'), at('2026-09-20T12:00:00.000Z'), 'UTC');
    expect(ticks.map(tick => new Date(tick.ms).toISOString())).toEqual(['2026-09-20T09:00:00.000Z', '2026-09-20T10:00:00.000Z', '2026-09-20T11:00:00.000Z', '2026-09-20T12:00:00.000Z']);
    expect(ticks.map(tick => tick.label)).toEqual(ticks.map(tick => format({ timeZone: 'UTC', timeStyle: 'short' }, tick.ms)));
  });

  it('rounds on the zone\'s own clock: whole hours in India are half hours in UTC', () => {
    const ticks = tradePictureTimeTicks(at('2026-09-20T09:00:00.000Z'), at('2026-09-20T12:00:00.000Z'), 'Asia/Kolkata');
    expect(ticks.map(tick => new Date(tick.ms).toISOString())).toEqual(['2026-09-20T09:30:00.000Z', '2026-09-20T10:30:00.000Z', '2026-09-20T11:30:00.000Z']);
  });

  it('labels days with the day and month over 10 days, at midnight', () => {
    const ticks = tradePictureTimeTicks(at('2026-09-01T00:00:00.000Z'), at('2026-09-11T00:00:00.000Z'), 'UTC');
    expect(ticks.length).toBeGreaterThan(0);
    expect(ticks.every(tick => tick.ms % DAY === 0)).toBe(true);
    expect(ticks.map(tick => tick.label)).toEqual(ticks.map(tick => format({ timeZone: 'UTC', day: 'numeric', month: 'short' }, tick.ms)));
  });

  it(`never gives more than ${TRADE_PICTURE_MAX_TICKS} labels, all inside the range and in order`, () => {
    const from = at('2026-03-27T13:17:00.000Z');
    for (const span of [7 * 60_000, 50 * 60_000, 5 * HOUR, 40 * HOUR, 9 * DAY, 45 * DAY, 200 * DAY, 400 * DAY]) {
      const ticks = tradePictureTimeTicks(from, from + span, 'Europe/London');
      expect(ticks.length).toBeLessThanOrEqual(TRADE_PICTURE_MAX_TICKS);
      expect(ticks.every((tick, index) => tick.ms >= from && tick.ms <= from + span && (index === 0 || tick.ms > ticks[index - 1]!.ms))).toBe(true);
    }
  });

  it('gives none for an empty range', () => {
    expect(tradePictureTimeTicks(at('2026-09-20T09:00:00.000Z'), at('2026-09-20T09:00:00.000Z'), 'UTC')).toEqual([]);
    expect(tradePictureTimeTicks(Number.NaN, at('2026-09-20T09:00:00.000Z'), 'UTC')).toEqual([]);
  });

  it('makes its date formatters once per zone, not once per label', () => {
    const Real = Intl.DateTimeFormat;
    let made = 0;
    class Counting extends Real { constructor(...args: ConstructorParameters<typeof Real>) { super(...args); made += 1; } }
    const intl = Intl as { DateTimeFormat: typeof Intl.DateTimeFormat };
    intl.DateTimeFormat = Counting as typeof Intl.DateTimeFormat;
    try {
      for (let index = 0; index < 40; index += 1) tradePictureTimeTicks(at('2026-09-20T09:00:00.000Z') + index * HOUR, at('2026-09-22T09:00:00.000Z') + index * DAY, 'Pacific/Auckland');
    } finally {
      intl.DateTimeFormat = Real;
    }
    // One to read the clock, one for times, one for days.
    expect(made).toBeLessThanOrEqual(3);
  });
});

describe('T-052b how far price went, in words (D192)', () => {
  const move = (overrides: Partial<Extract<PriceMove, { available: true }>> = {}): PriceMove => ({
    available: true, averageEntry: '100' as never, highest: '120.5' as never, highestAt: '2026-09-20T10:00:00.000Z', lowest: '55' as never, lowestAt: '2026-09-20T11:00:00.000Z',
    forYou: '20.5' as never, againstYou: '45' as never, shownForYou: '20.5' as never, shownAgainstYou: '45' as never, forYouIsAbout: false, againstYouIsAbout: false, soFar: false, candleCount: 3, ...overrides,
  });
  it('says both amounts from your average entry, with "about" and "so far" when they apply', () => {
    expect(describePriceMove(move())).toBe('From your average entry, price went 20.5 for you and 45 against you.');
    expect(describePriceMove(move({ forYouIsAbout: true, soFar: true }))).toBe('From your average entry, price went about 20.5 for you and 45 against you so far.');
    expect(describePriceMove(move({ againstYouIsAbout: true }))).toBe('From your average entry, price went 20.5 for you and about 45 against you.');
    expect(describePriceMove({ available: false, reason: 'no-candles' })).toBeNull();
  });
});
