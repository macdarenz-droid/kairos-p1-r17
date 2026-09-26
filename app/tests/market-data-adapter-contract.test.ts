import { describe, expect, it } from 'vitest';
import type {
  MarketDataAdapter,
  MarketDataInstrument,
  MarketDataSubscriptionHandlers,
} from '../src/services/market-data';

class ContractProbeAdapter implements MarketDataAdapter {
  public subscribed: MarketDataInstrument | null = null;
  public handlers: MarketDataSubscriptionHandlers | null = null;
  public signal: AbortSignal | undefined;
  public closed = false;

  subscribe(
    instrument: MarketDataInstrument,
    handlers: MarketDataSubscriptionHandlers,
    options?: { readonly signal?: AbortSignal },
  ) {
    this.subscribed = instrument;
    this.handlers = handlers;
    this.signal = options?.signal;
    return { close: () => { this.closed = true; } };
  }
}

describe('P15.1 Market Data Adapter interface contract', () => {
  it('keeps provider transport behind a replaceable subscription boundary', () => {
    const adapter = new ContractProbeAdapter();
    const instrument = { venue: 'example', symbol: 'BTCUSD' };
    const handlers = { onPrice: () => undefined };
    const subscription = adapter.subscribe(instrument, handlers);

    expect(adapter.subscribed).toEqual(instrument);
    expect(adapter.handlers).toBe(handlers);
    expect(adapter.closed).toBe(false);
    subscription.close();
    expect(adapter.closed).toBe(true);
  });

  it('accepts AbortSignal without requiring a provider implementation', () => {
    const adapter = new ContractProbeAdapter();
    const controller = new AbortController();
    adapter.subscribe(
      { venue: 'example', symbol: 'ETHUSD' },
      { onPrice: () => undefined },
      { signal: controller.signal },
    );
    expect(adapter.signal).toBe(controller.signal);
  });
});
