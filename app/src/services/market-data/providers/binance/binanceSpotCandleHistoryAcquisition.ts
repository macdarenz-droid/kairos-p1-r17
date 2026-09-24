import type { MarketCandleHistoryPort } from '../../MarketCandleHistoryPort';
import { parseIsoUtcInstant } from '../../marketDataObservationSemantics';
import { describeBinanceSpotCandleHistoryRequest, type BinanceSpotCandleHistoryRequestDescriptor } from './binanceSpotCandleHistoryRequest';
import { decodeBinanceSpotCandleHistoryResponse } from './binanceSpotCandleHistoryResponse';

export type BinanceSpotCandleHistoryConnector = (
  request: BinanceSpotCandleHistoryRequestDescriptor,
  options?: { readonly signal?: AbortSignal },
) => Promise<{ readonly status: number; readonly body: string; readonly retryAfter: string | null }>;

/** One request, one independent snapshot. No retry, cache, interval scheduler,
 * selection state or receipt clock is owned here. Cancellation wins even when
 * an injected transport finishes after its signal was aborted. */
export function createBinanceSpotCandleHistoryPort(connect: BinanceSpotCandleHistoryConnector, readObservedAt: () => string): MarketCandleHistoryPort {
  return {
    async acquireHistory(request, options) {
      if (options?.signal?.aborted) return { ok: false, reason: 'cancelled' };
      const described = describeBinanceSpotCandleHistoryRequest(request);
      if (!described.ok) return { ok: false, reason: 'invalid-request', detail: described.reason };
      try {
        const response = await connect(described.request, options);
        if (options?.signal?.aborted) return { ok: false, reason: 'cancelled' };
        if (!Number.isInteger(response.status) || response.status < 100 || response.status > 599) return { ok: false, reason: 'invalid-response', detail: 'invalid-http-status' };
        if (response.status !== 200) return { ok: false, reason: 'http-error', status: response.status, retryAfter: response.retryAfter };
        const decoded = decodeBinanceSpotCandleHistoryResponse(response.body, described.request);
        if (!decoded.ok) return { ok: false, reason: 'invalid-response', detail: decoded.reason };
        const observedAt = readObservedAt();
        if (parseIsoUtcInstant(observedAt) === null) return { ok: false, reason: 'observed-at-invalid' };
        if (options?.signal?.aborted) return { ok: false, reason: 'cancelled' };
        return { ok: true, snapshot: Object.freeze({ source: 'market-reference', timeZone: 'UTC', request: described.request.scope, observedAt, candles: decoded.candles }) };
      } catch {
        return { ok: false, reason: options?.signal?.aborted ? 'cancelled' : 'transport-failed' };
      }
    },
  };
}
