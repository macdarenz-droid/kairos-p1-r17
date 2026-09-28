import { Link, useInRouterContext } from 'react-router';

export function tradeReviewHref(id: string): string {
  return `/analysis?trade=${encodeURIComponent(id)}`;
}

/** SPA navigation in the app; a normal link for standalone Journal presentation. */
export function ReviewTradeLink({ id, className }: { readonly id: string; readonly className?: string }) {
  const inRouter = useInRouterContext();
  const href = tradeReviewHref(id);
  return inRouter
    ? <Link to={href} className={className}>View trade</Link>
    : <a href={href} className={className}>View trade</a>;
}
