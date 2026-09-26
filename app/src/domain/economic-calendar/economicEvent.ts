/**
 * P34: what a saved news event is (D124). An event is typed by the trader or fetched from an official schedule through the Kairos
 * server, and keeps where it came from (`source`), when it was fetched (`fetchedAt`, fetched news only) and when it was saved. It is
 * scheduled at one UTC instant; its name and its expected, last and actual values are text, never numbers Kairos works out, and a
 * missing value stays null.
 */
import { NEWS_CALENDAR_SOURCE_IDS } from "./newsSources";

export const ECONOMIC_EVENT_SOURCES = Object.freeze([
  "typed",
  ...NEWS_CALENDAR_SOURCE_IDS,
] as const);
export type EconomicEventSource = (typeof ECONOMIC_EVENT_SOURCES)[number];
/** How much the trader expects the news to move prices: big, medium or small. null = not sure. */
export const ECONOMIC_EVENT_IMPACTS = Object.freeze([
  "high",
  "medium",
  "low",
] as const);
export type EconomicEventImpact = (typeof ECONOMIC_EVENT_IMPACTS)[number];
/** Longest typed name, longest fetched name (a source's title is kept whole, never cut), and longest expected, last or actual value (such as 3.1% or 21.5K). */
export const ECONOMIC_EVENT_LIMITS = Object.freeze({
  title: 80,
  fetchedTitle: 200,
  value: 16,
});

export interface EconomicEventRecord {
  readonly id: string;
  readonly source: EconomicEventSource;
  readonly title: string;
  /** The currency the news is about, such as USD; null when the trader gave none. */
  readonly currency: string | null;
  /** When it is scheduled: a canonical UTC instant. */
  readonly startsAt: string;
  /** The trader's size for typed news; always null for fetched news (Kairos rates it on read, newsImpact.ts). */
  readonly impact: EconomicEventImpact | null;
  readonly expected: string | null;
  readonly previous: string | null;
  readonly actual: string | null;
  readonly savedAt: string;
  /** When the Kairos server read the source (UTC instant); null exactly for typed news. */
  readonly fetchedAt: string | null;
}

const RECORD_KEYS =
  "actual,currency,expected,fetchedAt,id,impact,previous,savedAt,source,startsAt,title";
const KEY_PATTERN = /^[A-Za-z0-9-]{1,64}$/;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

export function economicEventId(
  source: EconomicEventSource,
  key: string,
): string {
  return `${source}:${key}`;
}
/** A fresh key for a typed event. */
export function createEconomicEventKey(): string {
  return crypto.randomUUID();
}
/** Text as stored: already trimmed, 1 to `limit` characters, no control characters. */
export function isEconomicEventText(
  value: unknown,
  limit: number,
): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= limit &&
    value.trim() === value &&
    !CONTROL_CHARACTERS.test(value)
  );
}
const isInstant = (value: unknown): value is string =>
  typeof value === "string" &&
  Number.isFinite(Date.parse(value)) &&
  new Date(Date.parse(value)).toISOString() === value;
const isValue = (value: unknown): boolean =>
  value === null || isEconomicEventText(value, ECONOMIC_EVENT_LIMITS.value);

/** The stored shape of one event: checked by integrity, backups and every reader. */
export function isEconomicEventRecordShape(
  value: unknown,
): value is EconomicEventRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== RECORD_KEYS) return false;
  if (!(ECONOMIC_EVENT_SOURCES as readonly unknown[]).includes(record.source))
    return false;
  const prefix = `${String(record.source)}:`;
  if (
    typeof record.id !== "string" ||
    !record.id.startsWith(prefix) ||
    !KEY_PATTERN.test(record.id.slice(prefix.length))
  )
    return false;
  const typed = record.source === "typed";
  if (
    !isEconomicEventText(
      record.title,
      typed ? ECONOMIC_EVENT_LIMITS.title : ECONOMIC_EVENT_LIMITS.fetchedTitle,
    )
  )
    return false;
  if (typed ? record.fetchedAt !== null : !isInstant(record.fetchedAt))
    return false;
  if (!typed && record.impact !== null) return false;
  if (
    record.currency !== null &&
    !(
      typeof record.currency === "string" &&
      CURRENCY_PATTERN.test(record.currency)
    )
  )
    return false;
  if (
    record.impact !== null &&
    !(ECONOMIC_EVENT_IMPACTS as readonly unknown[]).includes(record.impact)
  )
    return false;
  return (
    isInstant(record.startsAt) &&
    isInstant(record.savedAt) &&
    isValue(record.expected) &&
    isValue(record.previous) &&
    isValue(record.actual)
  );
}
