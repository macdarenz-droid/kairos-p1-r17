import { describe, expect, expectTypeOf, it } from 'vitest';
import type {
  LiveMarketUniverseInstrumentMetadataAcquisitionPort,
  LiveMarketUniverseInstrumentMetadataAcquisitionResult,
  LiveMarketUniverseInstrumentMetadataFact,
} from '../src/services/market-data';

describe('Live Market Universe Instrument Metadata Acquisition Port Contract Foundation', () => {
  it('defines an async provider-neutral acquisition port with explicit failure', async () => {
    const port: LiveMarketUniverseInstrumentMetadataAcquisitionPort = {
      async acquireInstrumentMetadata() {
        return { ok: false, reason: 'acquisition-failed' };
      },
    };
    await expect(port.acquireInstrumentMetadata()).resolves.toEqual({ ok: false, reason: 'acquisition-failed' });
  });

  it('carries only released authoritative metadata facts on success', async () => {
    const fact = {
      instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' },
      baseAsset: 'BTC',
      quoteAsset: 'USDT',
      tradingEnabled: true,
    } as LiveMarketUniverseInstrumentMetadataFact;
    const port: LiveMarketUniverseInstrumentMetadataAcquisitionPort = {
      async acquireInstrumentMetadata() {
        return { ok: true, facts: [fact] };
      },
    };
    await expect(port.acquireInstrumentMetadata()).resolves.toEqual({ ok: true, facts: [fact] });
  });

  it('supports caller-owned cancellation without provider or policy semantics', () => {
    expectTypeOf<Parameters<LiveMarketUniverseInstrumentMetadataAcquisitionPort['acquireInstrumentMetadata']>[0]>()
      .toEqualTypeOf<{ readonly signal?: AbortSignal } | undefined>();
  });

  it('keeps result shape limited to success facts or acquisition failure', () => {
    expectTypeOf<LiveMarketUniverseInstrumentMetadataAcquisitionResult>().toMatchTypeOf<
      | { readonly ok: true; readonly facts: readonly LiveMarketUniverseInstrumentMetadataFact[] }
      | { readonly ok: false; readonly reason: 'acquisition-failed' }
    >();
  });
});
