/**
 * U1: how long a route's answer is kept, and where. Three layers, each optional per route:
 * 1. Workers Cache in front of the Worker ("cache": { "enabled": true } in wrangler.jsonc; works on workers.dev): it follows
 *    the answer's `cache-control: public, max-age=N` and serves hits without running the Worker (and without the device
 *    check or the limits: a device-only answer must use edgeSeconds 0).
 * 2. A per-isolate memory copy (lost when the isolate ends), capped by count and by JSON size: an isolate has 128 MB and
 *    parsed answers are several times larger than their text.
 * 3. KV (binding KAIROS_API_CACHE) for answers kept an hour or more; the Free plan allows 1,000 KV writes a day.
 * Only ok answers are kept. Keys carry the route id and its version, so a changed answer shape never reads an old copy.
 */
import type { KvStore } from './env';

export interface RouteCachePolicy {
  /** Bump when the answer's shape changes. */
  readonly version: number;
  /** Workers Cache and browser freshness, in seconds (0 = no-store). */
  readonly edgeSeconds: number;
  /** Per-isolate copy, in seconds (0 = none). */
  readonly memorySeconds: number;
  /** KV copy, in seconds (null = none; at least KV_MIN_SECONDS). */
  readonly kvSeconds: number | null;
}

export const MEMORY_CACHE_MAX_ENTRIES = 200;
/** All memory copies together, in characters of their JSON text. */
export const MEMORY_CACHE_MAX_CHARS = 8_000_000;
/** A bigger answer is never kept in memory (KV may still keep it). */
export const MEMORY_ENTRY_MAX_CHARS = 1_000_000;
export const KV_MIN_SECONDS = 3_600;

interface Stored { readonly storedAt: string; readonly data: unknown }
export type CacheHit = Readonly<{ layer: 'memory' | 'kv'; stored: Stored }>;

/** Oldest first (Map order); `size` is the entry's JSON text length. */
const memory = new Map<string, { readonly expiresAt: number; readonly stored: Stored; readonly size: number }>();
let memoryChars = 0;

export function cacheControlFor(policy: RouteCachePolicy | null): string {
  return policy === null || policy.edgeSeconds <= 0 ? 'no-store' : `public, max-age=${policy.edgeSeconds}`;
}

/** routeId:v<version>:<query sorted by name>: the same answer for the same question, whatever the order of the query. */
export function cacheKey(routeId: string, policy: RouteCachePolicy, query: URLSearchParams): string {
  const sorted = [...query.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${routeId}:v${policy.version}:${new URLSearchParams(sorted).toString()}`;
}

export async function readCached(key: string, policy: RouteCachePolicy, kv: KvStore | undefined, now: number): Promise<CacheHit | null> {
  const inMemory = memory.get(key);
  if (inMemory !== undefined) {
    if (inMemory.expiresAt > now) return { layer: 'memory', stored: inMemory.stored };
    forget(key);
  }
  if (policy.kvSeconds === null || kv === undefined) return null;
  let text: string | null;
  try { text = await kv.get(key, 'text'); } catch { return null; }
  if (text === null) return null;
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { return null; }
  if (typeof parsed !== 'object' || parsed === null || typeof (parsed as Stored).storedAt !== 'string' || !('data' in parsed)) return null;
  const stored = parsed as Stored;
  remember(key, stored, text.length, policy, now);
  return { layer: 'kv', stored };
}

/** Keeps an ok answer; the KV write runs after the response through waitUntil and never fails the request. */
export function keep(key: string, stored: Stored, policy: RouteCachePolicy, kv: KvStore | undefined, now: number, waitUntil: (promise: Promise<unknown>) => void): void {
  const text = JSON.stringify(stored);
  remember(key, stored, text.length, policy, now);
  if (policy.kvSeconds !== null && kv !== undefined) {
    waitUntil(kv.put(key, text, { expirationTtl: policy.kvSeconds }).catch(() => undefined));
  }
}

/** Keeps a memory copy unless the answer is too big; evicts the oldest copies until the count and the size fit. */
function remember(key: string, stored: Stored, size: number, policy: RouteCachePolicy, now: number): void {
  forget(key);
  if (policy.memorySeconds <= 0 || size > MEMORY_ENTRY_MAX_CHARS) return;
  for (const [oldestKey] of memory) {
    if (memory.size < MEMORY_CACHE_MAX_ENTRIES && memoryChars + size <= MEMORY_CACHE_MAX_CHARS) break;
    forget(oldestKey);
  }
  memory.set(key, { expiresAt: now + policy.memorySeconds * 1000, stored, size });
  memoryChars += size;
}

function forget(key: string): void {
  const entry = memory.get(key);
  if (entry === undefined) return;
  memoryChars -= entry.size;
  memory.delete(key);
}

/** Tests only: forget the per-isolate copies. */
export function clearMemoryCache(): void {
  memory.clear();
  memoryChars = 0;
}
