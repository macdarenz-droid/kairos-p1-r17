import { describe, expect, it, vi } from 'vitest';
import {
  createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle,
  type BinanceAnalysisLiveCandleBrowserNetworkSource,
  type BinanceAnalysisLiveCandleBrowserVisibilitySource,
} from '../src/app/binanceAnalysisLiveCandleBrowserAvailabilityLifecycle';
import type { BinanceAnalysisHistoryLiveCandleBootstrapResult } from '../src/app/binanceAnalysisHistoryLiveCandleBootstrapCoordination';
import type {
  BinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator,
  BinanceAnalysisLiveCandleGapBackfillRecoveryOptions,
} from '../src/app/binanceAnalysisLiveCandleGapBackfillRecoveryCoordination';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
const instrument = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
const candle = { openTime: '2026-09-13T06:00:00.000Z', closeTime: '2026-09-13T06:00:59.999Z', open: d('100'), high: d('101'), low: d('99'), close: d('100.5') };
const snapshot = { source: 'market-reference' as const, timeZone: 'UTC' as const, request: { instrument, interval: '1m', limit: 500 }, observedAt: '2026-09-13T06:01:00.000Z', candles: [candle] };
const ok: BinanceAnalysisHistoryLiveCandleBootstrapResult = { ok: true, snapshot };

function options(symbol = 'BTCUSDT'): BinanceAnalysisLiveCandleGapBackfillRecoveryOptions {
  return {
    instrument: { venue: 'binance-spot', symbol },
    interval: '1m',
    historyLimit: 500,
    reconnectPolicy: { initialDelayMs: 250, maxDelayMs: 4000, maxAttempts: 5 },
    renderHistory: vi.fn(() => ({ render: vi.fn(), updateLatestCandle: vi.fn(), destroy: vi.fn() })),
  };
}

function browser(initial: { hidden?: boolean; online?: boolean } = {}) {
  const listeners = new Map<string, Set<() => void>>();
  const on = (type: string, listener: () => void) => {
    const set = listeners.get(type) ?? new Set(); set.add(listener); listeners.set(type, set);
  };
  const off = (type: string, listener: () => void) => listeners.get(type)?.delete(listener);
  const document = {
    visibilityState: initial.hidden ? 'hidden' : 'visible',
    addEventListener: vi.fn(on), removeEventListener: vi.fn(off),
  } as unknown as BinanceAnalysisLiveCandleBrowserVisibilitySource;
  const window = {
    navigator: { onLine: initial.online ?? true },
    addEventListener: vi.fn(on), removeEventListener: vi.fn(off),
  } as unknown as BinanceAnalysisLiveCandleBrowserNetworkSource;
  return {
    document,
    window,
    setHidden(hidden: boolean) { (document as { visibilityState: DocumentVisibilityState }).visibilityState = hidden ? 'hidden' : 'visible'; listeners.get('visibilitychange')?.forEach(listener => listener()); },
    setOnline(online: boolean) { (window.navigator as { onLine: boolean }).onLine = online; listeners.get(online ? 'online' : 'offline')?.forEach(listener => listener()); },
  };
}

function controlled() {
  const calls: BinanceAnalysisLiveCandleGapBackfillRecoveryOptions[] = [];
  const recovery: BinanceAnalysisLiveCandleGapBackfillRecoveryCoordinator = {
    replace: vi.fn(async received => { calls.push(received); return ok; }),
    stop: vi.fn(), isPending: vi.fn(() => false), isLive: vi.fn(() => true), isRecovering: vi.fn(() => false),
  };
  return { recovery, calls };
}

