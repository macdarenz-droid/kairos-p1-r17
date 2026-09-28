/**
 * P34: the latest headlines, kept on this device only (device metadata: never in a backup, kept through a restore).
 * Someone else's words: titles and links only, links checked against the source's hosts on every read.
 */
import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { NEWS_HEADLINE_SOURCE_IDS, isAllowedNewsLink, isNewsHeadlineSourceId, type NewsHeadlineSourceId } from '../../domain/economic-calendar/newsSources';
import type { KairosApiFailure } from '../../services/kairos-api/kairosApi';
import type { NewsApiPort, NewsHeadline } from '../../services/kairos-api/newsApi';
import { pickNewsFailure } from './fetchedNews';

export const NEWS_HEADLINES_KEY = 'device.news.headlines.v1';
export const NEWS_HEADLINES_PER_SOURCE = 10;
const TITLE_MAX = 300;

export interface SavedNewsHeadline {
  readonly source: NewsHeadlineSourceId;
  readonly title: string;
  readonly url: string;
  readonly publishedAt: string;
  readonly publisher: string | null;
}
export interface SavedNewsHeadlines {
  readonly refreshedAt: string | null;
  readonly failedSources: readonly NewsHeadlineSourceId[];
  readonly items: readonly SavedNewsHeadline[];
}
export type RefreshNewsHeadlinesResult =
  | Readonly<{ ok: true; refreshedAt: string; failedSources: readonly NewsHeadlineSourceId[] }>
  | Readonly<{ ok: false; reason: 'unavailable'; failure: KairosApiFailure }>
  | Readonly<{ ok: false; reason: 'storage-error' }>;

const EMPTY: SavedNewsHeadlines = Object.freeze({ refreshedAt: null, failedSources: Object.freeze([]), items: Object.freeze([]) });
const NOT_SET_UP: KairosApiFailure = Object.freeze({ ok: false as const, reason: 'not-set-up' as const });
const TRANSPORT_FAILED: KairosApiFailure = Object.freeze({ ok: false as const, reason: 'transport-failed' as const });

const isInstant = (value: unknown): value is string =>
  typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isTitle = (value: unknown): value is string => typeof value === 'string' && value.length >= 1 && value.length <= TITLE_MAX;
const newestFirst = (a: SavedNewsHeadline, b: SavedNewsHeadline) => b.publishedAt.localeCompare(a.publishedAt) || a.url.localeCompare(b.url);

/** The saved headlines; anything unreadable is left out, and an item whose link is not allowed for its source is dropped. Never throws. */
export function parseSavedNewsHeadlines(value: string | undefined): SavedNewsHeadlines {
  if (value === undefined) return EMPTY;
  let json: unknown;
  try {
    json = JSON.parse(value);
  } catch {
    return EMPTY;
  }
  if (!isRecord(json) || json.version !== 1) return EMPTY;
  const items: SavedNewsHeadline[] = [];
  for (const item of Array.isArray(json.items) ? json.items : []) {
    if (!isRecord(item) || !isNewsHeadlineSourceId(item.source) || !isTitle(item.title) || typeof item.url !== 'string' || !isInstant(item.publishedAt)) continue;
    if (!isAllowedNewsLink(item.source, item.url)) continue;
    const publisher = typeof item.publisher === 'string' && item.publisher.length > 0 ? item.publisher : null;
    items.push(Object.freeze({ source: item.source, title: item.title, url: item.url, publishedAt: item.publishedAt, publisher }));
  }
  const failed = Array.isArray(json.failedSources) ? json.failedSources : [];
  return Object.freeze({
    refreshedAt: isInstant(json.refreshedAt) ? json.refreshedAt : null,
    failedSources: Object.freeze(NEWS_HEADLINE_SOURCE_IDS.filter((source) => failed.includes(source))),
    items: Object.freeze(items),
  });
}

/** The saved headlines; a failed read is none. */
export async function loadSavedNewsHeadlines(db: KairosDatabase): Promise<SavedNewsHeadlines> {
  try {
    return parseSavedNewsHeadlines((await createKairosRepositories(db).metadata.get(NEWS_HEADLINES_KEY))?.value);
  } catch {
    return EMPTY;
  }
}

/** One source's answer as saved items: allowed links and 1–300 character titles only, the newest 10. */
function keptItems(source: NewsHeadlineSourceId, items: readonly NewsHeadline[]): SavedNewsHeadline[] {
  return items
    .filter((item) => isTitle(item.title) && isInstant(item.publishedAt) && isAllowedNewsLink(source, item.url))
    .map((item) => Object.freeze({ source, title: item.title, url: item.url, publishedAt: item.publishedAt, publisher: item.publisher }))
    .sort(newestFirst)
    .slice(0, NEWS_HEADLINES_PER_SOURCE);
}

/** Asks the six headline routes at once and saves what answered; a source that failed keeps its saved items. Nothing is written when none answered. */
export async function refreshNewsHeadlines(
  db: KairosDatabase,
  port: NewsApiPort,
  options: { readonly now: string; readonly signal?: AbortSignal },
): Promise<RefreshNewsHeadlinesResult> {
  if (!port.setUp) return Object.freeze({ ok: false as const, reason: 'unavailable' as const, failure: NOT_SET_UP });
  const results = await Promise.all(
    NEWS_HEADLINE_SOURCE_IDS.map(async (source) => {
      try {
        return await port.headlines(source, { signal: options.signal });
      } catch {
        return TRANSPORT_FAILED;
      }
    }),
  );
  const failures: KairosApiFailure[] = [];
  const failedSources: NewsHeadlineSourceId[] = [];
  const fresh = new Map<NewsHeadlineSourceId, SavedNewsHeadline[]>();
  NEWS_HEADLINE_SOURCE_IDS.forEach((source, index) => {
    const result = results[index];
    if (result.ok) fresh.set(source, keptItems(source, result.value.items));
    else { failures.push(result); failedSources.push(source); }
  });
  if (fresh.size === 0) return Object.freeze({ ok: false as const, reason: 'unavailable' as const, failure: pickNewsFailure(failures) });
  const { now } = options;
  try {
    await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      const saved = parseSavedNewsHeadlines((await repositories.metadata.get(NEWS_HEADLINES_KEY))?.value);
      const items = NEWS_HEADLINE_SOURCE_IDS.flatMap((source) => fresh.get(source) ?? saved.items.filter((item) => item.source === source));
      await repositories.metadata.put({ key: NEWS_HEADLINES_KEY, value: JSON.stringify({ version: 1, refreshedAt: now, failedSources, items }), updatedAt: now });
    });
  } catch {
    return Object.freeze({ ok: false as const, reason: 'storage-error' as const });
  }
  return Object.freeze({ ok: true as const, refreshedAt: now, failedSources: Object.freeze(failedSources) });
}
