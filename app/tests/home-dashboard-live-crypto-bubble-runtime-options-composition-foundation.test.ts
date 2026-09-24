import { describe, expect, it } from 'vitest';
import type { DecimalString } from '../src/domain/trades';
import { composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions } from '../src/app/homeDashboardLiveCryptoBubbleRuntimeOptionsComposition';

describe('Home Live Crypto Bubble runtime-options composition foundation', () => {
  it('preserves exact caller-owned product configuration without stealing released defaults', () => {
    const excludedStablecoinBaseAssets = new Set(['FIXTURE_STABLE_A', 'FIXTURE_STABLE_B']);
    const neutralMaxAbsoluteMovementPercent = '0.125' as DecimalString;

    const options = composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions({
      excludedStablecoinBaseAssets,
      neutralMaxAbsoluteMovementPercent,
    });

    expect(options.universe.excludedStablecoinBaseAssets).toBe(excludedStablecoinBaseAssets);
    expect('topNCount' in options.universe).toBe(false);
    expect('lifecycle' in options).toBe(false);
    expect(options.presentationPolicy.neutralMaxAbsoluteMovementPercent).toBe(
      neutralMaxAbsoluteMovementPercent,
    );
  });
});
