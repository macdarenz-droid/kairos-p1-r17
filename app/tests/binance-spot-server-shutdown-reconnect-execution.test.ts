import { describe, expect, it, vi } from 'vitest';
import type { MarketDataReconnectScheduler } from '../src/services/market-data';
import { executeBinanceSpotServerShutdownReconnect } from '../src/services/market-data';

function schedulerHarness() {
  const callbacks: Array<() => void> = [];
  const delays: number[] = [];
  const scheduler: MarketDataReconnectScheduler = {
    schedule: (callback, delayMs) => {
      callbacks.push(callback);
      delays.push(delayMs);
      return callbacks.length - 1;
    },
    cancel: vi.fn(),
  };
  return { scheduler, callbacks, delays };
}

describe('P16.15 Binance serverShutdown reconnect execution', () => {
  it('routes serverShutdown through the existing bounded P15 reconnect execution owner', () => {
    const { scheduler, callbacks, delays } = schedulerHarness();
    const reconnect = vi.fn();
    const result = executeBinanceSpotServerShutdownReconnect(
      JSON.stringify({ e: 'serverShutdown', E: 1770123456789 }),
      scheduler,
      { initialDelayMs: 1000, maxDelayMs: 8000, maxAttempts: 4 },
      1,
      0.5,
      reconnect,
    );

    expect(result.kind).toBe('server-shutdown');
    if (result.kind !== 'server-shutdown') return;
    expect(result.eventTime).toBe(1770123456789);
    expect(result.execution.kind).toBe('scheduled');
    expect(delays).toHaveLength(1);
    expect(reconnect).not.toHaveBeenCalled();
    callbacks[0]?.();
    expect(reconnect).toHaveBeenCalledTimes(1);
  });

  it('does not schedule non-serverShutdown messages', () => {
    const { scheduler, callbacks } = schedulerHarness();
    const result = executeBinanceSpotServerShutdownReconnect(
      JSON.stringify({ e: 'trade', E: 1, p: '100.0' }),
      scheduler,
      { initialDelayMs: 1000, maxDelayMs: 8000, maxAttempts: 4 },
      0,
      0.5,
      vi.fn(),
    );
    expect(result).toEqual({ kind: 'not-server-shutdown' });
    expect(callbacks).toHaveLength(0);
  });

  it('preserves P15 attempt-limit behavior instead of inventing provider retry policy', () => {
    const { scheduler, callbacks } = schedulerHarness();
    const result = executeBinanceSpotServerShutdownReconnect(
      JSON.stringify({ e: 'serverShutdown', E: 1770123456789 }),
      scheduler,
      { initialDelayMs: 1000, maxDelayMs: 8000, maxAttempts: 2 },
      2,
      0.5,
      vi.fn(),
    );
    expect(result.kind).toBe('server-shutdown');
    if (result.kind !== 'server-shutdown') return;
    expect(result.execution).toEqual({ kind: 'stop', reason: 'attempt-limit' });
    expect(callbacks).toHaveLength(0);
  });
});
