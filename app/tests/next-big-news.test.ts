import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { loadNextBigNews } from '../src/application/economic-calendar/nextBigNews';
import { NEWS_COVERAGE_KEY } from '../src/application/economic-calendar/fetchedNews';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl/timeZonePreference';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { EconomicEventImpact, EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';

const NOW = '2026-10-25T12:00:00.000Z';
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

async function database(zone: string | null = 'Europe/London'): Promise<KairosDatabase> {
  const name = `kairos-next-big-news-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  if (zone !== null) expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, zone, NOW)).ok).toBe(true);
  return db;
}

let key = 0;
/** An official release as the server's schedule saves it: Kairos sizes it from its own list on read. */
function fetched(source: 'bls' | 'fed' | 'ons', title: string, startsAt: string, id = `${source}:${(++key).toString(16).padStart(16, '0')}`): EconomicEventRecord {
  return { id, source, title, currency: source === 'ons' ? 'GBP' : 'USD', startsAt, impact: null, expected: null, previous: null, actual: null, savedAt: NOW, fetchedAt: NOW };
}
/** News the trader typed, with the trader's own size. */
function typed(title: string, startsAt: string, impact: EconomicEventImpact | null): EconomicEventRecord {
  return { id: `typed:${crypto.randomUUID()}`, source: 'typed', title, currency: 'USD', startsAt, impact, expected: null, previous: null, actual: null, savedAt: NOW, fetchedAt: null };
}
async function next(db: KairosDatabase, now = NOW) {
  const result = await loadNextBigNews(db, { now });
  if (result.kind !== 'ready') throw new Error(`expected ready, got ${result.kind}`);
  return result.news;
}

describe('T-061c the next big news (D269)', () => {
  it('gives the first big news from now on, with its plain name, the saved zone and when the news was checked', async () => {
    const db = await database();
    const jobs = fetched('bls', 'Employment Situation', at(2 * DAY + 2.5 * HOUR));
    await db.economicEvents.bulkPut([
      fetched('bls', 'Producer Price Index', at(HOUR)), // medium
      jobs,
      fetched('fed', 'FOMC meeting', at(3 * DAY)),
    ]);
    await db.metadata.put({ key: NEWS_COVERAGE_KEY, value: JSON.stringify({ version: 1, refreshedAt: at(-3 * HOUR), windows: [] }), updatedAt: at(-3 * HOUR) });
    const news = await next(db);
    expect(news.next?.event).toEqual(jobs);
    expect(news.next?.name).toBe('US jobs report');
    expect(news.timeZone).toBe('Europe/London');
    expect(news.refreshedAt).toBe(at(-3 * HOUR));
  });

  it('counts news the trader typed and marked big, and news starting right now', async () => {
    const db = await database();
    const mine = typed('My broker’s rate call', at(5 * HOUR), 'high');
    await db.economicEvents.bulkPut([fetched('bls', 'Consumer Price Index', at(DAY)), mine, typed('Small thing', at(HOUR), 'low'), typed('Not sure', at(2 * HOUR), null)]);
    expect((await next(db)).next).toEqual({ event: mine, name: 'My broker’s rate call' });
    const startingNow = fetched('ons', 'UK Labour Market: October 2026', NOW);
    await db.economicEvents.put(startingNow);
    expect((await next(db)).next).toEqual({ event: startingNow, name: 'UK jobs report' });
  });

  it('leaves out medium and small news, news already past and news more than 14 days away', async () => {
    const db = await database();
    await db.economicEvents.bulkPut([
      fetched('bls', 'Producer Price Index', at(HOUR)),
      fetched('fed', 'FOMC Minutes', at(2 * HOUR)),
      typed('Medium one', at(3 * HOUR), 'medium'),
      fetched('bls', 'Employment Situation', at(-1)),
      fetched('bls', 'Consumer Price Index', at(14 * DAY + 1)),
      fetched('bls', 'Some release Kairos does not list', at(4 * HOUR)),
    ]);
    expect((await next(db)).next).toBeNull();
    const last = fetched('fed', 'FOMC meeting', at(14 * DAY));
    await db.economicEvents.put(last);
    expect((await next(db)).next?.event).toEqual(last);
  });

  it('breaks a tie by name, then by id', async () => {
    const db = await database();
    const when = at(DAY);
    const cpi = fetched('bls', 'Consumer Price Index', when, 'bls:00000000000000ff');
    const jobs = fetched('bls', 'Employment Situation', when, 'bls:0000000000000001');
    await db.economicEvents.bulkPut([jobs, cpi]);
    // "US inflation (CPI)" comes before "US jobs report".
    expect((await next(db)).next?.event).toEqual(cpi);
    // The same name: the id decides.
    const sameName = fetched('bls', 'Consumer Price Index', when, 'bls:0000000000000000');
    await db.economicEvents.bulkPut([typed('US inflation (CPI)', when, 'high'), sameName]);
    expect((await next(db)).next?.event).toEqual(sameName);
  });

  it('says when there is no big news and the official schedules were never checked', async () => {
    const news = await next(await database('Asia/Manila'));
    expect(news).toEqual({ next: null, timeZone: 'Asia/Manila', refreshedAt: null });
  });

  it('needs a saved time zone, refuses a bad clock, and writes nothing', async () => {
    expect(await loadNextBigNews(await database(null), { now: NOW })).toEqual({ kind: 'time-zone-unconfigured' });
    const db = await database();
    await db.economicEvents.put(fetched('bls', 'Employment Situation', at(DAY)));
    const before = { events: await db.economicEvents.toArray(), metadata: await db.metadata.toArray() };
    expect(await loadNextBigNews(db, { now: 'not a time' })).toEqual({ kind: 'unavailable', reason: 'invalid-now' });
    await next(db);
    expect({ events: await db.economicEvents.toArray(), metadata: await db.metadata.toArray() }).toEqual(before);
  });
});
