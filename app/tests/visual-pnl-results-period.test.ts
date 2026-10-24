import { describe, expect, it } from 'vitest';
import {
  describeVisualPnlPeriodProblem,
  projectVisualPnlPeriod,
  readVisualPnlPeriodChoice,
  VISUAL_PNL_DEFAULT_PERIOD,
  writeVisualPnlPeriodChoice,
  type VisualPnlPeriod,
  type VisualPnlPeriodChoice,
} from '../src/application/visual-pnl';

const TODAY = '2026-09-20'; // a Sunday

function period(choice: VisualPnlPeriodChoice, today = TODAY): VisualPnlPeriod {
  const result = projectVisualPnlPeriod(choice, today);
  if (!result.ok) throw new Error(`refused: ${result.reason}`);
  return result.period;
}
const reasonOf = (choice: VisualPnlPeriodChoice, today = TODAY) => {
  const result = projectVisualPnlPeriod(choice, today);
  return result.ok ? null : result.reason;
};

describe('T-051a which days a results period covers', () => {
  it('a week runs Monday to Sunday, steps by seven days, and has no next week after this one', () => {
    const week = period({ kind: 'week', at: null });
    expect(week).toMatchObject({ kind: 'week', fromDayKey: '2026-09-14', toDayKey: '2026-09-21', label: '14 – 20 September 2026', holdsToday: true, next: null, monthKeys: ['2026-09'] });
    expect(week.previous).toEqual({ kind: 'week', at: '2026-09-07' });
    const before = period(week.previous!);
    expect(before).toMatchObject({ fromDayKey: '2026-09-07', toDayKey: '2026-09-14', holdsToday: false });
    expect(before.next).toEqual({ kind: 'week', at: '2026-09-14' });
    expect(period({ kind: 'week', at: '2026-09-29' }, '2026-10-01')).toMatchObject({ label: '28 September – 4 October 2026', monthKeys: ['2026-09', '2026-10'] });
    expect(period({ kind: 'week', at: '2026-01-01' }, '2026-02-01').label).toBe('29 December 2025 – 4 January 2026');
  });

  it('a month runs from its first day to the first day of the next', () => {
    const month = period({ kind: 'month', at: null });
    expect(month).toMatchObject({ fromDayKey: '2026-09-01', toDayKey: '2026-10-01', label: 'September 2026', monthKeys: ['2026-09'], holdsToday: true, next: null });
    expect(month.previous).toEqual({ kind: 'month', at: '2026-08-01' });
    const august = period(month.previous!);
    expect(august).toMatchObject({ label: 'August 2026', fromDayKey: '2026-08-01', toDayKey: '2026-09-01', holdsToday: false });
    expect(august.next).toEqual({ kind: 'month', at: '2026-09-01' });
  });

  it('three months end with the chosen month, and their words cross a year', () => {
    const three = period({ kind: 'three-months', at: null });
    expect(three).toMatchObject({ fromDayKey: '2026-07-01', toDayKey: '2026-10-01', label: 'July – September 2026', monthKeys: ['2026-07', '2026-08', '2026-09'], next: null });
    const before = period(three.previous!);
    expect(before).toMatchObject({ fromDayKey: '2026-04-01', toDayKey: '2026-07-01', label: 'April – June 2026' });
    expect(period(before.next!)).toMatchObject({ fromDayKey: '2026-07-01', toDayKey: '2026-10-01' });
    expect(period({ kind: 'three-months', at: null }, '2026-01-15')).toMatchObject({ label: 'November 2025 – January 2026', fromDayKey: '2025-11-01', toDayKey: '2026-02-01' });
  });

  it('three months from an old address step forward to the 3 months up to today (D210)', () => {
    const kept = period({ kind: 'three-months', at: '2026-09-01' }, '2026-10-05');
    expect(kept).toMatchObject({ label: 'July – September 2026', holdsToday: false });
    expect(kept.next).toEqual({ kind: 'three-months', at: null });
    expect(period(kept.next!, '2026-10-05')).toMatchObject({ label: 'August – October 2026', holdsToday: true, next: null });
  });

  it('a year runs from 1 January to the next 1 January', () => {
    const year = period({ kind: 'year', at: null });
    expect(year).toMatchObject({ fromDayKey: '2026-01-01', toDayKey: '2027-01-01', label: '2026', next: null, holdsToday: true });
    expect(year.monthKeys).toHaveLength(12);
    const last = period(year.previous!);
    expect(last).toMatchObject({ label: '2025', fromDayKey: '2025-01-01', toDayKey: '2026-01-01', holdsToday: false });
    expect(period(last.next!).label).toBe('2026');
  });

  it('all time has no days and no steps', () => {
    expect(period({ kind: 'all' })).toEqual({ choice: { kind: 'all' }, kind: 'all', fromDayKey: null, toDayKey: null, monthKeys: [], holdsToday: true, previous: null, next: null, label: 'All time' });
  });

  it('a custom period ends on its last day, and refuses days it cannot show, with a sentence for each', () => {
    expect(period({ kind: 'custom', firstDayKey: '2026-09-03', lastDayKey: '2026-09-20' })).toMatchObject({ fromDayKey: '2026-09-03', toDayKey: '2026-09-21', label: '3 – 20 September 2026', holdsToday: true, previous: null, next: null });
    expect(period({ kind: 'custom', firstDayKey: '2026-09-20', lastDayKey: '2026-09-20' }).label).toBe('20 September 2026');
    expect(reasonOf({ kind: 'custom', firstDayKey: '2026-09-10', lastDayKey: '2026-09-09' })).toBe('last-before-first');
    expect(reasonOf({ kind: 'custom', firstDayKey: '2026-09-10', lastDayKey: '2026-09-21' })).toBe('after-today');
    expect(reasonOf({ kind: 'custom', firstDayKey: '2026-9-3', lastDayKey: '2026-09-20' })).toBe('invalid-day-key');
    expect(describeVisualPnlPeriodProblem('invalid-day-key')).toBe('Choose a first and a last day.');
    expect(describeVisualPnlPeriodProblem('last-before-first')).toBe('The last day is before the first day.');
    expect(describeVisualPnlPeriodProblem('after-today')).toBe('The last day can be today at the latest.');
  });

  it('refuses a chosen day after today, and a today that is not a day', () => {
    expect(reasonOf({ kind: 'month', at: '2026-09-21' })).toBe('after-today');
    expect(reasonOf({ kind: 'week', at: 'soon' })).toBe('invalid-day-key');
    expect(reasonOf({ kind: 'all' }, '20/09/2026')).toBe('invalid-day-key');
  });

  it('is frozen', () => {
    const week = period({ kind: 'week', at: null });
    expect(Object.isFrozen(week)).toBe(true);
    expect(Object.isFrozen(week.monthKeys)).toBe(true);
    expect(Object.isFrozen(week.previous)).toBe(true);
    expect(Object.isFrozen(week.choice)).toBe(true);
  });
});

