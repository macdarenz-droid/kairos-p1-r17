export type VisualPnlDayKeyBlockReason =
  | 'missing-close-time'
  | 'invalid-close-time'
  | 'invalid-time-zone'
  | 'missing-calendar-part';

export type VisualPnlDayKeyProjection =
  | Readonly<{
      available: true;
      dayKey: string;
      timeZone: string;
      basis: 'closed-at';
    }>
  | Readonly<{
      available: false;
      dayKey: null;
      timeZone: string;
      basis: 'closed-at';
      reason: VisualPnlDayKeyBlockReason;
    }>;

function blocked(timeZone: string, reason: VisualPnlDayKeyBlockReason): VisualPnlDayKeyProjection {
  return Object.freeze({
    available: false,
    dayKey: null,
    timeZone,
    basis: 'closed-at' as const,
    reason,
  });
}

function canonicalInstant(value: string): Date | null {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  const instant = new Date(parsed);
  return instant.toISOString() === value ? instant : null;
}

/**
 * Projects a closed trade instant into an explicit calendar-day key.
 *
 * The caller must supply the time-zone policy. This module never falls back to
 * the runtime/device time zone, so day grouping cannot silently change between
 * devices. The instant remains the stored canonical UTC timestamp; only the
 * calendar projection is zone-aware.
 */
export function projectVisualPnlDayKey(
  closedAt: string | null,
  timeZone: string,
): VisualPnlDayKeyProjection {
  if (closedAt === null) return blocked(timeZone, 'missing-close-time');

  const instant = canonicalInstant(closedAt);
  if (instant === null) return blocked(timeZone, 'invalid-close-time');

  let formatter: Intl.DateTimeFormat;
  try {
    formatter = new Intl.DateTimeFormat('en', {
      calendar: 'iso8601',
      numberingSystem: 'latn',
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return blocked(timeZone, 'invalid-time-zone');
  }

  const values = new Map(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type === 'year' || part.type === 'month' || part.type === 'day')
      .map((part) => [part.type, part.value]),
  );

  const year = values.get('year');
  const month = values.get('month');
  const day = values.get('day');
  if (year === undefined || month === undefined || day === undefined) {
    return blocked(timeZone, 'missing-calendar-part');
  }

  return Object.freeze({
    available: true,
    dayKey: `${year}-${month}-${day}`,
    timeZone,
    basis: 'closed-at' as const,
  });
}

/**
 * P30: the hour (0–23, 24-hour clock) an instant falls in, in `timeZone`.
 * Like the day key, it never falls back to the device time zone; null for a
 * missing or non-canonical instant or an invalid time zone.
 */
export function projectVisualPnlHourOfDay(instant: string | null, timeZone: string): number | null {
  if (instant === null) return null;
  const at = canonicalInstant(instant);
  if (at === null) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    // hourCycle h23: with hour12 false some engines write midnight as "24".
    parts = new Intl.DateTimeFormat('en', { numberingSystem: 'latn', timeZone, hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  } catch {
    return null;
  }
  const value = parts.find((part) => part.type === 'hour')?.value;
  if (value === undefined || !/^\d{1,2}$/.test(value)) return null;
  const hour = Number.parseInt(value, 10);
  return hour >= 0 && hour <= 23 ? hour : null;
}

/**
 * P34: the clock time ("20:30", 24-hour) an instant shows in `timeZone`. Never the device time zone; null for a
 * missing or non-canonical instant or an invalid time zone.
 */
export function projectVisualPnlClockTime(instant: string | null, timeZone: string): string | null {
  if (instant === null) return null;
  const at = canonicalInstant(instant);
  if (at === null) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en', { numberingSystem: 'latn', timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  } catch {
    return null;
  }
  const hour = parts.find((part) => part.type === 'hour')?.value;
  const minute = parts.find((part) => part.type === 'minute')?.value;
  if (hour === undefined || minute === undefined || !/^\d{1,2}$/.test(hour) || !/^\d{2}$/.test(minute)) return null;
  return `${hour.padStart(2, '0')}:${minute}`;
}
