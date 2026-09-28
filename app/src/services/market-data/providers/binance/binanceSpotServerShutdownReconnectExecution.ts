import {
  executeMarketDataReconnectAttempt,
  type MarketDataReconnectExecution,
} from '../../marketDataReconnectExecution';
import type { MarketDataReconnectPolicy } from '../../marketDataReconnectPolicy';
import type { MarketDataReconnectScheduler } from '../../marketDataReconnectScheduler';
import { resolveBinanceSpotServerShutdownReconnectCause } from './binanceSpotServerShutdownReconnectCause';

export type BinanceSpotServerShutdownReconnectExecutionResult =
  | {
      readonly kind: 'server-shutdown';
      readonly eventTime: number;
      readonly execution: MarketDataReconnectExecution;
    }
  | { readonly kind: 'not-server-shutdown' }
  | {
      readonly kind: 'invalid-message';
      readonly reason: 'unsupported-message-data' | 'invalid-json';
    };

/**
 * P16.15 composes Binance serverShutdown evidence with the existing P15
 * reconnect execution owner. P15 remains authoritative for retry policy,
 * jitter-derived delay planning, scheduling, attempt limits, and cancellation.
 * This function creates no clocks, timers, sockets, persistence, or journal
 * writes of its own.
 */
export function executeBinanceSpotServerShutdownReconnect(
  data: unknown,
  scheduler: MarketDataReconnectScheduler,
  policy: MarketDataReconnectPolicy,
  completedAttempts: number,
  sample: number,
  reconnect: () => void,
  signal?: AbortSignal,
): BinanceSpotServerShutdownReconnectExecutionResult {
  const resolved = resolveBinanceSpotServerShutdownReconnectCause(data);

  if (resolved.kind !== 'server-shutdown') return resolved;

  return {
    kind: 'server-shutdown',
    eventTime: resolved.eventTime,
    execution: executeMarketDataReconnectAttempt(
      scheduler,
      resolved.cause,
      policy,
      completedAttempts,
      sample,
      reconnect,
      signal,
    ),
  };
}
