import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5VisibleRangePort,
  type LightweightChartsV5ChartApi,
  type LightweightChartsV5LogicalRangeChangeHandler,
} from '../src/features/chart';

describe('P17.13 visible logical range boundary', () => {
  it('reads viewport demand', () => {
    const chart = {
      timeScale: () => ({
        getVisibleLogicalRange: () => ({ from: 10.5, to: 40.25 }),
        subscribeVisibleLogicalRangeChange: vi.fn(),
        unsubscribeVisibleLogicalRangeChange: vi.fn(),
      }),
    } as unknown as LightweightChartsV5ChartApi;

    expect(
      createLightweightChartsV5VisibleRangePort(chart).getVisibleLogicalRange(),
    ).toEqual({ from: 10.5, to: 40.25 });
  });

  it('cleans up the exact subscription once', () => {
    const handlerBox: {
      current: LightweightChartsV5LogicalRangeChangeHandler | null;
    } = { current: null };

    const unsubscribe = vi.fn();
    const listener = vi.fn();

    const chart = {
      timeScale: () => ({
        getVisibleLogicalRange: () => null,
        subscribeVisibleLogicalRangeChange: (
          handler: LightweightChartsV5LogicalRangeChangeHandler,
        ) => {
          handlerBox.current = handler;
        },
        unsubscribeVisibleLogicalRangeChange: unsubscribe,
      }),
    } as unknown as LightweightChartsV5ChartApi;

    const dispose = createLightweightChartsV5VisibleRangePort(chart)
      .subscribeVisibleLogicalRangeChange(listener);

    const subscribedHandler = handlerBox.current;
    expect(subscribedHandler).not.toBeNull();
    if (subscribedHandler) {
      subscribedHandler({ from: 1, to: 20 });
    }

    expect(listener).toHaveBeenCalledWith({ from: 1, to: 20 });

    dispose();
    dispose();

    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledWith(subscribedHandler);
  });
});
