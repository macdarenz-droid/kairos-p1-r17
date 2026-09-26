import type { DecimalString } from '../domain/trades';
import type { HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration } from './homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';

export const HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_DEFAULT_EXCLUDED_STABLECOIN_BASE_ASSETS = [
  'USDC',
  'FDUSD',
  'XUSD',
  'USDS',
  'U',
  'TUSD',
  'USDP',
  'DAI',
  'EURI',
  'AEUR',
] as const;

export const HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_DEFAULT_NEUTRAL_MAX_ABSOLUTE_MOVEMENT_PERCENT =
  '0.25' as DecimalString;

/**
 * Approved default product-policy values for the Home Live Crypto Bubble V1.
 * A fresh Set is returned for each configuration so consumers cannot mutate a
 * shared default collection. Top-N, lifecycle, provider, route, and renderer
 * policies remain owned by their existing released boundaries.
 */
export function createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration(): HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration {
  return {
    excludedStablecoinBaseAssets: new Set(
      HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_DEFAULT_EXCLUDED_STABLECOIN_BASE_ASSETS,
    ),
    neutralMaxAbsoluteMovementPercent:
      HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_DEFAULT_NEUTRAL_MAX_ABSOLUTE_MOVEMENT_PERCENT,
  };
}