describe('T-051a the period in the address', () => {
  const choices: VisualPnlPeriodChoice[] = [
    { kind: 'week', at: '2026-09-14' },
    { kind: 'week', at: null },
    { kind: 'month', at: '2026-08-01' },
    { kind: 'three-months', at: '2026-06-30' },
    { kind: 'year', at: '2025-01-01' },
    { kind: 'all' },
    { kind: 'custom', firstDayKey: '2026-09-03', lastDayKey: '2026-09-20' },
  ];

  it('reads back every kind it writes, and keeps every other key', () => {
    for (const choice of choices) {
      const written = writeVisualPnlPeriodChoice(choice, new URLSearchParams('view=chart&side=long'));
      expect(readVisualPnlPeriodChoice(written)).toEqual(choice);
      expect(written.get('view')).toBe('chart');
      expect(written.get('side')).toBe('long');
    }
  });

  it('reads the default month for a missing, unknown or half custom period', () => {
    expect(readVisualPnlPeriodChoice(new URLSearchParams('period=nonsense'))).toEqual(VISUAL_PNL_DEFAULT_PERIOD);
    expect(readVisualPnlPeriodChoice(new URLSearchParams(''))).toEqual(VISUAL_PNL_DEFAULT_PERIOD);
    expect(readVisualPnlPeriodChoice(new URLSearchParams('period=custom&first=2026-09-03'))).toEqual(VISUAL_PNL_DEFAULT_PERIOD);
    expect(VISUAL_PNL_DEFAULT_PERIOD).toEqual({ kind: 'month', at: null });
  });

  it('removes the keys a choice does not use, and never changes the params it was given', () => {
    const given = new URLSearchParams('period=custom&first=2026-09-03&last=2026-09-20&at=2026-01-01');
    const written = writeVisualPnlPeriodChoice({ kind: 'month', at: null }, given);
    expect(written.toString()).toBe('period=month');
    expect(given.get('first')).toBe('2026-09-03');
    expect(writeVisualPnlPeriodChoice({ kind: 'all' }, new URLSearchParams('at=2026-01-01')).toString()).toBe('period=all');
  });
});
