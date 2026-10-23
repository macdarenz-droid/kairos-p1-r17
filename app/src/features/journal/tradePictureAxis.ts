const MINUTE = 60_000, HOUR = 60 * MINUTE, DAY = 24 * HOUR;

/** At most this many time labels under a picture (D217: in the device's time zone until U18). */
export const TRADE_PICTURE_MAX_TICKS = 5;

/** A step on the wall clock: a fixed length, or whole calendar months (counted from January). */
type Step = Readonly<{ ms: number }> | Readonly<{ months: number }>;

/** Steps tried smallest first; the first that gives at most TRADE_PICTURE_MAX_TICKS wins. */
const STEPS: readonly Step[] = [
  ...[1, 2, 5, 10, 15, 30].map(minutes => ({ ms: minutes * MINUTE })),
  ...[1, 2, 3, 6, 12].map(hours => ({ ms: hours * HOUR })),
  ...[1, 2, 3].map(days => ({ ms: days * DAY })),
  { ms: 7 * DAY }, { ms: 14 * DAY },
  { months: 1 }, { months: 3 }, { months: 6 }, { months: 12 }, { months: 24 }, { months: 60 },
];

export interface TradePictureTimeTick {
  readonly ms: number;
  readonly label: string;
}

type Kind = 'clock' | 'time' | 'day' | 'month';
const FORMATTERS = new Map<string, Intl.DateTimeFormat>();

/** One formatter per zone and kind, kept: a picture redraws often. */
function formatter(kind: Kind, timeZone: string | undefined): Intl.DateTimeFormat {
  const key = `${kind}|${timeZone ?? ''}`;
  const kept = FORMATTERS.get(key);
  if (kept) return kept;
  // The clock is read in Latin digits on the ISO calendar, whatever the device's language (as dayBucket.ts does);
  // only the labels speak the device's language.
  const made = kind === 'clock'
    ? new Intl.DateTimeFormat('en', { timeZone, calendar: 'iso8601', numberingSystem: 'latn', hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric' })
    : new Intl.DateTimeFormat(undefined, kind === 'time' ? { timeZone, timeStyle: 'short' } : kind === 'day' ? { timeZone, day: 'numeric', month: 'short' } : { timeZone, month: 'short', year: 'numeric' });
  FORMATTERS.set(key, made);
  return made;
}

/** The zone's offset at `ms` (wall clock minus UTC), in whole minutes. */
function offsetAt(ms: number, timeZone: string | undefined): number {
  const parts = Object.fromEntries(formatter('clock', timeZone).formatToParts(ms).map(part => [part.type, part.value]));
  const wall = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute));
  return wall - Math.floor(ms / MINUTE) * MINUTE;
}

/**
 * The instant a wall-clock time names, with the offset that holds at that instant (so a clock change between ticks
 * is followed). A time the clock skips (it jumps forward) does not exist: `exists` is false and `at` is the moment of
 * the jump, read with the offset before it.
 */
function instantOf(wall: number, guessOffset: number, timeZone: string | undefined): { readonly at: number; readonly exists: boolean } {
  const first = wall - offsetAt(wall - guessOffset, timeZone);
  if (first + offsetAt(first, timeZone) === wall) return { at: first, exists: true };
  const second = wall - offsetAt(first, timeZone);
  if (second + offsetAt(second, timeZone) === wall) return { at: second, exists: true };
  return { at: wall - Math.min(offsetAt(first, timeZone), offsetAt(second, timeZone)), exists: false };
}

/** Round wall-clock times inside [fromMs, toMs] for one step; stops once there are more than the most shown. */
function ticksFor(step: Step, fromMs: number, toMs: number, timeZone: string | undefined): number[] {
  const startOffset = offsetAt(fromMs, timeZone), endOffset = offsetAt(toMs, timeZone);
  const wallFrom = fromMs + startOffset, wallTo = toMs + endOffset;
  const found: number[] = [];
  // An hour the clock skips gets no label; a day whose midnight is skipped is labelled at the jump. No time twice.
  const daysOrMore = 'months' in step || step.ms >= DAY;
  const keep = (wall: number) => {
    const { at, exists } = instantOf(wall, startOffset, timeZone);
    if ((exists || daysOrMore) && at >= fromMs && at <= toMs && at !== found[found.length - 1]) found.push(at);
    return found.length <= TRADE_PICTURE_MAX_TICKS;
  };
  if ('months' in step) {
    const start = new Date(wallFrom);
    const first = start.getUTCFullYear() * 12 + start.getUTCMonth();
    for (let month = Math.ceil(first / step.months) * step.months; ; month += step.months) {
      const wall = Date.UTC(Math.floor(month / 12), month % 12, 1);
      if (wall > wallTo) break;
      if (!keep(wall)) break;
    }
    return found;
  }
  // Weeks start on Monday; 1 January 1970 was a Thursday, so Mondays sit 4 days after a multiple of 7 days.
  const base = step.ms === 7 * DAY || step.ms === 14 * DAY ? 4 * DAY : 0;
  for (let wall = Math.ceil((wallFrom - base) / step.ms) * step.ms + base; wall <= wallTo; wall += step.ms) {
    if (!keep(wall)) break;
  }
  return found;
}

/**
 * Up to TRADE_PICTURE_MAX_TICKS labelled round times inside the range, for the picture's time axis: hours and
 * minutes for steps under a day (the date at midnight), the day and month from a day up, the month and year from
 * three months up. In the device's time zone unless one is given, following its clock changes. Empty when the
 * range is not a span of time.
 */
export function tradePictureTimeTicks(fromMs: number, toMs: number, timeZone?: string): readonly TradePictureTimeTick[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs) return [];
  for (const step of STEPS) {
    const found = ticksFor(step, fromMs, toMs, timeZone);
    if (found.length <= TRADE_PICTURE_MAX_TICKS) {
      const kind: Kind = 'months' in step ? (step.months >= 3 ? 'month' : 'day') : step.ms < DAY ? 'time' : 'day';
      // On an hours axis a tick at local midnight gives the date, so a day change can be seen.
      const labelOf = (ms: number) => (kind === 'time' && (ms + offsetAt(ms, timeZone)) % DAY === 0 ? formatter('day', timeZone) : formatter(kind, timeZone)).format(ms);
      return Object.freeze(found.map(ms => Object.freeze({ ms, label: labelOf(ms) })));
    }
  }
  return [];
}
