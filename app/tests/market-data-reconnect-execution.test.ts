import { describe, expect, it, vi } from 'vitest';
import { executeMarketDataReconnectAttempt } from '../src/services/market-data';

const policy = {
  initialDelayMs: 1_000,
  maxDelayMs: 8_000,
  maxAttempts: 4,
} as const;

describe('P15.13 market-data reconnect execution semantics', () => {
  it('schedules an accepted transient retry using the planned jittered delay', () => {
    const reconnect = vi.fn();
    const schedule = vi.fn((_callback: () => void, _delayMs: number) => 'handle');
    const cancel = vi.fn();
    const result = executeMarketDataReconnectAttempt(
      { schedule, cancel },
      { kind: 'transient-failure' },
      policy,
      0,
      0.5,
      reconnect,
    );

    expect(result.kind).toBe('scheduled');
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule.mock.calls[0]?.[1]).toBe(500);
  });

  it('does not schedule an intentional close', () => {
    const schedule = vi.fn((_callback: () => void, _delayMs: number) => 'handle');
    expect(
      executeMarketDataReconnectAttempt(
        { schedule, cancel: vi.fn() },
        { kind: 'intentional-close' },
        policy,
        0,
        Number.NaN,
        vi.fn(),
      ),
    ).toEqual({ kind: 'stop', reason: 'intentional-close' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not schedule a terminal failure', () => {
    const schedule = vi.fn((_callback: () => void, _delayMs: number) => 'handle');
    expect(
      executeMarketDataReconnectAttempt(
        { schedule, cancel: vi.fn() },
        { kind: 'terminal-failure' },
        policy,
        0,
        Number.NaN,
        vi.fn(),
      ),
    ).toEqual({ kind: 'stop', reason: 'terminal-failure' });
    expect(schedule).not.toHaveBeenCalled();
  });

  it('does not schedule after the attempt limit', () => {
    const schedule = vi.fn((_callback: () => void, _delayMs: number) => 'handle');
    expect(
      executeMarketDataReconnectAttempt(
        { schedule, cancel: vi.fn() },
        { kind: 'transient-failure' },
        policy,
        4,
        0.5,
        vi.fn(),
      ),
    ).toEqual({ kind: 'stop', reason: 'attempt-limit' });
    expect(schedule).not.toHaveBeenCalled();
  });
});
