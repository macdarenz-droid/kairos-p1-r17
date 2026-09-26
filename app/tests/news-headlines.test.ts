import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBackupRestore, prepareBackupRestore } from '../src/application/backup';
import type { NewsApiPort } from '../src/application/economic-calendar/fetchedNews';
import { NEWS_HEADLINES_KEY, loadSavedNewsHeadlines, refreshNewsHeadlines } from '../src/application/economic-calendar/newsHeadlines';
import { createKairosDatabaseSnapshot, serializeKairosBackup } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { NEWS_HEADLINE_SOURCE_IDS } from '../src/domain/economic-calendar/newsSources';
import type { KairosApiResult } from '../src/services/kairos-api/kairosApi';
import type { NewsHeadline, NewsHeadlinesAnswer } from '../src/services/kairos-api/newsApi';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-news-headlines-${crypto.randomUUID()}`;
  names.push(name);
  const db = createKairosDatabase(name);
  opened.push(db);
  await openKairosDatabase(db);
  return db;
}

const now = '2026-09-24T04:00:00.000Z';
const FED: NewsHeadline = { title: 'Federal Reserve Board announces approval of application by Peoples Bancorp Inc.', url: 'https://www.federalreserve.gov/newsevents/pressreleases/orders20260924a.htm', publishedAt: '2026-09-24T03:00:00.000Z', publisher: null };
const YAHOO: NewsHeadline = { title: 'Stocks rise as inflation cools', url: 'https://finance.yahoo.com/news/stocks-rise-123.html', publishedAt: '2026-09-24T04:00:00.000Z', publisher: 'Reuters' };
const ECB: NewsHeadline = { title: 'Monetary policy statement', url: 'https://www.ecb.europa.eu/press/pr/date/2026/html/x.en.html', publishedAt: '2026-09-23T12:00:00.000Z', publisher: null };
const answer = (source: string, items: readonly NewsHeadline[]): KairosApiResult<NewsHeadlinesAnswer> =>
  ({ ok: true, value: { source, fetchedAt: now, items, leftOut: 0 } });
function port(headlines: (source: string) => Promise<KairosApiResult<NewsHeadlinesAnswer>>, setUp = true) {
  const spy = vi.fn(headlines);
  const news: NewsApiPort = { setUp, calendar: vi.fn(async () => ({ ok: false as const, reason: 'transport-failed' as const })), headlines: spy };
  return { news, headlines: spy };
}
const saved = async (db: KairosDatabase) => (await loadSavedNewsHeadlines(db)).items;

describe('T-046m headlines are kept on this device', () => {
  it('saves the allowed items, the newest 10 per source, under a device key that no backup carries and a restore keeps', async () => {
    const db = await database();
    const older = serializeKairosBackup(await createKairosDatabaseSnapshot(db));
    const twelve = Array.from({ length: 12 }, (_, index): NewsHeadline => ({ ...FED, title: `Fed ${index}`, url: `https://www.federalreserve.gov/newsevents/pressreleases/n${index}.htm`, publishedAt: new Date(Date.parse(now) - (index + 1) * 60_000).toISOString() }));
    const { news } = port(async (source) => {
      if (source === 'fed') return answer(source, twelve);
      if (source === 'yahoo') return answer(source, [YAHOO, { ...YAHOO, url: 'https://evil.example/a' }, { ...YAHOO, url: 'https://finance.yahoo.com/news/long.html', title: 't'.repeat(301) }]);
      return answer(source, []);
    });
    expect(await refreshNewsHeadlines(db, news, { now })).toEqual({ ok: true, refreshedAt: now, failedSources: [] });
    const items = await saved(db);
    expect(items.filter((item) => item.source === 'fed').map((item) => item.title)).toEqual(Array.from({ length: 10 }, (_, index) => `Fed ${index}`));
    expect(items.filter((item) => item.source === 'yahoo')).toEqual([{ source: 'yahoo', ...YAHOO }]);
    expect(NEWS_HEADLINES_KEY.startsWith('device.')).toBe(true);
    expect((await db.metadata.get(NEWS_HEADLINES_KEY))?.updatedAt).toBe(now);
    expect((await createKairosDatabaseSnapshot(db)).payload.metadata.map((row) => row.key)).not.toContain(NEWS_HEADLINES_KEY);
    const prepared = await prepareBackupRestore(db, older);
    if (!prepared.ok) throw new Error(prepared.type);
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await saved(db)).toHaveLength(11);
  });

  it('keeps a failed source\'s saved items and names it; writes nothing when none answer', async () => {
    const db = await database();
    await refreshNewsHeadlines(db, port(async (source) => answer(source, source === 'ecb' ? [ECB] : [])).news, { now: '2026-09-24T03:00:00.000Z' });
    const result = await refreshNewsHeadlines(db, port(async (source) => (source === 'ecb' ? { ok: false as const, reason: 'transport-failed' as const } : answer(source, source === 'fed' ? [FED] : []))).news, { now });
    expect(result).toEqual({ ok: true, refreshedAt: now, failedSources: ['ecb'] });
    expect((await saved(db)).map((item) => item.title)).toEqual([FED.title, ECB.title]);
    expect((await loadSavedNewsHeadlines(db)).failedSources).toEqual(['ecb']);

    const before = await db.metadata.get(NEWS_HEADLINES_KEY);
    const down = port(async () => ({ ok: false as const, reason: 'transport-failed' as const }));
    expect(await refreshNewsHeadlines(db, down.news, { now: '2026-09-24T05:00:00.000Z' })).toEqual({ ok: false, reason: 'unavailable', failure: { ok: false, reason: 'transport-failed' } });
    expect(down.headlines.mock.calls.map(([source]) => source)).toEqual([...NEWS_HEADLINE_SOURCE_IDS]);
    expect(await db.metadata.get(NEWS_HEADLINES_KEY)).toEqual(before);
  });

  it('is not set up without a server address, and says so when saving fails', async () => {
    const db = await database();
    const off = port(async (source) => answer(source, [FED]), false);
    expect(await refreshNewsHeadlines(db, off.news, { now })).toEqual({ ok: false, reason: 'unavailable', failure: { ok: false, reason: 'not-set-up' } });
    expect(off.headlines).not.toHaveBeenCalled();
    vi.spyOn(db.metadata, 'put').mockRejectedValue(new Error('disk full'));
    expect(await refreshNewsHeadlines(db, port(async (source) => answer(source, source === 'fed' ? [FED] : [])).news, { now })).toEqual({ ok: false, reason: 'storage-error' });
    expect(await saved(db)).toEqual([]);
  });

  it('reads a saved item whose link is not allowed any more as gone', async () => {
    const db = await database();
    await db.metadata.put({ key: NEWS_HEADLINES_KEY, value: JSON.stringify({ version: 1, refreshedAt: now, failedSources: [], items: [{ source: 'fed', ...FED }, { source: 'fed', ...FED, url: 'https://evil.example/x' }] }), updatedAt: now });
    expect((await saved(db)).map((item) => item.url)).toEqual([FED.url]);
  });
});
