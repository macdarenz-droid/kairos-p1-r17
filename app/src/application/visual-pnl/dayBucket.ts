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
