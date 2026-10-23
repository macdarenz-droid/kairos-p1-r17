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

describe('T-052b fix r1 the axis follows clock changes, every language, and long ranges', () => {
  const localClock = (ms: number, timeZone: string) => new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ms);

  it('puts day labels at local midnight across the October clock change in London, with no day twice', () => {
    const ticks = tradePictureTimeTicks(at('2026-10-23T12:00:00.000Z'), at('2026-10-27T12:00:00.000Z'), 'Europe/London');
    expect(ticks.map(tick => tick.label)).toEqual(['24', '25', '26', '27'].map(day => format({ timeZone: 'Europe/London', day: 'numeric', month: 'short' }, at(`2026-10-${day}T12:00:00.000Z`))));
    expect(ticks.every(tick => localClock(tick.ms, 'Europe/London').endsWith('00:00'))).toBe(true);
  });

  it('starts months on the 1st, and weeks on Monday, after the clock change', () => {
    const months = tradePictureTimeTicks(at('2026-08-15T00:00:00.000Z'), at('2026-12-15T00:00:00.000Z'), 'Europe/London');
    expect(months.map(tick => format({ timeZone: 'Europe/London', day: 'numeric' }, tick.ms))).toEqual(['1', '1', '1', '1']);
    expect(months.map(tick => format({ timeZone: 'Europe/London', month: 'numeric' }, tick.ms))).toEqual(['9', '10', '11', '12']);
    const weeks = tradePictureTimeTicks(at('2026-10-10T00:00:00.000Z'), at('2026-11-20T00:00:00.000Z'), 'Europe/London');
    expect(weeks.length).toBeGreaterThan(1);
    expect(weeks.every(tick => localClock(tick.ms, 'Europe/London') === 'Mon 00:00')).toBe(true);
  });

  it('reads the clock the same in a language with its own digits or calendar, and labels in that language', () => {
    const Real = Intl.DateTimeFormat;
    const intl = Intl as { DateTimeFormat: typeof Intl.DateTimeFormat };
    for (const [locale, zone] of [['ar-EG', 'Africa/Cairo'], ['th-TH', 'Asia/Bangkok']] as const) {
      class Local extends Real { constructor(locales?: string | string[], options?: Intl.DateTimeFormatOptions) { super(locales ?? locale, options); } }
      intl.DateTimeFormat = Local as typeof Intl.DateTimeFormat;
      try {
        const hours = tradePictureTimeTicks(at('2026-09-20T09:00:00.000Z'), at('2026-09-20T12:00:00.000Z'), zone);
        expect(hours.length).toBeGreaterThanOrEqual(3);
        expect(hours.map(tick => tick.label)).toEqual(hours.map(tick => new Real(locale, { timeZone: zone, timeStyle: 'short' }).format(tick.ms)));
        const weeks = tradePictureTimeTicks(at('2026-09-01T00:00:00.000Z'), at('2026-10-20T00:00:00.000Z'), zone);
        // 49 days: the two-week step wins, so every label is a Monday at midnight.
        expect(weeks.length).toBeGreaterThan(1);
        expect(weeks.every(tick => localClock(tick.ms, zone) === 'Mon 00:00')).toBe(true);
      } finally {
        intl.DateTimeFormat = Real;
      }
    }
  });

  it('labels long and middling ranges too: 11 days, 7 months, a year, two years', () => {
    const from = at('2026-01-10T00:00:00.000Z');
    for (const [span, least] of [[11 * DAY, 3], [214 * DAY, 2], [365 * DAY, 2], [730 * DAY, 2]] as const) {
      expect(tradePictureTimeTicks(from, from + span, 'UTC').length).toBeGreaterThanOrEqual(least);
    }
  });
});

describe('T-052b fix r2 skipped hours, years and midnight', () => {
  const unique = (values: readonly unknown[]) => new Set(values).size === values.length;

  it('gives no label to an hour the clock skips, and never the same time twice (London, 29 March)', () => {
    const ticks = tradePictureTimeTicks(at('2026-03-28T23:30:00.000Z'), at('2026-03-29T03:30:00.000Z'), 'Europe/London');
    expect(ticks.length).toBeGreaterThanOrEqual(3);
    expect(unique(ticks.map(tick => tick.ms))).toBe(true);
    expect(unique(ticks.map(tick => tick.label))).toBe(true);
  });

  it('labels a day whose midnight is skipped at the moment of the jump (Sao Paulo, 4 November 2018)', () => {
    const ticks = tradePictureTimeTicks(at('2018-11-02T12:00:00.000Z'), at('2018-11-06T12:00:00.000Z'), 'America/Sao_Paulo');
    const days = ticks.map(tick => format({ timeZone: 'America/Sao_Paulo', day: 'numeric' }, tick.ms));
    expect(days).toEqual(['3', '4', '5', '6']);
    expect(unique(ticks.map(tick => tick.label))).toBe(true);
  });

  it('names the year from three-month steps up, and labels six years too', () => {
    const from = at('2026-09-15T00:00:00.000Z');
    for (const span of [425 * DAY, 730 * DAY, 1461 * DAY, 2200 * DAY]) {
      const ticks = tradePictureTimeTicks(from, from + span, 'UTC');
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(unique(ticks.map(tick => tick.label))).toBe(true);
      expect(ticks.map(tick => tick.label)).toEqual(ticks.map(tick => format({ timeZone: 'UTC', month: 'short', year: 'numeric' }, tick.ms)));
    }
  });

  it('gives the date for a midnight tick on an hours axis', () => {
    const ticks = tradePictureTimeTicks(at('2026-09-19T06:00:00.000Z'), at('2026-09-21T06:00:00.000Z'), 'UTC');
    const midnight = ticks.find(tick => tick.ms === at('2026-09-20T00:00:00.000Z'))!;
    expect(midnight.label).toBe(format({ timeZone: 'UTC', day: 'numeric', month: 'short' }, midnight.ms));
    const noon = ticks.find(tick => tick.ms === at('2026-09-20T12:00:00.000Z'))!;
    expect(noon.label).toBe(format({ timeZone: 'UTC', timeStyle: 'short' }, noon.ms));
  });
});