describe('Analysis live candle browser availability lifecycle', () => {
  it('starts an exact selected scope only while visible and online', async () => {
    const lower = controlled(), source = browser();
    const lifecycle = createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(lower.recovery, source);
    await expect(lifecycle.replace(options())).resolves.toEqual(ok);
    expect(lower.calls).toHaveLength(1);
    expect(lower.calls[0].instrument).toEqual(instrument);
    expect(lifecycle.availability()).toBe('available');
    expect(lifecycle.isActive()).toBe(true);
  });

  it.each([{ hidden: true, availability: 'hidden' }, { online: false, availability: 'offline' }] as const)(
    'retains selection but does not acquire when initially $availability', async initial => {
      const lower = controlled(), source = browser(initial);
      const lifecycle = createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(lower.recovery, source);
      await expect(lifecycle.replace(options())).resolves.toEqual({ ok: false, reason: 'browser-unavailable', availability: initial.availability });
      expect(lower.calls).toHaveLength(0);
      expect(lifecycle.isActive()).toBe(false);
    },
  );

  it('stops when hidden and reacquires authoritative history once on visible resume', async () => {
    const lower = controlled(), source = browser(), onAvailabilityChange = vi.fn(), onActivationResult = vi.fn();
    const lifecycle = createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(lower.recovery, { ...source, observer: { onAvailabilityChange, onActivationResult } });
    await lifecycle.replace(options());
    source.setHidden(true);
    source.setHidden(true);
    expect(lower.recovery.stop).toHaveBeenCalledTimes(1);
    expect(lifecycle.isActive()).toBe(false);
    source.setHidden(false);
    await vi.waitFor(() => expect(lower.calls).toHaveLength(2));
    expect(onAvailabilityChange.mock.calls.map(call => call[0])).toEqual(['hidden', 'available']);
    expect(onActivationResult).toHaveBeenCalledWith(ok);
  });

  it('stays stopped when online resumes under a hidden document', async () => {
    const lower = controlled(), source = browser();
    const lifecycle = createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(lower.recovery, source);
    await lifecycle.replace(options());
    source.setHidden(true);
    source.setOnline(false);
    source.setOnline(true);
    expect(lower.calls).toHaveLength(1);
    source.setHidden(false);
    await vi.waitFor(() => expect(lower.calls).toHaveLength(2));
  });

  it('uses only the latest selection after an unavailable replacement', async () => {
    const lower = controlled(), source = browser();
    const lifecycle = createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(lower.recovery, source);
    await lifecycle.replace(options());
    source.setOnline(false);
    await lifecycle.replace(options('ETHUSDT'));
    source.setOnline(true);
    await vi.waitFor(() => expect(lower.calls).toHaveLength(2));
    expect(lower.calls[1].instrument.symbol).toBe('ETHUSDT');
  });

  it('suppresses a late activation after suspension', async () => {
    let resolve!: (result: BinanceAnalysisHistoryLiveCandleBootstrapResult) => void;
    const lower = controlled(), source = browser(), onActivationResult = vi.fn();
    vi.mocked(lower.recovery.replace).mockImplementationOnce(received => { lower.calls.push(received); return new Promise(done => { resolve = done; }); });
    const lifecycle = createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(lower.recovery, { ...source, observer: { onActivationResult } });
    const pending = lifecycle.replace(options());
    source.setOnline(false);
    resolve(ok);
    await expect(pending).resolves.toEqual({ ok: false, reason: 'superseded' });
    expect(onActivationResult).not.toHaveBeenCalled();
    expect(lifecycle.isActive()).toBe(false);
  });

  it('removes all listeners, stops once and never resumes after close', async () => {
    const lower = controlled(), source = browser();
    const lifecycle = createBinanceAnalysisLiveCandleBrowserAvailabilityLifecycle(lower.recovery, source);
    await lifecycle.replace(options());
    lifecycle.close(); lifecycle.close();
    expect(source.document.removeEventListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(source.window.removeEventListener).toHaveBeenCalledWith('online', expect.any(Function));
    expect(source.window.removeEventListener).toHaveBeenCalledWith('offline', expect.any(Function));
    const before = lower.calls.length;
    source.setOnline(false); source.setOnline(true);
    expect(lower.calls).toHaveLength(before);
  });
});
