import type {
  MarketDataInstrument,
  MarketDataSubscription,
  MarketDataSubscriptionHandlers,
} from '../../marketDataTypes';
import type { MarketDataReconnectPolicy } from '../../marketDataReconnectPolicy';
import type { MarketDataReconnectScheduler } from '../../marketDataReconnectScheduler';
import { connectBinanceSpotBrowserStream } from './binanceSpotBrowserStreamConnector';
import { withBinanceSpotPublicStreamLifecycle } from './binanceSpotPublicStreamLifecycleConnector';
import {
  subscribeBinanceSpotPublicTradeStream,
  type BinanceSpotReceiptTimestampProvider,
} from './binanceSpotPublicTradeSubscription';
import { executeBinanceSpotServerShutdownReconnect } from './binanceSpotServerShutdownReconnectExecution';

export type BinanceSpotReconnectSampleProvider = () => number;

export type BinanceSpotBrowserPublicTradeReconnectSubscriptionResult =
  | { readonly ok: true; readonly subscription: MarketDataSubscription }
  | { readonly ok: false; readonly reason: 'venue-mismatch' | 'symbol-required' };

/**
 * P16.17 composes the browser-ready public trade subscription with the existing
 * P16.15 serverShutdown -> P15 reconnect execution path.
 *
 * Retry policy, delay planning and scheduling remain P15-owned. Entropy and
 * receipt time remain injected. This owner only tracks the active transport,
 * completed reconnect attempts, and any one pending P15 schedule so close()
 * can cancel pending work and close the active socket idempotently.
 */
export function subscribeBinanceSpotBrowserPublicTradeStreamWithReconnect(
  instrument: MarketDataInstrument,
  handlers: MarketDataSubscriptionHandlers,
  receiptTimestamp: BinanceSpotReceiptTimestampProvider,
  scheduler: MarketDataReconnectScheduler,
  policy: MarketDataReconnectPolicy,
  reconnectSample: BinanceSpotReconnectSampleProvider,
): BinanceSpotBrowserPublicTradeReconnectSubscriptionResult {
  let closed = false;
  let active: MarketDataSubscription | null = null;
  let pendingCancel: (() => void) | null = null;
  let completedAttempts = 0;

  const connect = (): BinanceSpotBrowserPublicTradeReconnectSubscriptionResult => {
    if (closed) {
      return { ok: false, reason: 'symbol-required' };
    }

    const lifecycleConnect = withBinanceSpotPublicStreamLifecycle({
      connect: (url, streamHandlers) =>
        connectBinanceSpotBrowserStream(url, {
          ...streamHandlers,
          onMessage: (data) => {
            const reconnect = executeBinanceSpotServerShutdownReconnect(
              data,
              scheduler,
              policy,
              completedAttempts,
              reconnectSample(),
              () => {
                if (closed) return;
                pendingCancel = null;
                completedAttempts += 1;
                active?.close();
                active = null;
                const next = connect();
                if (next.ok) active = next.subscription;
              },
            );

            if (reconnect.kind === 'server-shutdown') {
              if (reconnect.execution.kind === 'scheduled') {
                pendingCancel?.();
                pendingCancel = reconnect.execution.schedule.cancel;
              }
              return;
            }

            streamHandlers.onMessage(data);
          },
        }),
      handlers,
    });

    return subscribeBinanceSpotPublicTradeStream(
      instrument,
      handlers,
      lifecycleConnect,
      receiptTimestamp,
    );
  };

  const initial = connect();
  if (!initial.ok) return initial;
  active = initial.subscription;

  return {
    ok: true,
    subscription: {
      close: () => {
        if (closed) return;
        closed = true;
        pendingCancel?.();
        pendingCancel = null;
        active?.close();
        active = null;
      },
    },
  };
}
