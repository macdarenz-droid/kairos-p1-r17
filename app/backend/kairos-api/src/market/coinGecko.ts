/**
 * U14 (D255): coin names from CoinGecko with the owner's key (the secret COIN_DATA_API_KEY, plan COIN_DATA_PLAN). Only
 * the top 250 coins by market value, and a name only when its symbol is not shared: a clash means no name. The strict
 * decoder rebuilds small JSON from checked values; nothing CoinGecko sends is passed through.
 * T-061f (D272): the same list gives each coin's logo address, kept only when it is on CoinGecko's image host in its
 * one known shape; the logo itself is kept only when its first bytes say PNG, JPEG or WebP (never SVG: an image with
 * code in it). Remote content is data, never code.
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

/** A coin of the list with what Kairos is sure of: its name, its logo address, or both. */
export interface CoinGeckoCoin {
  readonly symbol: string;
  readonly name?: string;
  readonly image?: string;
}

/** The only host a logo is read from (D272). */
export const COINGECKO_IMAGE_HOST = 'coin-images.coingecko.com';
const IMAGE_PATH = /^\/coins\/images\/[0-9]{1,10}\/large\/[A-Za-z0-9._-]{1,120}\.(?:png|jpg|jpeg|webp)$/i;
/** CoinGecko adds a version number (`?1696501400`); nothing else rides along. */
const IMAGE_QUERY = /^(?:\?[A-Za-z0-9._~=&-]{1,100})?$/;
const IMAGE_ADDRESS_MAX = 300;

/**
 * A logo address CoinGecko sent, when it is https://coin-images.coingecko.com/coins/images/<digits>/large/<name>.png
 * (or .jpg, .jpeg, .webp), with no user, port or fragment; null for anything else.
 */
export function coinGeckoImageAddress(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > IMAGE_ADDRESS_MAX || !value.startsWith(`https://${COINGECKO_IMAGE_HOST}/`)) return null;
  let url: URL;
  try { url = new URL(value); } catch { return null; }
  if (url.protocol !== 'https:' || url.hostname !== COINGECKO_IMAGE_HOST || url.username !== '' || url.password !== '' || url.port !== '' || url.hash !== '') return null;
  return IMAGE_PATH.test(url.pathname) && IMAGE_QUERY.test(url.search) ? url.href : null;
}

const SYMBOL = /^[A-Z0-9]{1,20}$/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const isName = (value: string) => value.length > 0 && value.length <= 60 && !CONTROL.test(value);

/**
 * The coins as `{ symbol, name, image }`, A→Z by symbol, each with a checked name, a checked logo address
 * (coinGeckoImageAddress), or both. A row with a bad symbol, or with neither, is left out, and so is every row of a
 * symbol two coins share. Null when the answer is not a list of at most 250 rows.
 */
export function decodeCoinGeckoMarkets(text: string): readonly CoinGeckoCoin[] | null {
  let rows: unknown;
  try { rows = JSON.parse(text); } catch { return null; }
  if (!Array.isArray(rows) || rows.length > COIN_NAMES_PER_PAGE) return null;
  const seen = new Map<string, number>();
  const coins: CoinGeckoCoin[] = [];
  for (const row of rows) {
    if (!isRecord(row) || typeof row.symbol !== 'string') continue;
    const symbol = row.symbol.trim().toUpperCase();
    if (!SYMBOL.test(symbol)) continue;
    seen.set(symbol, (seen.get(symbol) ?? 0) + 1);
    const name = typeof row.name === 'string' ? row.name.trim() : '';
    const image = coinGeckoImageAddress(row.image);
    if (!isName(name) && image === null) continue;
    coins.push({ symbol, ...(isName(name) ? { name } : {}), ...(image === null ? {} : { image }) });
  }
  return Object.freeze(coins
    .filter((coin) => seen.get(coin.symbol) === 1)
    .sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
    .map((coin) => Object.freeze(coin)));
}

