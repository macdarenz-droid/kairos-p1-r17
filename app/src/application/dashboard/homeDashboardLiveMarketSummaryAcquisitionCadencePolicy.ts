export const HOME_DASHBOARD_LIVE_MARKET_SUMMARY_VISIBLE_ACQUISITION_INTERVAL_MS = 5_000 as const;

export type HomeDashboardLiveMarketSummaryAcquisitionCadenceTrigger =
  | 'entry'
  | 'resume'
  | 'periodic';

export type HomeDashboardLiveMarketSummaryVisibility = 'visible' | 'hidden';

export interface HomeDashboardLiveMarketSummaryAcquisitionCadenceDecision {
  readonly acquireNow: boolean;
  readonly nextVisibleAcquisitionAfterMs: number | null;
}

export function decideHomeDashboardLiveMarketSummaryAcquisitionCadence(
  visibility: HomeDashboardLiveMarketSummaryVisibility,
  trigger: HomeDashboardLiveMarketSummaryAcquisitionCadenceTrigger,
): HomeDashboardLiveMarketSummaryAcquisitionCadenceDecision {
  if (visibility === 'hidden') {
    return {
      acquireNow: false,
      nextVisibleAcquisitionAfterMs: null,
    };
  }

  switch (trigger) {
    case 'entry':
    case 'resume':
    case 'periodic':
      return {
        acquireNow: true,
        nextVisibleAcquisitionAfterMs:
          HOME_DASHBOARD_LIVE_MARKET_SUMMARY_VISIBLE_ACQUISITION_INTERVAL_MS,
      };
  }
}
