import type { DecimalString } from '../domain/trades';
import type { HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions } from './useHomeDashboardLiveCryptoBubblePresentationObservedRuntime';

export interface HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration {
  readonly excludedStablecoinBaseAssets: ReadonlySet<string>;
  readonly neutralMaxAbsoluteMovementPercent: DecimalString;
}

/**
 * Pure composition boundary for the still-caller-owned Home Live Crypto Bubble
 * product configuration. Existing Top-N and browser lifecycle defaults remain
 * owned by their released policies because this boundary deliberately omits
 * both Top-N count and browser lifecycle overrides.
 */
export function composeHomeDashboardLiveCryptoBubbleRuntimeBindingOptions(
  configuration: HomeDashboardLiveCryptoBubbleRuntimeProductConfiguration,
): HomeDashboardLiveCryptoBubbleReactRuntimeBindingOptions {
  return {
    universe: {
      excludedStablecoinBaseAssets: configuration.excludedStablecoinBaseAssets,
    },
    presentationPolicy: {
      neutralMaxAbsoluteMovementPercent: configuration.neutralMaxAbsoluteMovementPercent,
    },
  };
}
