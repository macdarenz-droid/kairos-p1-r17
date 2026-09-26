import { describe, expect, it } from 'vitest';
import { projectVisualPnlDayKey } from '../src/application/visual-pnl';

describe('P13.6 Visual P&L day-bucket semantics', () => {
  it('uses the explicit Sydney calendar day rather than silently using UTC', () => {
    expect(projectVisualPnlDayKey('2026-09-02T14:30:00.000Z', 'Australia/Sydney')).toEqual({
      available: true,
      dayKey: '2026-09-03',
      timeZone: 'Australia/Sydney',
      basis: 'closed-at',
    });
  });

  it('projects the same instant to a different explicit New York calendar day', () => {
    expect(projectVisualPnlDayKey('2026-09-02T14:30:00.000Z', 'America/New_York')).toMatchObject({
      available: true,
      dayKey: '2026-09-02',
      timeZone: 'America/New_York',
    });
  });

  it('honours an explicit zone across a daylight-saving boundary', () => {
    expect(projectVisualPnlDayKey('2026-10-03T15:30:00.000Z', 'Australia/Sydney')).toMatchObject({
      available: true,
      dayKey: '2026-10-04',
      timeZone: 'Australia/Sydney',
    });
  });

  it('blocks missing close time', () => {
    expect(projectVisualPnlDayKey(null, 'Australia/Sydney')).toEqual({
      available: false,
      dayKey: null,
      timeZone: 'Australia/Sydney',
      basis: 'closed-at',
      reason: 'missing-close-time',
    });
  });

  it('blocks non-canonical close timestamps', () => {
    expect(projectVisualPnlDayKey('2026-09-02 14:30:00', 'Australia/Sydney')).toMatchObject({
      available: false,
      reason: 'invalid-close-time',
    });
  });

  it('blocks invalid time-zone identifiers instead of falling back to the device zone', () => {
    expect(projectVisualPnlDayKey('2026-09-02T14:30:00.000Z', 'Mars/Olympus_Mons')).toMatchObject({
      available: false,
      reason: 'invalid-time-zone',
      timeZone: 'Mars/Olympus_Mons',
    });
  });
});
