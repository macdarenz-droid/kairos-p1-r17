import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  binanceAnalysisLiveCandleBrowserRuntimeSources,
  createBinanceAnalysisLiveCandleBrowserRuntimeSources,
} from '../src/app/binanceAnalysisLiveCandleBrowserRuntimeSources';

afterEach(() => vi.restoreAllMocks());

describe('Analysis live candle browser runtime sources', () => {
  it('reads receipt time and reconnect entropy independently on demand', () => {
    const readCurrentTimeMs = vi.fn()
      .mockReturnValueOnce(1_789_264_800_000)
      .mockReturnValueOnce(1_789_264_801_000);
    const readReconnectSample = vi.fn()
      .mockReturnValueOnce(0.25)
      .mockReturnValueOnce(0.75);
    const sources = createBinanceAnalysisLiveCandleBrowserRuntimeSources({
      readCurrentTimeMs,
      readReconnectSample,
      scheduleTimeout: vi.fn(),
      cancelTimeout: vi.fn(),
    });

    expect(sources.receiptTimestamp()).toBe(new Date(1_789_264_800_000).toISOString());
    expect(sources.reconnectSample()).toBe(0.25);
    expect(sources.receiptTimestamp()).toBe(new Date(1_789_264_801_000).toISOString());
    expect(sources.reconnectSample()).toBe(0.75);
    expect(readCurrentTimeMs).toHaveBeenCalledTimes(2);
    expect(readReconnectSample).toHaveBeenCalledTimes(2);
  });

  it('forwards timer schedule and cancellation without owning retry policy', () => {
    const handle = { id: 7 };
    const scheduleTimeout = vi.fn(() => handle);
    const cancelTimeout = vi.fn();
    const callback = vi.fn();
    const sources = createBinanceAnalysisLiveCandleBrowserRuntimeSources({
      readCurrentTimeMs: vi.fn(),
      readReconnectSample: vi.fn(),
      scheduleTimeout,
      cancelTimeout,
    });

    expect(sources.scheduler.schedule(callback, 640)).toBe(handle);
    expect(scheduleTimeout).toHaveBeenCalledWith(callback, 640);
    sources.scheduler.cancel(handle);
    expect(cancelTimeout).toHaveBeenCalledWith(handle);
  });

  it('binds production browser Date timer and Math sources lazily', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_789_264_802_000);
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.4);
    const handle = 19;
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockReturnValue(handle);
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout').mockImplementation(() => undefined);
    const callback = vi.fn();

    expect(binanceAnalysisLiveCandleBrowserRuntimeSources.receiptTimestamp())
      .toBe(new Date(1_789_264_802_000).toISOString());
    expect(binanceAnalysisLiveCandleBrowserRuntimeSources.reconnectSample()).toBe(0.4);
    expect(binanceAnalysisLiveCandleBrowserRuntimeSources.scheduler.schedule(callback, 320)).toBe(handle);
    binanceAnalysisLiveCandleBrowserRuntimeSources.scheduler.cancel(handle);
    expect(now).toHaveBeenCalledTimes(1);
    expect(random).toHaveBeenCalledTimes(1);
    expect(setTimeoutSpy).toHaveBeenCalledWith(callback, 320);
    expect(clearTimeoutSpy).toHaveBeenCalledWith(handle);
  });
});
