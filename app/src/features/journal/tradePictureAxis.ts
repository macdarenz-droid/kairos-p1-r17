const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/** At most this many time labels under a picture (D217: in the device's time zone until U18). */
export const TRADE_PICTURE_MAX_TICKS = 5;

/** Steps tried smallest first; 'month' is a calendar month. The first that gives at most TRADE_PICTURE_MAX_TICKS wins. */
const STEPS: readonly (number | 'month')[] = [
  MINUTE, 2 * MINUTE, 5 * MINUTE, 10 * MINUTE, 15 * MINUTE, 30 * MINUTE,
  HOUR, 2 * HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY, 14 * DAY, 'month',
];

export interface TradePictureTimeTick {
  readonly ms: number;
  readonly label: string;
}

type Kind = 'parts' | 'time' | 'day';
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** One formatter per zone and kind, kept: a picture redraws often. */
function formatter(kind: Kind, timeZone: string | undefined): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone ?? ''}`;
  const kept = FORMATTERS.get(key);
  if (kept) return kept;
  const options: Intl.DateTimeFormatOptions = kind === 'parts'
    ? { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' }
    : kind === 'time' ? { timeZone, timeStyle: 'short' } : { timeZone, day: 'numeric', month: 'short' };
  const made = new Intl.DateTimeFormat(undefined, options);
  FORMATTERS.set(key, made);
  return made;
}

/** The wall clock at `ms` in the zone, as a UTC timestamp (so whole hours and days can be found with plain maths). */
function wallClock(ms: number, timeZone: string | undefined): number {
  const parts = Object.fromEntries(formatter('parts', timeZone).formatToParts(ms).map(part => [part.type, part.value]));
  return Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
}

/** Round times inside [fromMs, toMs] for one step, found on the zone's wall clock. */
function ticksFor(step: number | 'month', fromMs: number, toMs: number, timeZone: string | undefined): number[] {
  const offset = wallClock(fromMs, timeZone) - Math.floor(fromMs / MINUTE) * MINUTE;
  const wallFrom = fromMs + offset, wallTo = toMs + offset;
  const found: number[] = [];
  if (step === 'month') {
    const start = new Date(wallFrom);
    for (let month = start.getUTCMonth() + (start.getUTCDate() === 1 && wallFrom % DAY === 0 ? 0 : 1), year = start.getUTCFullYear(); ; month += 1) {
      const wall = Date.UTC(year, month, 1);
      if (wall > wallTo) break;
      found.push(wall - offset);
      if (found.length > TRADE_PICTURE_MAX_TICKS) break;
    }
    return found;
  }
  // Weeks start on Monday; 1 January 1970 was a Thursday, so Mondays sit 4 days after a multiple of 7 days.
  const base = step === 7 * DAY || step === 14 * DAY ? 4 * DAY : 0;
  for (let wall = Math.ceil((wallFrom - base) / step) * step + base; wall <= wallTo; wall += step) {
    found.push(wall - offset);
    if (found.length > TRADE_PICTURE_MAX_TICKS) break;
  }
  return found;
}

/**
 * Up to TRADE_PICTURE_MAX_TICKS labelled round times inside the range, for the picture's time axis: hours and
 * minutes for steps under a day, the day and month from a day up. In the device's time zone unless one is given.
 * Empty when the range is not a span of time.
 */
export function tradePictureTimeTicks(fromMs: number, toMs: number, timeZone?: string): readonly TradePictureTimeTick[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];
  for (const step of STEPS) {
    const found = ticksFor(step, fromMs, toMs, timeZone);
    if (found.length <= TRADE_PICTURE_MAX_TICKS) {
      const labels = formatter(step !== 'month' && step < DAY ? 'time' : 'day', timeZone);
      return Object.freeze(found.map(ms => Object.freeze({ ms, label: labels.format(ms) })));
    }
  }
  return [];
}
