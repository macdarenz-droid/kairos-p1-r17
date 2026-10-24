import { describe, expect, it } from 'vitest';
import {
  HOME_DASHBOARD_LIVE_MARKET_SUMMARY_VISIBLE_ACQUISITION_INTERVAL_MS,
  decideHomeDashboardLiveMarketSummaryAcquisitionCadence,
} from '../src/application/dashboard/homeDashboardLiveMarketSummaryAcquisitionCadencePolicy';

describe('Home Dashboard live-market acquisition cadence policy', () => {
  it('owns the approved visible acquisition interval of exactly five seconds', () => {
    expect(HOME_DASHBOARD_LIVE_MARKET_SUMMARY_VISIBLE_ACQUISITION_INTERVAL_MS).toBe(5000);
  });

  it.each(['entry', 'resume', 'periodic'] as const)(
    'acquires immediately for visible %s and schedules the next visible acquisition after five seconds',
    (trigger) => {
      expect(decideHomeDashboardLiveMarketSummaryAcquisitionCadence('visible', trigger)).toEqual({
        acquireNow: true,
        nextVisibleAcquisitionAfterMs: 5000,
      });
    },
  );

  it.each(['entry', 'resume', 'periodic'] as const)(
    'suspends %s acquisition while hidden',
    (trigger) => {
      expect(decideHomeDashboardLiveMarketSummaryAcquisitionCadence('hidden', trigger)).toEqual({
        acquireNow: false,
        nextVisibleAcquisitionAfterMs: null,
      });
    },
  );
});
