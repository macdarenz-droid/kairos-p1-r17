import { Link, useInRouterContext } from 'react-router';
import type { JournalHistoryScope } from '../application/journal';
import { tradePageHref } from '../features/journal/tradeAddress';

export { tradePageHref, tradeReviewHref } from '../features/journal/tradeAddress';

/** "View trade" opens the trade's own page (U15, D260). SPA navigation in the app; a normal link for standalone Journal presentation. */
export function ReviewTradeLink({ id, scope = 'real', className }: { readonly id: string; readonly scope?: JournalHistoryScope; readonly className?: string }) {
  const inRouter = useInRouterContext();
  const href = tradePageHref(id, scope);
  return inRouter
    ? <Link to={href} className={className}>View trade</Link>
    : <a href={href} className={className}>View trade</a>;
}
