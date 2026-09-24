import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { saveManualTrade } from '../src/application/trades';
import { projectVisualPnlMonthGrid, writeVisualPnlTimeZonePreference, type VisualPnlDailySummary } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { DecimalString, TradeId } from '../src/domain/trades';
import { ResultsCalendar } from '../src/features/journal/ResultsCalendar';

function day(dayKey: string, total: string, currency = 'USD', tradeCount = 1): VisualPnlDailySummary {
  const outcome = total === '0' ? 'breakeven' : total.startsWith('-') ? 'loss' : 'profit';
  return { dayKey, timeZone: 'UTC', summary: { available: true, currency, total: total as DecimalString, outcome, tradeCount } };
}
const mixedDay: VisualPnlDailySummary = { dayKey: '2026-09-04', timeZone: 'UTC', summary: { available: false, currency: null, total: null, outcome: null, tradeCount: 2, reason: 'mixed-currencies' } };

function renderCalendar(days: VisualPnlDailySummary[], options: { canShowNextMonth?: boolean } = {}) {
  const handlers = { onSelectDay: vi.fn(), onPreviousMonth: vi.fn(), onNextMonth: vi.fn() };
  const grid = projectVisualPnlMonthGrid({ monthKey: '2026-09', days, todayKey: null })!;
  const view = render(<ResultsCalendar grid={grid} selectedDayKey={null} canShowNextMonth={options.canShowNextMonth ?? true} {...handlers} />);
  return { ...view, handlers };
}
const cell = (container: HTMLElement, dayKey: string) => container.querySelector(`[data-day-key="${dayKey}"]`) as HTMLElement;

describe('ResultsCalendar', () => {
  it('draws every day of the month with a result mark, a strength and a spoken summary', () => {
    const { container } = renderCalendar([day('2026-09-02', '100'), day('2026-09-03', '-25'), mixedDay, day('2026-09-05', '0')]);
    expect(container.querySelectorAll('[data-day-key]')).toHaveLength(30);
    const firstRow = container.querySelectorAll('tbody tr')[0];
    expect(firstRow.querySelectorAll('td')[0]).not.toHaveAttribute('data-day-key');
    expect(firstRow.querySelectorAll('td')[1]).toHaveTextContent('1');

    const second = cell(container, '2026-09-02');
    expect(second).toHaveAttribute('data-day-result', 'profit');
    expect(second).toHaveAttribute('data-day-strength', '4');
    expect(second).toHaveTextContent('▲');
    expect(within(second).getByRole('button')).toHaveAccessibleName('2 September 2026: Profit, 100 USD, 1 trade');

    const third = cell(container, '2026-09-03');
    expect(third).toHaveAttribute('data-day-result', 'loss');
    expect(third).toHaveAttribute('data-day-strength', '1');
    expect(third).toHaveTextContent('▼');

    const fourth = cell(container, '2026-09-04');
    expect(fourth).toHaveAttribute('data-day-result', 'unavailable');
    expect(fourth).not.toHaveAttribute('data-day-strength');
    expect(within(fourth).getByRole('button').getAttribute('aria-label')).toContain('Result unavailable');

    expect(cell(container, '2026-09-05')).toHaveTextContent('—');
    expect(within(cell(container, '2026-09-06')).queryByRole('button')).toBeNull();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
  });

  it('turns colour strength off when the month mixes currencies', () => {
    const { container } = renderCalendar([day('2026-09-02', '100', 'USD'), day('2026-09-03', '-5', 'EUR')]);
    expect(screen.getByText('Colour strength is off this month because your days use different currencies.')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-day-strength]')).toHaveLength(0);
  });

  it('pages months with its two buttons', () => {
    const { handlers, unmount } = renderCalendar([]);
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    expect(handlers.onPreviousMonth).toHaveBeenCalledTimes(1);
    expect(handlers.onNextMonth).toHaveBeenCalledTimes(1);
    unmount();
    renderCalendar([], { canShowNextMonth: false });
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();
    expect(screen.getByText('No closed trades in September 2026.')).toBeInTheDocument();
  });
});

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-results-calendar-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const closed = (symbol: string, dayKey: string, exitPrice: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: `${dayKey}T09:00:00.000Z`, closedAt: `${dayKey}T10:00:00.000Z`, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: `${dayKey}T09:00:00.000Z` }, { type: 'exit', price: exitPrice, quantity: '1', executedAt: `${dayKey}T10:00:00.000Z` }] } as const);
const now = () => '2026-09-10T12:00:00.000Z';

describe('the Journal month calendar', () => {
  it('opens on today\'s month, lists a tapped day\'s trades and pages back', async () => {
    const db = await database();
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now());
    const september = await saveManualTrade(db, closed('BTCUSDT', '2026-09-02', '150'));
    expect((await saveManualTrade(db, closed('ETHUSDT', '2026-08-20', '90'))).ok).toBe(true);
    if (!september.ok) throw new Error('fixture');
    render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    expect(await screen.findByRole('heading', { name: 'September 2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next month' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /^2 September 2026:/ }));
    const heading = await screen.findByRole('heading', { name: 'Trades closed on 2 September 2026' });
    const panel = within(heading.closest('.kairos-results-day-trades') as HTMLElement);
    expect(await panel.findByText('BTCUSDT')).toBeInTheDocument();
    expect(panel.getByRole('link', { name: 'View trade' })).toHaveAttribute('href', `/analysis?trade=${encodeURIComponent(september.tradeId as TradeId)}`);

    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    expect(await screen.findByRole('heading', { name: 'August 2026' })).toBeInTheDocument();
    expect(document.querySelector('[data-day-key="2026-08-20"]')?.getAttribute('data-day-result')).toMatch(/^(profit|loss)$/);
    expect(screen.queryByRole('heading', { name: /^Trades closed on/ })).toBeNull();
  });

  it('says when a closed trade cannot be placed on a day', async () => {
    const db = await database();
    const { metadata, trades } = createKairosRepositories(db);
    await writeVisualPnlTimeZonePreference(metadata, 'UTC', now());
    await trades.put({ id: 'bad-close' as TradeId, symbol: 'BAD', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', openedAt: '2026-09-02T10:00:00.000Z', closedAt: '2026-09-02 14:30:00', createdAt: '2026-09-02T10:00:00.000Z', updatedAt: '2026-09-02T15:00:00.000Z' });
    render(<MemoryRouter><JournalRoute db={db} now={now} /></MemoryRouter>);
    expect(await screen.findByText('1 closed trade could not be placed on a day.')).toBeInTheDocument();
  });
});
