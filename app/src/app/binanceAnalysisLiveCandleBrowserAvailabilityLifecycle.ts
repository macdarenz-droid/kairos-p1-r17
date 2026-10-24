import type { BinanceAnalysisHistoryLiveCandleBootstrapResult } from './binanceAnalysisHistoryLiveCandleBootstrapCoordination';
import {
  type BinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator,
  type BinanceAnalysisLiveCandleGapBackfillRecoveryOptions,
} from './binanceAnalysisLiveCandleGapBackfillRecoveryCoordination';

export type BinanceAnalysisLiveCandleBrowserAvailability = 'available' | 'hidden' | 'offline';

export type BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult =
  | BinanceAnalysisHistoryLiveCandleBootstrapResult
  | { readonly ok: false; readonly reason: 'browser-unavailable'; readonly availability: Exclude<BinanceAnalysisLiveCandleBrowserAvailability, 'available'> };

export interface BinanceAnalysisLiveCandleBrowserVisibilitySource {
  readonly visibilityState: DocumentVisibilityState;
  readonly addEventListener: (type: 'visibilitychange', listener: () => void) => void;
  readonly removeEventListener: (type: 'visibilitychange', listener: () => void) => void;
}

export interface BinanceAnalysisLiveCandleBrowserNetworkSource {
  readonly navigator: { readonly onLine: boolean };
  readonly addEventListener: (type: 'online' | 'offline', listener: () => void) => void;
  readonly removeEventListener: (type: 'online' | 'offline', listener: () => void) => void;
}

export interface BinanceAnalysisLiveCandleBrowserAvailabilityObserver {
  readonly onAvailabilityChange?: (availability: BinanceAnalysisLiveCandleBrowserAvailability) => void;
  readonly onActivationResult?: (result: BinanceAnalysisHistoryLiveCandleBootstrapResult) => void;
}

export interface BinanceAnalysisLiveCandleBrowserAvailabilityLifecycle {
  replace(options: BinanceAnalysisLiveCandleGapBackfillRecoveryOptions): Promise<BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleResult>;
  close(): void;
  availability(): BinanceAnalysisLiveCandleBrowserAvailability;
  isActive(): boolean;
}

export interface BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleSources {
  readonly document?: BinanceAnalysisLiveCandleBrowserVisibilitySource;
  readonly window?: BinanceAnalysisLiveCandleBrowserNetworkSource;
  readonly observer?: BinanceAnalysisLiveCandleBrowserAvailabilityObserver;
}

function readAvailability(
  browserDocument: BinanceAnalysisLiveCandleBrowserVisibilitySource,
  browserWindow: BinanceAnalysisLiveCandleBrowserNetworkSource,
): BinanceAnalysisLiveCandleBrowserAvailability {
  if (browserDocument.visibilityState === 'hidden') return 'hidden';
  return browserWindow.navigator.onLine ? 'available' : 'offline';
}

/**
 * Owns only browser availability around Gate421. Hidden or offline state stops
 * history acquisition and the selected subscription. A later visible+online
 * transition reacquires authoritative history through Gate421 before live
 * updates resume. Selection, policy, rendering and visible copy stay callers.
 */
export function createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(
  recovery: BinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator,
  sources: BinanceAnalysisLiveCandleBrowserAvailabilityLifecycleSources = {},
): BinanceAnalysisLiveCandleBrowserAvailabilityLifecycle {
  const browserDocument = sources.document ?? document;
  const browserWindow = sources.window ?? window;
  let currentAvailability = readAvailability(browserDocument, browserWindow);
  let selected: BinanceAnalysisLiveCandleGapBackfillRecoveryOptions | null = null;
  let generation = 0;
  let active = false;
  let pending: Promise<BinanceAnalysisHistoryLiveCandleBootstrapResult> | null = null;
  let closed = false;

  const activate = (ticket: number, notify: boolean): Promise<BinanceAnalysisHistoryLiveCandleBootstrapResult> => {
    const options = selected!;
    const request = recovery.replace(options);
    pending = request;
    return request.then(result => {
      if (closed || ticket !== generation || pending !== request) return { ok: false, reason: 'superseded' };
      pending = null;
      active = result.ok && recovery.isLive();
      if (notify) sources.observer?.onActivationResult?.(result);
      return result;
    });
  };

  const suspend = () => {
    generation += 1;
    pending = null;
    active = false;
    recovery.stop();
  };

  const reconcile = () => {
    if (closed) return;
    const next = readAvailability(browserDocument, browserWindow);
    if (next === currentAvailability) return;
    currentAvailability = next;
    sources.observer?.onAvailabilityChange?.(next);
    if (next !== 'available') {
      suspend();
      return;
    }
    if (selected === null) return;
    const ticket = ++generation;
    void activate(ticket, true);
  };

  browserDocument.addEventListener('visibilitychange', reconcile);
  browserWindow.addEventListener('online', reconcile);
  browserWindow.addEventListener('offline', reconcile);

  return {
    replace(options) {
      selected = options;
      generation += 1;
      pending = null;
      active = false;
      currentAvailability = readAvailability(browserDocument, browserWindow);
      if (currentAvailability !== 'available') {
        recovery.stop();
        return Promise.resolve({ ok: false, reason: 'browser-unavailable', availability: currentAvailability });
      }
      return activate(generation, false);
    },
    close() {
      if (closed) return;
      closed = true;
      selected = null;
      suspend();
      browserDocument.removeEventListener('visibilitychange', reconcile);
      browserWindow.removeEventListener('online', reconcile);
      browserWindow.removeEventListener('offline', reconcile);
    },
    availability() {
      return currentAvailability;
    },
    isActive() {
      return active && recovery.isLive();
    },
  };
}
