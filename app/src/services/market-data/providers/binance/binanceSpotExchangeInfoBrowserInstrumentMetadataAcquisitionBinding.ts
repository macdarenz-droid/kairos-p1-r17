import type {
  LiveMarketUniverseInstrumentMetadataAcquisitionPort,
  LiveMarketUniverseInstrumentMetadataAcquisitionResult,
} from '../../LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../../liveMarketUniverseInstrumentMetadataFact';
import { createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort } from './binanceSpotExchangeInfoInstrumentMetadataAcquisitionAdapter';
import { connectBinanceSpotExchangeInfoBrowserPublicRestRequest } from './binanceSpotExchangeInfoBrowserPublicRestConnector';

/** exchangeInfo changes rarely; one download serves Home and Analysis for this long. */
export const BINANCE_SPOT_EXCHANGE_INFO_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

type CacheEntry =
  | { readonly kind: 'stored'; readonly facts: readonly LiveMarketUniverseInstrumentMetadataFact[]; readonly storedAtMs: number }
  | { readonly kind: 'in-flight'; readonly promise: Promise<LiveMarketUniverseInstrumentMetadataAcquisitionResult>; readonly controller: AbortController; waiters: number };

const FAILED: LiveMarketUniverseInstrumentMetadataAcquisitionResult = Object.freeze({ ok: false, reason: 'acquisition-failed' });

let cacheEntry: CacheEntry | null = null;

/** Clears the session cache. Tests call it so each case starts with no stored exchangeInfo. */
export function resetBinanceSpotExchangeInfoCache(): void {
  cacheEntry = null;
}

export interface BinanceSpotExchangeInfoBrowserAcquisitionOptions {
  readonly now?: () => number;
}

function startSharedRequest(now: () => number): Extract<CacheEntry, { kind: 'in-flight' }> {
  const controller = new AbortController();
  const port = createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort(connectBinanceSpotExchangeInfoBrowserPublicRestRequest);
  const entry: Extract<CacheEntry, { kind: 'in-flight' }> = {
    kind: 'in-flight',
    controller,
    waiters: 0,
    promise: port.acquireInstrumentMetadata({ signal: controller.signal }).then((result) => {
      // An empty market list is never kept: it would hide every market for hours.
      if (cacheEntry === entry) cacheEntry = result.ok && result.facts.length > 0 ? { kind: 'stored', facts: result.facts, storedAtMs: now() } : null;
      return result;
    }),
  };
  return entry;
}

function waitForSharedRequest(
  entry: Extract<CacheEntry, { kind: 'in-flight' }>,
  signal: AbortSignal | undefined,
): Promise<LiveMarketUniverseInstrumentMetadataAcquisitionResult> {
  entry.waiters += 1;
  return new Promise((resolve) => {
    let settled = false;
    const leave = () => {
      settled = true;
      entry.waiters -= 1;
      signal?.removeEventListener('abort', onAbort);
    };
    const onAbort = () => {
      if (settled) return;
      leave();
      if (entry.waiters === 0) {
        if (cacheEntry === entry) cacheEntry = null;
        entry.controller.abort();
      }
      resolve(FAILED);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    entry.promise.then((result) => {
      if (settled) return;
      leave();
      resolve(result);
    });
  });
}

/**
 * Browser exchangeInfo port with one session cache shared by every caller.
 * A stored success is reused for BINANCE_SPOT_EXCHANGE_INFO_CACHE_TTL_MS; failures are never stored.
 * Concurrent callers share one request that uses its own AbortController: a caller's signal
 * ends only that caller's wait, and the request is aborted only when every waiting caller has aborted.
 */
export function createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort(
  options: BinanceSpotExchangeInfoBrowserAcquisitionOptions = {},
): LiveMarketUniverseInstrumentMetadataAcquisitionPort {
  const now = options.now ?? (() => Date.now());
  return {
    async acquireInstrumentMetadata(callerOptions) {
      const signal = callerOptions?.signal;
      if (signal?.aborted) return FAILED;
      if (cacheEntry?.kind === 'stored') {
        // A negative age means the device clock moved back: treat the copy as expired.
        const ageMs = now() - cacheEntry.storedAtMs;
        if (ageMs >= 0 && ageMs <= BINANCE_SPOT_EXCHANGE_INFO_CACHE_TTL_MS) return { ok: true, facts: cacheEntry.facts };
        cacheEntry = null;
      }
      if (cacheEntry === null) cacheEntry = startSharedRequest(now);
      return waitForSharedRequest(cacheEntry, signal);
    },
  };
}
