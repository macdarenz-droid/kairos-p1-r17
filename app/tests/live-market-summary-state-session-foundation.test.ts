import { describe, expect, it, vi } from 'vitest';
import {
  createLiveMarketSummaryDeliveryState,
  createLiveMarketSummaryStateSession,
} from '../src/services/market-data';

describe('P21.19 Live Market Summary State Session Foundation', () => {
  it('owns the exact caller-supplied initial state without cloning or reinterpretation', () => {
    const initial = createLiveMarketSummaryDeliveryState();
    const session = createLiveMarketSummaryStateSession(initial);
    expect(session.getState()).toBe(initial);
  });

  it('uses the released empty state when no initial state is supplied', () => {
    const session = createLiveMarketSummaryStateSession();
    expect(session.getState()).toEqual(createLiveMarketSummaryDeliveryState());
  });

  it('passes the exact current state to an explicit caller transition and commits only its returned state', async () => {
    const initial = createLiveMarketSummaryDeliveryState();
    const next = createLiveMarketSummaryDeliveryState();
    const transition = vi.fn(async (state: typeof initial) => {
      expect(state).toBe(initial);
      return next;
    });
    const session = createLiveMarketSummaryStateSession(initial);

    await expect(session.transition(transition)).resolves.toBe(next);
    expect(transition).toHaveBeenCalledTimes(1);
    expect(session.getState()).toBe(next);
  });

  it('preserves exact prior-state identity and content when an explicit transition fails', async () => {
    const initial = createLiveMarketSummaryDeliveryState();
    const session = createLiveMarketSummaryStateSession(initial);
    const failure = new Error('caller-transition-failure');

    await expect(session.transition(async () => { throw failure; })).rejects.toBe(failure);
    expect(session.getState()).toBe(initial);
  });
});
