import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs,
  readHomeDashboardLiveCryptoBubbleBrowserObservedAt,
} from '../src/app/homeDashboardLiveCryptoBubbleBrowserWallClock';

describe('Home Live Crypto Bubble browser wall-clock sources foundation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reads acquisition observation time and freshness evaluation time independently', () => {
    const now = vi.spyOn(Date, 'now');
    now
      .mockReturnValueOnce(1_789_056_000_000)
      .mockReturnValueOnce(1_789_056_005_000);

    const observedAt = readHomeDashboardLiveCryptoBubbleBrowserObservedAt();
    const evaluationTimeMs = readHomeDashboardLiveCryptoBubbleBrowserEvaluationTimeMs();

    expect(observedAt).toBe(new Date(1_789_056_000_000).toISOString());
    expect(evaluationTimeMs).toBe(1_789_056_005_000);
    expect(now).toHaveBeenCalledTimes(2);
  });
});
