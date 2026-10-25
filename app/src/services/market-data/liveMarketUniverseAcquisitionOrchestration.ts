import type {
  LiveMarketUniverseInstrumentMetadataAcquisitionPort,
} from './LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { LiveMarketSummaryBaselineAcquisitionPort } from './LiveMarketSummaryBaselineAcquisitionPort';
import type { MarketDataInstrument, MarketDataUnavailable } from './marketDataTypes';
import {
  composeLiveMarketUniverse,
  type LiveMarketUniverseCompositionOptions,
} from './liveMarketUniverseComposition';
import { isLiveMarketUniverseInstrumentEligible } from './liveMarketUniverseInstrumentEligibilityPolicy';

export interface LiveMarketUniverseAcquisitionOptions extends LiveMarketUniverseCompositionOptions {
  readonly signal?: AbortSignal;
}

export type LiveMarketUniverseAcquisitionResult =
  | { readonly ok: true; readonly instruments: readonly MarketDataInstrument[] }
  | { readonly ok: false; readonly reason: 'acquisition-failed'; readonly unavailable?: MarketDataUnavailable };

/**
 * Provider-neutral one-shot acquisition orchestration for the Live Market Universe.
 * Acquisition ports own data acquisition; released policies own eligibility and
 * final ranking/selection. This owner only sequences those released boundaries.
 */
export async function acquireLiveMarketUniverseOnce(
  metadataAcquisitionPort: LiveMarketUniverseInstrumentMetadataAcquisitionPort,
  baselineAcquisitionPort: LiveMarketSummaryBaselineAcquisitionPort,
  options: LiveMarketUniverseAcquisitionOptions,
): Promise<LiveMarketUniverseAcquisitionResult> {
  const acquisitionOptions = options.signal === undefined ? undefined : { signal: options.signal };
  const metadataResult = acquisitionOptions === undefined
    ? await metadataAcquisitionPort.acquireInstrumentMetadata()
    : await metadataAcquisitionPort.acquireInstrumentMetadata(acquisitionOptions);

  if (!metadataResult.ok) return acquisitionFailed(metadataResult);

  const eligibleScope = metadataResult.facts
    .filter((fact) => isLiveMarketUniverseInstrumentEligible(fact, options))
    .map((fact) => fact.instrument);

  if (eligibleScope.length === 0) return { ok: true, instruments: [] };

  const baselineResult = acquisitionOptions === undefined
    ? await baselineAcquisitionPort.acquireBaseline(eligibleScope)
    : await baselineAcquisitionPort.acquireBaseline(eligibleScope, acquisitionOptions);

  if (!baselineResult.ok) return acquisitionFailed(baselineResult);

  return {
    ok: true,
    instruments: composeLiveMarketUniverse(
      metadataResult.facts,
      baselineResult.delivery.facts,
      options,
    ),
  };
}

/** The failure, carrying the port's typed reason when it gave one. */
function acquisitionFailed(
  failure: { readonly ok: false; readonly reason: 'acquisition-failed' } | MarketDataUnavailable,
): LiveMarketUniverseAcquisitionResult {
  return failure.reason === 'unavailable'
    ? { ok: false, reason: 'acquisition-failed', unavailable: failure }
    : { ok: false, reason: 'acquisition-failed' };
}
