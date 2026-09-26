import { describe, expect, it } from 'vitest';
import { buildCalendarAnswer, NEWS_CALENDAR_WINDOW_DAYS } from '../src/news/calendarFeeds';
import { fnv1a64Hex, newsEventKey, zonedClockUse } from '../src/news/newsParsing';

/**
 * T-046q: the Fed's calendar answer within the Free plan's 10 ms of CPU. The answer must stay exactly the same, and a
 * day outside the window must never reach the zoned clock.
 */
const NOW = Date.parse('2026-09-26T02:00:00Z');
const DAY_MS = 86_400_000;
const TIMES: ReadonlyArray<readonly [string, number, number]> = [['8:30 a.m.', 8, 30], ['10:00 a.m.', 10, 0], ['12:00 p.m.', 12, 0], ['2:00 p.m.', 14, 0], ['4:30 p.m.', 16, 30]];

/** 2,160 entries, 15 a month from January 2017 to December 2028; every tenth one lists two days. */
const ENTRIES = Array.from({ length: 2_160 }, (_, index) => {
  const monthIndex = Math.floor(index / 15);
  const month = `${2017 + Math.floor(monthIndex / 12)}-${String((monthIndex % 12) + 1).padStart(2, '0')}`;
  const day = ((index * 7) % 28) + 1;
  const [time, hour, minute] = TIMES[index % TIMES.length];
  const days = index % 10 === 0 ? [day, ((day + 13) % 28) + 1] : [day];
  return { title: `Release ${index}`, time, month, days, hour, minute };
});
const BODY = JSON.stringify({ events: ENTRIES.map(({ title, time, month, days }) => ({ title, time, month, days: days.join(', '), type: 'Stat' })) });

/** A plain New York wall time as an instant, from Intl alone. */
const NEW_YORK = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
function newYorkWall(at: number): number {
  const part = Object.fromEntries(NEW_YORK.formatToParts(new Date(at)).map(({ type, value }) => [type, value]));
  return Date.UTC(Number(part.year), Number(part.month) - 1, Number(part.day), Number(part.hour), Number(part.minute));
}
function newYorkInstant(month: string, day: number, hour: number, minute: number): number {
  const wall = Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 1, day, hour, minute);
  let at = wall + 5 * 3_600_000;
  at = wall - (newYorkWall(at) - at);
  return wall - (newYorkWall(at) - at);
}

describe('the Fed calendar within the CPU limit', () => {
  it('gives the plain reference answer for 2,000+ entries over 2017 to 2028, and converts only days inside the window', () => {
    const earliest = NOW - NEWS_CALENDAR_WINDOW_DAYS * DAY_MS;
    const latest = NOW + NEWS_CALENDAR_WINDOW_DAYS * DAY_MS;
    const expected: { key: string; title: string; startsAt: string }[] = [];
    for (const { title, month, days, hour, minute } of ENTRIES) {
      for (const day of days) {
        const at = newYorkInstant(month, day, hour, minute);
        if (at < earliest || at > latest) continue;
        const startsAt = new Date(at).toISOString();
        expected.push({ key: newsEventKey('fed', title, startsAt), title, startsAt });
      }
    }
    expected.sort((a, b) => (a.startsAt < b.startsAt ? -1 : a.startsAt > b.startsAt ? 1 : a.title < b.title ? -1 : 1));
    expect(ENTRIES.length).toBeGreaterThanOrEqual(2_000);
    expect(expected.length).toBeGreaterThan(300);

    zonedClockUse.conversions = 0;
    const data = buildCalendarAnswer('fed', [BODY], NOW)!;
    expect(data.events).toEqual(expected);
    expect(data.leftOut).toBe(0);
    // Days within one day of each end are converted too; each day of these months holds at most a few entries.
    expect(zonedClockUse.conversions).toBeGreaterThanOrEqual(expected.length);
    expect(zonedClockUse.conversions).toBeLessThanOrEqual(expected.length + 10);
  });

  it('still leaves out, and counts once, an entry outside the window with a day or an early time that does not exist', () => {
    const body = JSON.stringify({ events: [
      { title: 'Long ago', time: '2:00 p.m.', month: '2017-02', days: '1, 30' },
      { title: 'Clock change', time: '2:30 a.m.', month: '2017-03', days: '12' },
      { title: 'Far ahead', time: '2:00 p.m.', month: '2028-11', days: '31' },
      { title: 'Kept', time: '2:00 p.m.', month: '2026-10', days: '28' },
    ] });
    const data = buildCalendarAnswer('fed', [body], NOW)!;
    expect(data.events.map((event) => event.title)).toEqual(['Kept']);
    expect(data.leftOut).toBe(3);
  });
});