/** The names of the coins that have one, `{ symbol, name }` A→Z (D255's answer). */
export function coinNamesOf(coins: readonly CoinGeckoCoin[]): readonly CoinName[] {
  return Object.freeze(coins.flatMap((coin) => (coin.name === undefined ? [] : [Object.freeze({ symbol: coin.symbol, name: coin.name })])));
}

/**
 * The logo addresses of these coins from the kept list (KV or memory), each checked again by the same rule; a row that
 * breaks a rule is left out. Null when the copy is not a list of at most 250 rows (it is then read again). Only the
 * coins asked are checked, so a kept list costs little CPU.
 */
export function keptCoinGeckoImages(data: unknown, symbols: readonly string[]): ReadonlyMap<string, string> | null {
  if (!Array.isArray(data) || data.length === 0 || data.length > COIN_NAMES_PER_PAGE) return null;
  const asked = new Set(symbols);
  const images = new Map<string, string>();
  for (const item of data as unknown[]) {
    if (!isRecord(item) || typeof item.symbol !== 'string' || !asked.has(item.symbol) || images.has(item.symbol)) continue;
    const image = coinGeckoImageAddress(item.image);
    if (image !== null) images.set(item.symbol, image);
  }
  return images;
}

/** A logo's kind by its first bytes (its signature); null for anything else, an SVG or GIF too. */
export function coinLogoKind(bytes: Uint8Array): 'png' | 'jpeg' | 'webp' | null {
  const starts = (signature: readonly number[], at = 0) => signature.every((byte, index) => bytes[at + index] === byte);
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'png';
  if (starts([0xff, 0xd8, 0xff])) return 'jpeg';
  // "RIFF", four bytes of size, "WEBP".
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  return null;
}

const BASE64 = new TextEncoder().encode('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/');
const PAD = 61; // "="

/**
 * Bytes as base64, written into bytes and decoded once (no string per byte). Used only when the runtime lacks the
 * native `Uint8Array.prototype.toBase64` (workerd has it, checked 2026-10-25), which costs next to no CPU.
 */
export function base64OfBytes(bytes: Uint8Array): string {
  const out = new Uint8Array(Math.ceil(bytes.length / 3) * 4);
  let o = 0;
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out[o++] = BASE64[n >>> 18]!; out[o++] = BASE64[(n >>> 12) & 63]!; out[o++] = BASE64[(n >>> 6) & 63]!; out[o++] = BASE64[n & 63]!;
  }
  if (i < bytes.length) {
    const two = i + 1 < bytes.length;
    const n = (bytes[i]! << 16) | (two ? bytes[i + 1]! << 8 : 0);
    out[o++] = BASE64[n >>> 18]!; out[o++] = BASE64[(n >>> 12) & 63]!; out[o++] = two ? BASE64[(n >>> 6) & 63]! : PAD; out[o++] = PAD;
  }
  return new TextDecoder().decode(out);
}

type NativeBase64 = Uint8Array & { toBase64?: () => string };

/** The logo as a data address (`data:image/png;base64,…`), its type from its bytes; null when they are not PNG, JPEG or WebP. */
export function coinLogoDataAddress(bytes: Uint8Array): string | null {
  const kind = coinLogoKind(bytes);
  if (kind === null) return null;
  const native = (bytes as NativeBase64).toBase64;
  return `data:image/${kind};base64,${typeof native === 'function' ? native.call(bytes) : base64OfBytes(bytes)}`;
}

/** The server's answer for a CoinGecko failure: a refused key, too many requests, or down. */
export function coinGeckoFailure(result: Extract<UpstreamResult, { ok: false }>): RouteAnswer {
  if (result.failure === 'status' && (result.status === 401 || result.status === 403)) return { ok: false, reason: 'source-refused' };
  if (result.failure === 'status' && result.status === 429) {
    return { ok: false, reason: 'source-busy', retryAfter: result.retryAfterSeconds === undefined ? 60 : Math.min(result.retryAfterSeconds, RETRY_AFTER_MAX_SECONDS) };
  }
  return { ok: false, reason: 'source-unavailable' };
}
