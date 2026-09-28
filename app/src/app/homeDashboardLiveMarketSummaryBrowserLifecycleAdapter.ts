import {
  createHomeDashboardLiveMarketSummaryAcquisitionLifecycle,
  type HomeDashboardLiveMarketSummaryAcquisitionLifecycleObserver,
  type HomeDashboardLiveMarketSummaryAcquisitionLifecycleSchedulerClock,
} from '../application/dashboard/homeDashboardLiveMarketSummaryAcquisitionLifecycleScheduler';
import type { HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort } from '../application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';

export interface HomeDashboardLiveMarketSummaryBrowserVisibilityDocument {
  readonly visibilityState: DocumentVisibilityState;
  readonly addEventListener: (
    type: 'visibilitychange',
    listener: () => void,
  ) => void;
  readonly removeEventListener: (
    type: 'visibilitychange',
    listener: () => void,
  ) => void;
}

export interface HomeDashboardLiveMarketSummaryBrowserTimer {
  readonly schedule: (callback: () => void, delayMs: number) => unknown;
  readonly cancel: (handle: unknown) => void;
}

export interface HomeDashboardLiveMarketSummaryBrowserLifecycleAdapter {
  readonly close: () => void;
}

export interface HomeDashboardLiveMarketSummaryBrowserLifecycleAdapterOptions {
  readonly document?: HomeDashboardLiveMarketSummaryBrowserVisibilityDocument;
  readonly timer?: HomeDashboardLiveMarketSummaryBrowserTimer;
  readonly observer?: HomeDashboardLiveMarketSummaryAcquisitionLifecycleObserver;
}

const browserTimer: HomeDashboardLiveMarketSummaryBrowserTimer = {
  schedule(callback, delayMs) {
    return globalThis.setTimeout(callback, delayMs);
  },
  cancel(handle) {
    globalThis.clearTimeout(handle as ReturnType<typeof globalThis.setTimeout>);
  },
};

function readVisibility(
  browserDocument: HomeDashboardLiveMarketSummaryBrowserVisibilityDocument,
): 'visible' | 'hidden' {
  return browserDocument.visibilityState === 'hidden' ? 'hidden' : 'visible';
}

export function createHomeDashboardLiveMarketSummaryBrowserLifecycleAdapter(
  port: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort,
  scope: readonly MarketDataInstrument[],
  options: HomeDashboardLiveMarketSummaryBrowserLifecycleAdapterOptions = {},
): HomeDashboardLiveMarketSummaryBrowserLifecycleAdapter {
  const browserDocument = options.document ?? document;
  const timer = options.timer ?? browserTimer;
  const scheduler: HomeDashboardLiveMarketSummaryAcquisitionLifecycleSchedulerClock = {
    schedule: timer.schedule,
    cancel: timer.cancel,
  };
  const lifecycle = createHomeDashboardLiveMarketSummaryAcquisitionLifecycle(
    port,
    scope,
    scheduler,
    options.observer,
    readVisibility(browserDocument),
  );

  let closed = false;
  const onVisibilityChange = () => {
    lifecycle.setVisibility(readVisibility(browserDocument));
  };

  browserDocument.addEventListener('visibilitychange', onVisibilityChange);
  lifecycle.enter();

  return {
    close() {
      if (closed) return;
      closed = true;
      browserDocument.removeEventListener('visibilitychange', onVisibilityChange);
      lifecycle.close();
    },
  };
}
