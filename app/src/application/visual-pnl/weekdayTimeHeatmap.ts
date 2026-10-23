/**
 * U5 (P13.A4, D206): "When you trade" — your results by the weekday and the 4-hour block a trade opened in, in the saved
 * time zone, by the same rule as Patterns (projectVisualPnlOpening). Totals come from the aggregation owner and block
 * with its reason; colours use the calendar's strength rule. It adds up no money itself.
 */

import type { JournalHistoryEntry } from '../journal/historyQuery';
import { summarizeVisualPnlAggregation, type VisualPnlAggregationSummary } from './aggregationSummary';
import { projectVisualPnlOpening, VISUAL_PNL_HOURS_PER_BLOCK } from './dayBucket';
import { projectVisualPnlStrengthScale, visualPnlStrengthOf, type VisualPnlMonthScale } from './monthGrid';

export const VISUAL_PNL_WEEKDAY_NAMES = Object.freeze(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const);
export const VISUAL_PNL_HOUR_BLOCK_NAMES = Object.freeze(['Night (00:00 to 03:59)', 'Early morning (04:00 to 07:59)', 'Morning (08:00 to 11:59)', 'Afternoon (12:00 to 15:59)', 'Evening (16:00 to 19:59)', 'Late evening (20:00 to 23:59)'] as const);

export interface VisualPnlHeatmapCell {
  readonly weekday: number;
  readonly block: number;
  /** In close order, as the entries come. */
  readonly tradeIds: readonly string[];
  /** null: no trade opened then. */
  readonly summary: VisualPnlAggregationSummary | null;
  readonly strength: 1 | 2 | 3 | 4 | null;
}
export interface VisualPnlWeekdayTimeHeatmap {
  readonly rows: readonly Readonly<{ weekday: number; cells: readonly VisualPnlHeatmapCell[] }>[];
  readonly scale: VisualPnlMonthScale;
  /** The trades with no readable opening time. */
  readonly leftOut: readonly string[];
}

const BLOCKS = 24 / VISUAL_PNL_HOURS_PER_BLOCK;

/** Entries are closed trades in close order (the dashboard's), after the home-currency step when there is one. */
export function projectVisualPnlWeekdayTimeHeatmap(entries: readonly JournalHistoryEntry[], timeZone: string): VisualPnlWeekdayTimeHeatmap {
  const grouped = Array.from({ length: VISUAL_PNL_WEEKDAY_NAMES.length * BLOCKS }, () => [] as JournalHistoryEntry[]);
  const leftOut: string[] = [];
  for (const entry of entries) {
    const opening = projectVisualPnlOpening(entry.trade.openedAt, timeZone);
    if (opening === null) { leftOut.push(entry.trade.id); continue; }
    grouped[opening.weekday * BLOCKS + Math.floor(opening.hour / VISUAL_PNL_HOURS_PER_BLOCK)]!.push(entry);
  }
  const summaries = grouped.map(group => group.length === 0 ? null : summarizeVisualPnlAggregation(group.map(entry => entry.visualPnl)));
  const scale = projectVisualPnlStrengthScale(summaries.filter((summary): summary is VisualPnlAggregationSummary => summary !== null));
  const rows = VISUAL_PNL_WEEKDAY_NAMES.map((_, weekday) => Object.freeze({
    weekday,
    cells: Object.freeze(Array.from({ length: BLOCKS }, (__, block) => {
      const index = weekday * BLOCKS + block;
      return Object.freeze({ weekday, block, tradeIds: Object.freeze(grouped[index]!.map(entry => entry.trade.id)), summary: summaries[index]!, strength: visualPnlStrengthOf(summaries[index]!, scale) });
    })),
  }));
  return Object.freeze({ rows: Object.freeze(rows), scale, leftOut: Object.freeze(leftOut) });
}
