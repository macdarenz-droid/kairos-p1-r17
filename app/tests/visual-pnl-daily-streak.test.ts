import { describe, expect, it } from 'vitest';
import {
  projectVisualPnlDailyStreak,
  type VisualPnlDailySummary,
} from '../src/application/visual-pnl';
import { parseDecimalString } from '../src/domain/trades';

function dec(value: string) {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`Invalid test decimal: ${value}`);
  return parsed.value;
}

function available(
  dayKey: string,
  outcome: 'profit' | 'loss' | 'breakeven',
): VisualPnlDailySummary {
  const total = outcome === 'profit' ? dec('10') : outcome === 'loss' ? dec('-10') : dec('0');
  return Object.freeze({
    dayKey,
    timeZone: 'UTC',
    summary: Object.freeze({
      available: true as const,
      currency: 'USD',
      total,
      outcome,
      tradeCount: 1,
    }),
  });
}

function unavailable(dayKey: string): VisualPnlDailySummary {
  return Object.freeze({
    dayKey,
    timeZone: 'UTC',
    summary: Object.freeze({
      available: false as const,
      currency: null,
      total: null,
      outcome: null,
      tradeCount: 2,
      reason: 'mixed-currencies' as const,
    }),
  });
}

describe('P13.13 Visual P&L daily streak semantics', () => {
  it('returns an empty streak when there are no result days', () => {
    expect(projectVisualPnlDailyStreak([])).toEqual({
      outcome: null,
      length: 0,
      startDayKey: null,
      endDayKey: null,
    });
  });

  it('tracks the current consecutive available result-day outcome', () => {
    expect(projectVisualPnlDailyStreak([
      available('2026-09-01', 'loss'),
      available('2026-09-03', 'profit'),
      available('2026-09-05', 'profit'),
    ])).toEqual({
      outcome: 'profit',
      length: 2,
      startDayKey: '2026-09-03',
      endDayKey: '2026-09-05',
    });
  });

  it('does not treat missing calendar dates as invented losing or breaking days', () => {
    expect(projectVisualPnlDailyStreak([
      available('2026-09-01', 'profit'),
      available('2026-09-08', 'profit'),
    ])).toMatchObject({ outcome: 'profit', length: 2 });
  });

  it('resets when an unavailable daily result prevents safe semantic continuation', () => {
    expect(projectVisualPnlDailyStreak([
      available('2026-09-01', 'profit'),
      unavailable('2026-09-02'),
      available('2026-09-03', 'profit'),
    ])).toEqual({
      outcome: 'profit',
      length: 1,
      startDayKey: '2026-09-03',
      endDayKey: '2026-09-03',
    });
  });

  it('treats break-even as its own explicit result-day streak', () => {
    expect(projectVisualPnlDailyStreak([
      available('2026-09-01', 'profit'),
      available('2026-09-02', 'breakeven'),
      available('2026-09-03', 'breakeven'),
    ])).toMatchObject({ outcome: 'breakeven', length: 2 });
  });
});
