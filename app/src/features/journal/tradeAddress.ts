import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { JournalHistoryScope } from '../../application/journal';

/** U15 (D260): a trade's own page, in the Journal or in Practice; where every "View trade" goes. */
export function tradePageHref(id: string, scope: JournalHistoryScope = 'real'): string {
  return `/${scope === 'practice' ? 'practice' : 'journal'}/trades/${encodeURIComponent(id)}`;
}

/** A saved trade on Analysis's market chart, the trade page's "See it on the market chart". */
export function tradeReviewHref(id: string): string {
  return `/analysis?trade=${encodeURIComponent(id)}`;
}

/** Navigation state a trade's page sends to its list after a delete: the notice to show there (D264). */
const TRADE_DELETED_STATE = 'kairos.trade-deleted';
export const tradeDeletedState = (notice: string): Readonly<Record<string, string>> => ({ [TRADE_DELETED_STATE]: notice });

/**
 * For the Journal and Practice lists: the notice a trade's page sent with you (after a delete), read once on arrival.
 * The address's entry then forgets it, so coming back to the list later never shows it again.
 */
export function useArrivedNotice(): string | undefined {
  const location = useLocation();
  const navigate = useNavigate();
  const sent = (location.state as Readonly<Record<string, unknown>> | null)?.[TRADE_DELETED_STATE];
  const [arrived] = useState(typeof sent === 'string' ? sent : undefined);
  useEffect(() => {
    if (typeof sent === 'string') navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [sent]); // eslint-disable-line react-hooks/exhaustive-deps
  return arrived;
}
