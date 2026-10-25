import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveStrategy } from '../src/application/discipline/strategies';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeId } from '../src/domain/trades';
import { PatternsScreen } from '../src/features/patterns/PatternsScreen';
import { axeViolations } from './fixtures/axe';

beforeAll(async () => { await import('../src/features/patterns/PatternsScreen'); }, 30_000);
const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-patterns-list-links-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = '2026-09-18T12:00:00.000Z';
const clock = () => now;
async function withZone(db: KairosDatabase) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now); }
const closed = (symbol: string, side: 'long' | 'short', exit: string, day: string) => ({
  symbol, marketType: 'crypto', side, status: 'closed', grossPnlCurrency: 'USDT', openedAt: `2026-09-${day}T09:00:00.000Z`, closedAt: `2026-09-${day}T10:00:00.000Z`,
  executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: `2026-09-${day}T09:00:00.000Z` }, { type: 'exit', price: exit, quantity: '1', executedAt: `2026-09-${day}T10:00:00.000Z` }],
} as const);
const idOf = (saved: { ok: boolean; tradeId?: unknown }) => { if (!saved.ok) throw new Error('fixture'); return saved.tradeId as TradeId; };

/** Two long trades and a short one; the first long one named "Breakout". Returns the strategy's id. */
async function fixture(db: KairosDatabase, scope: 'real' | 'practice'): Promise<string> {
  await withZone(db);
  const save = scope === 'practice' ? savePracticeTrade : saveManualTrade;
  const first = idOf(await save(db, closed('BTCUSDT', 'long', '110', '01')));
  idOf(await save(db, closed('ETHUSDT', 'long', '90', '02')));
  idOf(await save(db, closed('SOLUSDT', 'short', '90', '03')));
  const strategy = await saveStrategy(db, { id: null, name: 'Breakout', rules: [{ id: 'stop', kind: 'stop-planned' }] });
  if (!strategy.ok) throw new Error('fixture');
  if (!(await saveTradeDiscipline(db, { tradeId: first, scope, half: 'strategy', strategyId: strategy.strategy.id, answers: [] })).ok) throw new Error('fixture');
  return strategy.strategy.id;
}

const region = (name: string) => screen.getByRole('region', { name });
/** The group of a pattern whose label is `label`. */
const group = (pattern: string, label: string) => within(region(pattern)).getAllByRole('listitem').find(item => item.querySelector('.kairos-pattern__label')?.textContent === label)!;
function Where() {
  const location = useLocation();
  return <p data-testid="where">{location.pathname + location.search}</p>;
}

describe('T-060e (D262) Patterns link Long, Short and each strategy to the matching list', () => {
  it('in the Journal: ?side=long, ?side=short and ?strategy=<id>; no link for a group the list cannot filter by', async () => {
    const db = await database();
    const strategyId = await fixture(db, 'real');
    const { container } = render(<MemoryRouter initialEntries={['/patterns']}><Where /><PatternsScreen db={db} scope="real" now={clock} /></MemoryRouter>);
    await screen.findByRole('region', { name: 'All your trades' });

    const long = within(group('Long or short', 'Long (you bought first)')).getByRole('link', { name: 'See all your long trades' });
    expect(long.getAttribute('href')).toBe('/journal?side=long');
    expect(within(group('Long or short', 'Short (you sold first)')).getByRole('link', { name: 'See all your short trades' }).getAttribute('href')).toBe('/journal?side=short');
    expect(within(group('By strategy', 'Breakout')).getByRole('link', { name: 'See all your trades with the strategy "Breakout"' }).getAttribute('href')).toBe(`/journal?strategy=${strategyId}`);

    expect(within(group('By strategy', 'No strategy named')).queryAllByRole('link')).toHaveLength(0);
    for (const name of ['All your trades', 'Keeping your plan', 'After a win or a loss', 'By day of the week', 'By time of day']) {
      expect(within(region(name)).queryAllByRole('link')).toHaveLength(0);
    }
    expect(await axeViolations(container)).toEqual([]);

    fireEvent.click(long);
    expect(screen.getByTestId('where').textContent).toBe('/journal?side=long');
  });

  it('in Practice: the practice list, /practice?side=… and /practice?strategy=<id>', async () => {
    const db = await database();
    const strategyId = await fixture(db, 'practice');
    render(<MemoryRouter><PatternsScreen db={db} scope="practice" now={clock} /></MemoryRouter>);
    await screen.findByRole('region', { name: 'All your practice trades' });
    expect(within(group('Long or short', 'Long (you bought first)')).getByRole('link', { name: 'See all your long practice trades' }).getAttribute('href')).toBe('/practice?side=long');
    expect(within(group('Long or short', 'Short (you sold first)')).getByRole('link', { name: 'See all your short practice trades' }).getAttribute('href')).toBe('/practice?side=short');
    expect(within(group('By strategy', 'Breakout')).getByRole('link', { name: 'See all your practice trades with the strategy "Breakout"' }).getAttribute('href')).toBe(`/practice?strategy=${strategyId}`);
    for (const name of ['By day of the week', 'By time of day', 'After a win or a loss']) expect(within(region(name)).queryAllByRole('link')).toHaveLength(0);
  });

  it('works without a router: plain links to the same addresses', async () => {
    const db = await database();
    await fixture(db, 'real');
    render(<PatternsScreen db={db} scope="real" now={clock} />);
    await screen.findByRole('region', { name: 'All your trades' });
    const link = within(group('Long or short', 'Short (you sold first)')).getByRole('link', { name: 'See all your short trades' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/journal?side=short');
  });
});
