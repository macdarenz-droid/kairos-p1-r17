import { describe, expect, it } from 'vitest';
import { projectVisualPnlHourOfDay } from '../src/application/visual-pnl';

describe('T-042a the hour of the day in the saved time zone', () => {
  it('gives the hour in the time zone, on a 24-hour clock', () => {
    expect(projectVisualPnlHourOfDay('2026-09-14T09:00:00.000Z', 'UTC')).toBe(9);
    expect(projectVisualPnlHourOfDay('2026-09-14T09:00:00.000Z', 'Asia/Manila')).toBe(17);
    expect(projectVisualPnlHourOfDay('2026-09-16T21:00:00.000Z', 'Asia/Manila')).toBe(5);
    expect(projectVisualPnlHourOfDay('2026-09-14T00:30:00.000Z', 'UTC')).toBe(0);
    expect(projectVisualPnlHourOfDay('2026-09-14T23:59:59.999Z', 'UTC')).toBe(23);
    expect(projectVisualPnlHourOfDay('2026-03-08T10:30:00.000Z', 'America/New_York')).toBe(6);
  });

  it('gives null for a missing or non-canonical instant or an invalid time zone', () => {
    expect(projectVisualPnlHourOfDay(null, 'UTC')).toBeNull();
    expect(projectVisualPnlHourOfDay('2026-09-14T09:00:00Z', 'UTC')).toBeNull();
    expect(projectVisualPnlHourOfDay('2026-09-14T09:00:00.000Z', 'Not/AZone')).toBeNull();
  });
});
