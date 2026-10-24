/**
 * T-053d (D223): the markets the trader says they trade, chosen in the setup. One metadata preference (as D110 and
 * D222); none saved keeps today's behaviour. Its readers: the Journal's trade form starts on the first one, and Home
 * opens on "Your Trades" when crypto is not among them (Live Market shows crypto only).
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import type { MarketType } from '../../domain/trades';

export const tradedMarketsMetadataKey = 'preferences.traded-markets.v1';

/** Every market a trade can have (MarketType), in the setup's order: crypto first, as Kairos's live prices are. */
export const TRADED_MARKET_TYPES: readonly MarketType[] = Object.freeze(['crypto', 'forex', 'stock', 'futures', 'options', 'other'] as const);

export type ParseTradedMarketsResult =
  | Readonly<{ ok: true; markets: readonly MarketType[] }>
  | Readonly<{ ok: false; reason: 'none-chosen' | 'unknown-market' }>;

/** At least one known market, each once, in TRADED_MARKET_TYPES order (the first is the trade form's start). */
export function parseTradedMarkets(input: readonly string[]): ParseTradedMarketsResult {
  if (!input.every((market) => (TRADED_MARKET_TYPES as readonly string[]).includes(market))) return Object.freeze({ ok: false as const, reason: 'unknown-market' as const });
  const markets = Object.freeze(TRADED_MARKET_TYPES.filter((market) => input.includes(market)));
  if (markets.length === 0) return Object.freeze({ ok: false as const, reason: 'none-chosen' as const });
  return Object.freeze({ ok: true as const, markets });
}

/** The saved markets, or null when none are saved or the record is damaged. Never writes. */
export async function readTradedMarkets(metadata: MetadataRepository): Promise<readonly MarketType[] | null> {
  const stored = await metadata.get(tradedMarketsMetadataKey);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || Object.keys(record).sort().join(',') !== 'markets,version' || !Array.isArray(record.markets)) return null;
    const markets = record.markets as unknown[];
    if (!markets.every((market): market is string => typeof market === 'string') || new Set(markets).size !== markets.length) return null;
    const result = parseTradedMarkets(markets);
    return result.ok && result.markets.join(',') === markets.join(',') ? result.markets : null;
  } catch {
    return null;
  }
}

/** The last markets read or saved for each database in this visit (memory only), so a screen can start on them. */
const known = new WeakMap<KairosDatabase, readonly MarketType[] | null>();

/** The markets last read or saved for `db` in this visit; undefined before the first read. */
export function knownTradedMarkets(db: KairosDatabase): readonly MarketType[] | null | undefined {
  return known.get(db);
}

/** The saved markets for screens, which never import data/repositories. */
export async function loadTradedMarkets(db: KairosDatabase): Promise<readonly MarketType[] | null> {
  const markets = await readTradedMarkets(createKairosRepositories(db).metadata);
  known.set(db, markets);
  return markets;
}

export type SaveTradedMarketsResult =
  | { readonly ok: true; readonly markets: readonly MarketType[] }
  | { readonly ok: false; readonly type: 'validation-error'; readonly reason: 'none-chosen' | 'unknown-market' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'traded-markets-save-failed' };

/** Saves the chosen markets as one atomic write; an invalid choice saves nothing. */
export async function saveTradedMarkets(db: KairosDatabase, input: readonly string[], dependencies: { readonly now?: () => string } = {}): Promise<SaveTradedMarketsResult> {
  const parsed = parseTradedMarkets(input);
  if (!parsed.ok) return { ok: false, type: 'validation-error', reason: parsed.reason };
  const updatedAt = (dependencies.now ?? (() => new Date().toISOString()))();
  try {
    await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      await repositories.metadata.put({ key: tradedMarketsMetadataKey, value: JSON.stringify({ version: 1, markets: parsed.markets }), updatedAt });
    });
    known.set(db, parsed.markets);
    return { ok: true, markets: parsed.markets };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'traded-markets-save-failed' };
  }
}
