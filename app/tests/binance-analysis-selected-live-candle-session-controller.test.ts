import { describe, expect, it, vi } from 'vitest';
import {
  createBinanceAnalysisSelectedLiveCandleSessionController,
  type BinanceAnalysisSelectedLiveCandleSessionStarter,
  type BinanceAnalysisSelectedLiveCandleSessionOptions,
} from '../src/app/binanceAnalysisSelectedLiveCandleSessionController';
import type { DecimalString } from '../src/domain/trades';
import type { MarketDataSubscription } from '../src/services/market-data/marketDataTypes';

const d = (value: string) => value as DecimalString;

function options(symbol: string, callbacks: Partial<BinanceAnalysisSelectedLiveCandleSessionOptions> = {}): BinanceAnalysisSelectedLiveCandleSessionOptions {
  return {
    instrument: { venue: 'binance-spot', symbol },
    interval: '1m',
    initialCandle: {
      openTime: '2026-09-13T02:00:00.000Z', closeTime: '2026-09-13T02:00:59.999Z',
      open: d('100'), high: d('101'), low: d('99'), close: d('100.5'),
    },
    renderer: { render: vi.fn(), updateLatestCandle: vi.fn(), destroy: vi.fn() },
    reconnectPolicy: { initialDelayMs: 250, maxDelayMs: 4000, maxAttempts: 5 },
    onBackfillRequired: vi.fn(),
    ...callbacks,
  };
}

function lifecycle(): MarketDataSubscription {
  return { close: vi.fn() };
}

describe('Analysis selected live candle session controller', () => {
  it('closes the previous selected session before starting its replacement', () => {
    const first = lifecycle();
    const second = lifecycle();
    const order: string[] = [];
    const firstClose = vi.mocked(first.close).mockImplementation(() => { order.push('close-first'); });
    const start = vi.fn<BinanceAnalysisSelectedLiveCandleSessionStarter>()
      .mockImplementationOnce(received => {
        order.push(`start-${received.instrument.symbol}`);
        return { ok: true, subscription: first };
      })
      .mockImplementationOnce(received => {
        order.push(`start-${received.instrument.symbol}`);
        return { ok: true, subscription: second };
      });
    const controller = createBinanceAnalysisSelectedLiveCandleSessionController(start);

    controller.replace(options('BTCUSDT'));
    controller.replace(options('ETHUSDT'));

    expect(order).toEqual(['start-BTCUSDT', 'close-first', 'start-ETHUSDT']);
    expect(firstClose).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(true);
  });

  it('suppresses late callbacks from a replaced selection while forwarding current callbacks', () => {
    const captured: Array<Parameters<BinanceAnalysisSelectedLiveCandleSessionStarter>[0]> = [];
    const start = vi.fn<BinanceAnalysisSelectedLiveCandleSessionStarter>(received => {
      captured.push(received);
      return { ok: true, subscription: lifecycle() };
    });
    const oldState = vi.fn();
    const oldError = vi.fn();
    const currentState = vi.fn();
    const currentError = vi.fn();
    const controller = createBinanceAnalysisSelectedLiveCandleSessionController(start);

    controller.replace(options('BTCUSDT', { onStateChange: oldState, onError: oldError }));
    controller.replace(options('ETHUSDT', { onStateChange: currentState, onError: currentError }));
    captured[0].onStateChange?.('live');
    captured[0].onError?.(new Error('late-old-error'));
    captured[1].onStateChange?.('live');
    const currentFailure = new Error('current-error');
    captured[1].onError?.(currentFailure);

    expect(oldState).not.toHaveBeenCalled();
    expect(oldError).not.toHaveBeenCalled();
    expect(currentState).toHaveBeenCalledWith('live');
    expect(currentError).toHaveBeenCalledWith(currentFailure);
  });

  it('forwards only the current selection disposition and backfill demand', () => {
    const captured: Array<Parameters<BinanceAnalysisSelectedLiveCandleSessionStarter>[0]> = [];
    const start = vi.fn<BinanceAnalysisSelectedLiveCandleSessionStarter>(received => {
      captured.push(received);
      return { ok: true, subscription: lifecycle() };
    });
    const oldDisposition = vi.fn();
    const oldBackfill = vi.fn();
    const nextDisposition = vi.fn();
    const nextBackfill = vi.fn();
    const controller = createBinanceAnalysisSelectedLiveCandleSessionController(start);
    controller.replace(options('BTCUSDT', { onDisposition: oldDisposition, onBackfillRequired: oldBackfill }));
    controller.replace(options('ETHUSDT', { onDisposition: nextDisposition, onBackfillRequired: nextBackfill }));
    const request = { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, interval: '1m', observation: {
      instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, price: d('2000'), observedAt: '2026-09-13T02:01:02.000Z', sourceTimestamp: '2026-09-13T02:01:01.000Z',
    } } as const;
    captured[0].onDisposition?.({ kind: 'ignored-stale' });
    captured[0].onBackfillRequired(request);
    captured[1].onDisposition?.({ kind: 'ignored-stale' });
    captured[1].onBackfillRequired(request);

    expect(oldDisposition).not.toHaveBeenCalled();
    expect(oldBackfill).not.toHaveBeenCalled();
    expect(nextDisposition).toHaveBeenCalledWith({ kind: 'ignored-stale' });
    expect(nextBackfill).toHaveBeenCalledWith(request);
  });

  it('leaves no active session when replacement validation fails', () => {
    const active = lifecycle();
    const start = vi.fn<BinanceAnalysisSelectedLiveCandleSessionStarter>()
      .mockReturnValueOnce({ ok: true, subscription: active })
      .mockReturnValueOnce({ ok: false, reason: 'venue-mismatch' });
    const controller = createBinanceAnalysisSelectedLiveCandleSessionController(start);
    controller.replace(options('BTCUSDT'));

    expect(controller.replace(options('ETHUSDT'))).toEqual({ ok: false, reason: 'venue-mismatch' });
    expect(active.close).toHaveBeenCalledTimes(1);
    expect(controller.isActive()).toBe(false);
  });

  it('stops idempotently and invalidates callbacks before cleanup', () => {
    const subscription = lifecycle();
    let received: Parameters<BinanceAnalysisSelectedLiveCandleSessionStarter>[0] | undefined;
    const start = vi.fn<BinanceAnalysisSelectedLiveCandleSessionStarter>(value => {
      received = value;
      return { ok: true, subscription };
    });
    const onStateChange = vi.fn();
    const controller = createBinanceAnalysisSelectedLiveCandleSessionController(start);
    controller.replace(options('BTCUSDT', { onStateChange }));
    controller.stop();
    controller.stop();
    received?.onStateChange?.('live');

    expect(subscription.close).toHaveBeenCalledTimes(1);
    expect(onStateChange).not.toHaveBeenCalled();
    expect(controller.isActive()).toBe(false);
  });
});