describe('the event key hash', () => {
  it('gives the same FNV-1a 64 hex as before for the known vectors and the fixtures\' keys', () => {
    const vectors: ReadonlyArray<readonly [string, string]> = [
      ['', 'cbf29ce484222325'],
      ['a', 'af63dc4c8601ec8c'],
    ["foobar", '85944171f73967e8'],
    ["bea|GDP (Third Estimate), Industries, Corporate Profits, State GDP, and State Personal Income, 2nd Quarter 2026; State PCE, 2025|2026-09-30T12:30:00.000Z", 'dc6e57cb1e96ea04'],
    ["bea|GDP (Advance Estimate), 3rd Quarter 2026|2026-10-29T12:30:00.000Z", '4333ca28c7f570a2'],
    ["bls|Consumer Price Index|2026-10-14T12:30:00.000Z", '3bc656751421b9fb'],
    ["bls|Employment Situation|2026-11-06T13:30:00.000Z", 'b84347c4da00cd4d'],
    ["boc|Interest Rate Announcement and Monetary Policy Report|2026-10-28T13:45:00.000Z", '2c9b14c2f43d4740'],
    ["boc|Christmas Day|2026-12-25T05:00:00.000Z", 'b6850c7d7c19294e'],
    ["eurostat|Flash estimate inflation euro area|2026-10-02T09:00:00.000Z", '028a4841a07e819e'],
    ["fed|FOMC Meeting|2026-10-28T18:00:00.000Z", 'a0bb06a8b3d80338'],
    ["fed|FOMC Minutes|2026-10-07T18:00:00.000Z", '0b1f836a1e80251f'],
    ["fed|H.4.1 - Factors Affecting Reserve Balances|2026-10-01T20:30:00.000Z", '307ebbc41898b3f9'],
    ["fed|H.4.1 - Factors Affecting Reserve Balances|2026-10-08T20:30:00.000Z", '1706a5fbef29c052'],
    ["ons|Consumer price inflation, UK: August 2026|2026-09-16T06:00:00.000Z", 'cfb8710232076fed'],
    ["ons|UK Labour Market: October 2026|2026-10-20T06:00:00.000Z", 'ba68c495f88f9c1d'],
    ["census|Advance Monthly Sales for Retail and Food Services|2026-10-15T12:30:00.000Z", 'a454c0620e2facbf'],
    ["census|Quarterly Services Survey|2026-10-15T18:00:00.000Z", '807b499b3c7311ef'],
    ["ecb|Governing Council of the ECB: monetary policy meeting in Frankfurt (Day 2), followed by press conference|2026-10-29T13:15:00.000Z", 'c892d53da9a7bbea'],
    ["rba|Monetary Policy Board|2026-09-29T04:30:00.000Z", '50be7efa2d44232a'],
    ["rba|Monetary Policy Board|2026-11-03T03:30:00.000Z", 'c7fb6d972ca73692'],
    ["rba|Monetary Policy Board|2026-04-01T03:30:00.000Z", '319077c87d09dbbe'],
    ["ecb|Réunion – “politique monétaire” €|2026-10-29T13:15:00.000Z", 'c8fcfd20616784e3'],
    ["fed|Speech -- Chair Jerome H. Powell 😀|2026-10-15T13:00:00.000Z", '15dd824833184c62'],
    ];
    expect(vectors.length).toBeGreaterThanOrEqual(22);
    for (const [text, hex] of vectors) expect(fnv1a64Hex(text), text).toBe(hex);
  });
});
