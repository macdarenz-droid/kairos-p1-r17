import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import type { JournalHistoryScope } from '../../application/journal';

/** U15 (D260): a trade's own page, in the Journal or in Practice; where every "View trade" goes. */
export function tradePageHref(id: string, scope: JournalHistoryScope = 'real'): string {
  return `/${scope === 'practice' ? 'practice' : 'journal'}/trades/${encodeURIComponent(id)}`;
}

/** U15 (D263): the page that edits a saved trade. */
export function tradeEditHref(id: string, scope: JournalHistoryScope = 'real'): string {
  return `${tradePageHref(id, scope)}/edit`;
}

/** A saved trade on Analysis's market chart, the trade page's "See it on the market chart". */
export function tradeReviewHref(id: string): string {
  return `/analysis?trade=${encodeURIComponent(id)}`;
}

/**
 * Navigation state that carries a notice to the page it opens: a trade's page to its list after a delete (D264), Edit
 * to the trade's page after a save ("Changes saved.", D263).
 */
const ARRIVED_NOTICE_STATE = 'kairos.arrived-notice';
export const arrivedNoticeState = (notice: string): Readonly<Record<string, string>> => ({ [ARRIVED_NOTICE_STATE]: notice });

/**
 * A notice for a page reached by going back, where the history cannot carry anything new (D263: Edit's "Changes saved."
 * after Save went back to the trade's page). Kept in memory by the page's address until that page shows it.
 */
const noticesOnReturn = new Map<string, string>();
export function noticeOnReturn(pathname: string, notice: string): void {
  noticesOnReturn.set(pathname, notice);
}

/** State a trade's page sends with Edit, so Edit's Save and Cancel know going back returns to it. */
const FROM_TRADE_PAGE_STATE = 'kairos.from-trade-page';
export const fromTradePageState: Readonly<Record<string, true>> = Object.freeze({ [FROM_TRADE_PAGE_STATE]: true });
export const openedFromTradePage = (state: unknown): boolean => (state as Readonly<Record<string, unknown>> | null)?.[FROM_TRADE_PAGE_STATE] === true;

/**
 * The notice the previous page sent with you (or left for when you go back here), read once on arrival. The address's
 * entry then forgets it, so coming back to the page later never shows it again.
 */
export function useArrivedNotice(): string | undefined {
  const location = useLocation();
  const navigate = useNavigate();
  const sent = (location.state as Readonly<Record<string, unknown>> | null)?.[ARRIVED_NOTICE_STATE];
  const [arrived] = useState(typeof sent === 'string' ? sent : noticesOnReturn.get(location.pathname));
  useEffect(() => {
    noticesOnReturn.delete(location.pathname);
    if (typeof sent === 'string') navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null });
  }, [sent]); // eslint-disable-line react-hooks/exhaustive-deps
  return arrived;
}
