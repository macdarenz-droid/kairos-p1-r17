import {
  decideHomeDashboardLiveMarketSummaryAcquisitionCadence,
  type HomeDashboardLiveMarketSummaryVisibility,
} from './homeDashboardLiveMarketSummaryAcquisitionCadencePolicy';
import type {
  HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort,
  HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult,
} from './homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort';
import type { MarketDataInstrument } from '../../services/market-data/marketDataTypes';

export interface HomeDashboardLiveMarketSummaryAcquisitionLifecycleSchedulerClock {
  readonly schedule: (callback: () => void, delayMs: number) => unknown;
  readonly cancel: (handle: unknown) => void;
}

export interface HomeDashboardLiveMarketSummaryAcquisitionLifecycleObserver {
  readonly onResult?: (
    result: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult,
  ) => void;
  readonly onError?: (error: unknown) => void;
}

export interface HomeDashboardLiveMarketSummaryAcquisitionLifecycle {
  readonly enter: () => void;
  readonly setVisibility: (
    visibility: HomeDashboardLiveMarketSummaryVisibility,
  ) => void;
  readonly close: () => void;
}

export function createHomeDashboardLiveMarketSummaryAcquisitionLifecycle(
  port: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort,
  scope: readonly MarketDataInstrument[],
  scheduler: HomeDashboardLiveMarketSummaryAcquisitionLifecycleSchedulerClock,
  observer: HomeDashboardLiveMarketSummaryAcquisitionLifecycleObserver = {},
  initialVisibility: HomeDashboardLiveMarketSummaryVisibility = 'visible',
): HomeDashboardLiveMarketSummaryAcquisitionLifecycle {
  let closed = false;
  let entered = false;
  let visibility = initialVisibility;
  let pendingSchedule: unknown | null = null;
  let activeAcquisitionController: AbortController | null = null;

  const cancelPendingSchedule = () => {
    if (pendingSchedule === null) return;
    const handle = pendingSchedule;
    pendingSchedule = null;
    scheduler.cancel(handle);
  };

  const abortActiveAcquisition = () => {
    if (activeAcquisitionController === null) return;
    const controller = activeAcquisitionController;
    activeAcquisitionController = null;
    controller.abort();
  };

  const runVisibleTrigger = (
    trigger: 'entry' | 'resume' | 'periodic',
  ) => {
    if (closed || !entered) return;

    cancelPendingSchedule();
    const decision = decideHomeDashboardLiveMarketSummaryAcquisitionCadence(
      visibility,
      trigger,
    );

    if (!decision.acquireNow) {
      abortActiveAcquisition();
      return;
    }

    if (decision.nextVisibleAcquisitionAfterMs !== null) {
      let handle: unknown;
      handle = scheduler.schedule(() => {
        if (closed || pendingSchedule !== handle) return;
        pendingSchedule = null;
        runVisibleTrigger('periodic');
      }, decision.nextVisibleAcquisitionAfterMs);
      pendingSchedule = handle;
    }

    // The released state session does not serialize concurrent transitions.
    // Preserve fixed acquisition starts without stale overlapping transitions.
    abortActiveAcquisition();
    const controller = new AbortController();
    activeAcquisitionController = controller;

    let acquisition: Promise<HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult>;
    try {
      acquisition = port.acquire(scope, { signal: controller.signal });
    } catch (error) {
      if (activeAcquisitionController === controller) {
        activeAcquisitionController = null;
      }
      if (!controller.signal.aborted && !closed) {
        observer.onError?.(error);
      }
      return;
    }

    void acquisition.then(
      (result) => {
        if (activeAcquisitionController === controller) {
          activeAcquisitionController = null;
        }
        if (!controller.signal.aborted && !closed) {
          observer.onResult?.(result);
        }
      },
      (error: unknown) => {
        if (activeAcquisitionController === controller) {
          activeAcquisitionController = null;
        }
        if (!controller.signal.aborted && !closed) {
          observer.onError?.(error);
        }
      },
    );
  };

  return {
    enter() {
      if (closed || entered) return;
      entered = true;
      runVisibleTrigger('entry');
    },
    setVisibility(nextVisibility) {
      if (closed || nextVisibility === visibility) return;
      visibility = nextVisibility;
      if (!entered) return;

      if (visibility === 'hidden') {
        cancelPendingSchedule();
        abortActiveAcquisition();
        return;
      }

      runVisibleTrigger('resume');
    },
    close() {
      if (closed) return;
      closed = true;
      cancelPendingSchedule();
      abortActiveAcquisition();
    },
  };
}
