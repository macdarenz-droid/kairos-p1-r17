import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { saveTradeDiscipline } from '../src/application/discipline';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeId } from '../src/domain/trades';
import { CoachCard } from '../src/features/discipline/CoachCard';
import { CoachScreen } from '../src/features/discipline/CoachScreen';
import { axeViolations } from './fixtures/axe';

beforeAll(async () => { await import('../src/application/coach/loadCoachNotes'); }, 30_000);
const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-coach-list-links-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-18T12:00:00.000Z';
async function withZone(db: KairosDatabase) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now()); }
const closed = (symbol: string, exit: string, closedAt: string) => ({
  symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-01T00:00:00.000Z', closedAt,
  plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' },
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-01T00:00:00.000Z' }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
} as const);
const idOf = (saved: { ok: boolean; tradeId?: unknown }) => { if (!saved.ok) throw new Error('fixture'); return saved.tradeId as TradeId; };

/** Two trades this month marked "Moved my stop" in their review; with `stopPassed`, a first trade that closed beyond its stop. */
async function repeatedMistake(db: KairosDatabase, scope: 'real' | 'practice', stopPassed = false) {
  await withZone(db);
  const save = scope === 'practice' ? savePracticeTrade : saveManualTrade;
  if (stopPassed) idOf(await save(db, closed('BTCUSDT', '90', '2026-09-02T10:00:00.000Z')));
  for (const [symbol, at] of [['ETHUSDT', '2026-09-05T10:00:00.000Z'], ['SOLUSDT', '2026-09-08T10:00:00.000Z']] as const) {
    const id = idOf(await save(db, closed(symbol, '110', at)));
    if (!(await saveTradeDiscipline(db, { tradeId: id, scope, half: 'review', answers: [], mistakeIds: ['moved-stop'], note: '' })).ok) throw new Error('fixture');
  }
}

const MISTAKE = 'You marked "Moved my stop" on 2 trades this month.';
const JOURNAL_LINK = 'See all your trades marked "Moved my stop"';
const PRACTICE_LINK = 'See all your practice trades marked "Moved my stop"';
const listLinks = (root: HTMLElement) => within(root).queryAllByRole('link', { name: /^See all your (practice )?trades marked/ });

function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}
const screenOf = (db: KairosDatabase, scope: 'real' | 'practice') =>
  render(<MemoryRouter><CoachScreen db={db} scope={scope} now={now} renderTradeLink={id => <a href={`/analysis?trade=${id}`}>View trade</a>} /></MemoryRouter>);

describe('T-060e (D262) the coach links a repeated mistake to the list of its trades', () => {
  it('on the coach page: the Journal coach opens /journal?mistake=<id>, and only that note has the link', async () => {
    const db = await database();
    await repeatedMistake(db, 'real', true);
    const { container } = screenOf(db, 'real');
    const note = await screen.findByRole('article', { name: MISTAKE });
    const link = within(note).getByRole('link', { name: JOURNAL_LINK });
    expect(link.getAttribute('href')).toBe('/journal?mistake=moved-stop');
    // The trades behind the note keep their own links; the list link is the one more.
    expect(within(note).getAllByRole('link', { name: 'View trade' })).toHaveLength(2);
    for (const other of screen.getAllByRole('article').filter(item => item !== note)) expect(listLinks(other)).toHaveLength(0);
    expect(screen.getAllByRole('article').length).toBeGreaterThan(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('on the practice coach page: opens /practice?mistake=<id>', async () => {
    const db = await database();
    await repeatedMistake(db, 'practice');
    screenOf(db, 'practice');
    const note = await screen.findByRole('article', { name: MISTAKE });
    expect(within(note).getByRole('link', { name: PRACTICE_LINK }).getAttribute('href')).toBe('/practice?mistake=moved-stop');
    expect(within(note).queryByRole('link', { name: JOURNAL_LINK })).toBeNull();
  });

  it('on the coach card: a repeated mistake shown first opens its list in place, in the Journal and in Practice', async () => {
    for (const [scope, name, href] of [['real', JOURNAL_LINK, '/journal?mistake=moved-stop'], ['practice', PRACTICE_LINK, '/practice?mistake=moved-stop']] as const) {
      const db = await database();
      await repeatedMistake(db, scope);
      const start = scope === 'practice' ? '/practice' : '/journal';
      const { container } = render(<MemoryRouter initialEntries={[start]}><Where /><CoachCard db={db} scope={scope} now={now} refreshRevision={0} disciplineRevision={0} /></MemoryRouter>);
      const card = await screen.findByRole('region', { name: scope === 'practice' ? 'Your practice coach' : 'Your coach' });
      await waitFor(() => expect(within(card).getByText(MISTAKE)).toBeTruthy());
      const link = within(card).getByRole('link', { name });
      expect(link.getAttribute('href')).toBe(href);
      expect(await axeViolations(container)).toEqual([]);
      fireEvent.click(link);
      expect(screen.getByTestId('where').textContent).toBe(href);
      cleanup();
    }
  });

  it('on the coach card: no list link when the first note is not a repeated mistake, and a plain link without a router', async () => {
    const db = await database();
    await repeatedMistake(db, 'real', true);
    render(<MemoryRouter><CoachCard db={db} scope="real" now={now} refreshRevision={0} disciplineRevision={0} /></MemoryRouter>);
    const card = await screen.findByRole('region', { name: 'Your coach' });
    await waitFor(() => expect(within(card).getByText('1 trade this month closed beyond its stop.')).toBeTruthy());
    expect(listLinks(card)).toHaveLength(0);
    cleanup();

    const other = await database();
    await repeatedMistake(other, 'real');
    render(<CoachCard db={other} scope="real" now={now} refreshRevision={0} disciplineRevision={0} />);
    const link = await waitFor(() => within(screen.getByRole('region', { name: 'Your coach' })).getByRole('link', { name: JOURNAL_LINK }));
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/journal?mistake=moved-stop');
  });
});
