import type { JournalHistoryScope } from '../../application/journal';

/** U15 (D260): a trade's own page, in the Journal or in Practice; where every "View trade" goes. */
export function tradePageHref(id: string, scope: JournalHistoryScope = 'real'): string {
  return `/${scope === 'practice' ? 'practice' : 'journal'}/trades/${encodeURIComponent(id)}`;
}

/** A saved trade on Analysis's market chart, the trade page's "See it on the market chart". */
export function tradeReviewHref(id: string): string {
  return `/analysis?trade=${encodeURIComponent(id)}`;
}
