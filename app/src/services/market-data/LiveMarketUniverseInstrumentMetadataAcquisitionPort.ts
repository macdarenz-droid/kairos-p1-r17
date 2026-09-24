import type { LiveMarketUniverseInstrumentMetadataFact } from './liveMarketUniverseInstrumentMetadataFact';

/** Provider-neutral acquisition result for authoritative instrument metadata facts. */
export type LiveMarketUniverseInstrumentMetadataAcquisitionResult =
  | {
      readonly ok: true;
      readonly facts: readonly LiveMarketUniverseInstrumentMetadataFact[];
    }
  | {
      readonly ok: false;
      readonly reason: 'acquisition-failed';
    };

/**
 * Provider-neutral port for acquiring authoritative instrument metadata facts.
 * Provider implementation and caller-owned universe policy remain separate owners.
 */
export interface LiveMarketUniverseInstrumentMetadataAcquisitionPort {
  acquireInstrumentMetadata(
    options?: { readonly signal?: AbortSignal },
  ): Promise<LiveMarketUniverseInstrumentMetadataAcquisitionResult>;
}
