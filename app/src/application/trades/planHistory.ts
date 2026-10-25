import type { TradePlanRecord } from '../../domain/trades';

/** One change between two plan versions: "Stop moved from 95 to 97", said with when it was made. */
export interface PlanChangeLine {
  /** The newer version's saved time, as stored. */
  readonly at: string;
  /** That time in words: "24 Oct at 10:32". */
  readonly when: string;
  readonly text: string;
}

type Price = 'plannedEntryPrice' | 'plannedStopPrice' | 'plannedTargetPrice' | 'plannedQuantity';
/** Each plan number in the form's own words, and whether a new value "moved" (a price) or "changed" (a size). */
const NUMBERS: readonly Readonly<{ field: Price; name: string; verb: string }>[] = [
  { field: 'plannedEntryPrice', name: 'Planned entry', verb: 'moved' },
  { field: 'plannedStopPrice', name: 'Stop', verb: 'moved' },
  { field: 'plannedTargetPrice', name: 'Target', verb: 'moved' },
  { field: 'plannedQuantity', name: 'Planned quantity', verb: 'changed' },
];
const REASON = "Why I'm taking it";

/** Oldest first; versions saved at the same time keep the order they were made in (created, then id). */
function inTimeOrder(plans: readonly TradePlanRecord[]): readonly TradePlanRecord[] {
  return [...plans].sort((a, b) => a.updatedAt.localeCompare(b.updatedAt) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

function formatter(timeZone: string | null, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(undefined, { ...options, ...(timeZone === null ? {} : { timeZone }) });
  } catch {
    // A zone this device doesn't know: its own zone, rather than no time at all.
    return new Intl.DateTimeFormat(undefined, options);
  }
}

function changesBetween(before: TradePlanRecord, after: TradePlanRecord): readonly string[] {
  const lines: string[] = [];
  for (const { field, name, verb } of NUMBERS) {
    const was = before[field];
    const now = after[field];
    if (was === now) continue;
    if (was === null) lines.push(`${name} added: ${now}`);
    else if (now === null) lines.push(`${name} removed`);
    else lines.push(`${name} ${verb} from ${was} to ${now}`);
  }
  const wasReason = before.reason ?? null;
  const nowReason = after.reason ?? null;
  if (wasReason !== nowReason) lines.push(`${REASON} ${wasReason === null ? 'added' : nowReason === null ? 'removed' : 'changed'}`);
  return lines;
}

/**
 * U15 (D263): what changed in a trade's plan, version by version, oldest first, in plain words: "Stop moved from 95 to
 * 97", "Target added: 120", "Planned entry removed", "Why I'm taking it changed". Each line says when, in the trader's
 * time zone (null: the device's). A plan saved once has no changes.
 */
export function describePlanHistory(plans: readonly TradePlanRecord[], timeZone: string | null): readonly PlanChangeLine[] {
  const versions = inTimeOrder(plans);
  const day = formatter(timeZone, { day: 'numeric', month: 'short' });
  const time = formatter(timeZone, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const lines: PlanChangeLine[] = [];
  for (let index = 1; index < versions.length; index += 1) {
    const after = versions[index]!;
    const date = new Date(after.updatedAt);
    const when = Number.isNaN(date.getTime()) ? after.updatedAt : `${day.format(date)} at ${time.format(date)}`;
    for (const text of changesBetween(versions[index - 1]!, after)) lines.push({ at: after.updatedAt, when, text });
  }
  return lines;
}
