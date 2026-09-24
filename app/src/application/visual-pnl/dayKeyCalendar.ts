/**
 * Calendar-key helpers for `YYYY-MM-DD` day keys. They work on calendar
 * dates only (not instants, not money), so no time zone is involved.
 */
const DAY_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function dayKeyFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** True for a real calendar date written as `YYYY-MM-DD`. */
export function isVisualPnlDayKey(value: string): boolean {
  if (!DAY_KEY_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && dayKeyFromUtc(date) === value;
}

/** The calendar day `days` after (or before, when negative) `dayKey`. */
export function shiftVisualPnlDayKey(dayKey: string, days: number): string {
  const [year, month, day] = dayKey.split('-').map(Number);
  return dayKeyFromUtc(new Date(Date.UTC(year, month - 1, day + days)));
}
