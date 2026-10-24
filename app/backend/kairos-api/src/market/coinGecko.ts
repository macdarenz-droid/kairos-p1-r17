/**
 * U14 (D255): coin names from CoinGecko with the owner's key (the secret COIN_DATA_API_KEY, plan COIN_DATA_PLAN). Only
 * the top 250 coins by market value, and a name only when its symbol is not shared: a clash means no name. The strict
 * decoder rebuilds small JSON from checked values; nothing CoinGecko sends is passed through.
 */
import type { RouteAnswer } from '../router';
import type { UpstreamResult } from '../upstream';

export const COINGECKO_DEMO_HOST = 'api.coingecko.com';
export const COINGECKO_PRO_HOST = 'pro-api.coingecko.com';
export const COIN_NAMES_PER_PAGE = 250;
const RETRY_AFTER_MAX_SECONDS = 3_600;

/** The owner's CoinGecko plan (the var COIN_DATA_PLAN): "pro" for a paid key; anything else, or missing, is the demo plan. */
export type CoinDataPlan = 'demo' | 'pro';

export function coinDataPlan(value: string | undefined): CoinDataPlan {
  return value === 'pro' ? 'pro' : 'demo';
}

/** The one request: host and key header by plan (CoinGecko's documentation, read 2026-10-24). */
export function coinNamesRequest(plan: CoinDataPlan, key: string): Readonly<{ url: string; headers: Readonly<Record<string, string>> }> {
  const host = plan === 'pro' ? COINGECKO_PRO_HOST : COINGECKO_DEMO_HOST;
  const params = new URLSearchParams({ vs_currency: 'usd', order: 'market_cap_desc', per_page: String(COIN_NAMES_PER_PAGE), page: '1' });
  return Object.freeze({ url: `https://${host}/api/v3/coins/markets?${params}`, headers: Object.freeze({ [plan === 'pro' ? 'x-cg-pro-api-key' : 'x-cg-demo-api-key']: key }) });
}

export interface CoinName {
  readonly symbol: string;
  readonly name: string;
}

const SYMBOL = /^[A-Z0-9]{1,20}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The names as `{ symbol, name }`, A→Z by symbol. A row with a bad symbol or name is left out, and so is every row of a
 * symbol two coins share. Null when the answer is not a list of at most 250 rows.
 */
export function decodeCoinGeckoMarkets(text: string): readonly CoinName[] | null {
  let rows: unknown;
  try { rows = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(rows) || rows.length > COIN_NAMES_PER_PAGE) return null;
  const seen = new Map<string, number>();
  const named: CoinName[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row.symbol !== 'string') continue;
    const symbol = row.symbol.trim().toUpperCase();
    if (!SYMBOL.test(symbol)) continue;
    seen.set(symbol, (seen.get(symbol) ?? 0) + 1);
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    if (name.length === 0 || name.length > 60 || CONTROL.test(name)) continue;
    named.push({ symbol, name });
  }
  return Object.freeze(named
    .filter((coin) => seen.get(coin.symbol) === 1)
    .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
    .map((coin) => Object.freeze(coin)));
}

/** The server's answer for a CoinGecko failure: a refused key, too many requests, or down. */
export function coinGeckoFailure(result: Extract<UpstreamResult, { ok: false }>): RouteAnswer {
  if (result.failure === 'status' && (result.status === 401 || result.status === 403)) return { ok: false, reason: 'source-refused' };
  if (result.failure === 'status' && result.status === 429) {
    return { ok: false, reason: 'source-busy', retryAfter: result.retryAfterSeconds === undefined ? 60 : Math.min(result.retryAfterSeconds, RETRY_AFTER_MAX_SECONDS) };
  }
  return { ok: false, reason: 'source-unavailable' };
}
