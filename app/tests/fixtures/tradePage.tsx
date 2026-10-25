import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { JournalRoute } from '../../src/app/JournalRoute';
import { PracticeRoute } from '../../src/app/PracticeRoute';
import type { JournalHistoryScope } from '../../src/application/journal';
import type { KairosDatabase } from '../../src/data/database';
import { tradePageHref } from '../../src/features/journal/tradeAddress';
import { TradePageScreen } from '../../src/features/journal/TradePageScreen';

/**
 * U15 (T-060c): a trade's controls live on its own page. This opens that page for one saved trade, with the Journal and
 * Practice lists behind it (a delete goes back to its list). A null id starts on the list. `wrap` adds providers around
 * the router.
 */
export function renderTradePage(db: KairosDatabase, tradeId: string | null, options: { readonly scope?: JournalHistoryScope; readonly now?: () => string; readonly wrap?: (node: ReactNode) => ReactNode } = {}) {
  const scope = options.scope ?? 'real';
  const router = createMemoryRouter([
    { path: '/journal', element: <JournalRoute db={db} now={options.now} /> },
    { path: '/practice', element: <PracticeRoute db={db} now={options.now} /> },
    { path: '/journal/trades/:id', element: <TradePageScreen db={db} scope="real" /> },
    { path: '/practice/trades/:id', element: <TradePageScreen db={db} scope="practice" /> },
    { path: '/analysis', element: <h1>Analysis</h1> },
  ], { initialEntries: [tradeId === null ? (scope === 'practice' ? '/practice' : '/journal') : tradePageHref(tradeId, scope)] });
  const view = render(<>{(options.wrap ?? (node => node))(<RouterProvider router={router} />)}</>);
  return { ...view, router };
}

/** The page's heading, once the trade is read ("BTCUSDT · Long"). */
export const tradePageHeading = (name: string | RegExp) => screen.findByRole('heading', { level: 1, name });

/** One part of the trade's page by its name: "Change this trade", "Before and after the trade", "Recorded result", … */
export const tradePagePart = (name: string) => within(screen.getByRole('region', { name }));

/** U15 (D264): opens the trade page's "…" sheet, which holds Edit, Duplicate and Delete, and returns it. */
export function openTradeMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'More for this trade' }));
  return within(screen.getByRole('dialog', { name: 'More for this trade' }));
}
