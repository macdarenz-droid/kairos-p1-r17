import { describe, expect, it } from 'vitest';
import {
  HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_DEFAULT_EXCLUDED_STABLECOIN_BASE_ASSETS,
  HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_DEFAULT_NEUTRAL_MAX_ABSOLUTE_MOVEMENT_PERCENT,
  createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration,
} from '../src/app/homeDashboardLiveCryptoBubbleRuntimeProductPolicy';

describe('Home Live Crypto Bubble runtime product policy foundation', () => {
  it('owns the exact approved default stablecoin exclusions and neutral threshold', () => {
    expect(HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_DEFAULT_EXCLUDED_STABLECOIN_BASE_ASSETS).toEqual([
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
    ]);
    expect(HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_DEFAULT_NEUTRAL_MAX_ABSOLUTE_MOVEMENT_PERCENT).toBe(
      '0.25',
    );

    const configuration = createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration();

    expect([...configuration.excludedStablecoinBaseAssets]).toEqual(
      HOME_DASHBOARD_LIVE_CRYPTO_BUBBLE_DEFAULT_EXCLUDED_STABLECOIN_BASE_ASSETS,
    );
    expect(configuration.excludedStablecoinBaseAssets.has('USDT')).toBe(false);
    expect(configuration.excludedStablecoinBaseAssets.has('PAXG')).toBe(false);
    expect(configuration.neutralMaxAbsoluteMovementPercent).toBe('0.25');
    expect('topNCount' in configuration).toBe(false);
    expect('lifecycle' in configuration).toBe(false);
  });

  it('returns a fresh exclusion Set for each default configuration', () => {
    const first = createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration();
    const second = createHomeDashboardLiveCryptoBubbleDefaultRuntimeProductConfiguration();

    expect(first).not.toBe(second);
    expect(first.excludedStablecoinBaseAssets).not.toBe(second.excludedStablecoinBaseAssets);
    expect([...first.excludedStablecoinBaseAssets]).toEqual([...second.excludedStablecoinBaseAssets]);
  });
});
