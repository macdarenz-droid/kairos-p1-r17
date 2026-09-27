import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadCoachNotes } from '../src/application/coach/loadCoachNotes';
import { loadTradePatterns } from '../src/application/patterns/loadTradePatterns';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { CoachScreen } from '../src/features/discipline/CoachScreen';
import { PatternsScreen } from '../src/features/patterns/PatternsScreen';
import { axeViolations } from './fixtures/axe';

vi.mock('../src/application/coach/loadCoachNotes', async original => {
  const actual = await original<typeof import('../src/application/coach/loadCoachNotes')>();
  return { ...actual, loadCoachNotes: vi.fn(actual.loadCoachNotes) };
});
vi.mock('../src/application/patterns/loadTradePatterns', async original => {
  const actual = await original<typeof import('../src/application/patterns/loadTradePatterns')>();
  return { ...actual, loadTradePatterns: vi.fn(actual.loadTradePatterns) };
});

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-insight-kit-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.mocked(loadCoachNotes).mockClear(); vi.mocked(loadTradePatterns).mockClear(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = '2026-09-18T12:00:00.000Z';
const clock = () => now;
async function withZone(db: KairosDatabase) { await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now); }
// Traded 2 against a plan of 1: a closed trade that gives the coach a note and the patterns a card.
const oversized = {
  symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-01T00:00:00.000Z', closedAt: '2026-09-10T00:00:00.000Z',
  plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedQuantity: '1' },
  executions: [{ type: 'entry', price: '100', quantity: '2', executedAt: '2026-09-01T00:00:00.000Z' }, { type: 'exit', price: '110', quantity: '2', executedAt: '2026-09-10T00:00:00.000Z' }],
} as const;

const coach = (db: KairosDatabase, scope: 'real' | 'practice') => render(<MemoryRouter><CoachScreen db={db} scope={scope} now={clock} renderTradeLink={id => <a href={`/analysis?trade=${id}`}>View trade</a>} /></MemoryRouter>);
const patterns = (db: KairosDatabase, scope: 'real' | 'practice') => render(<MemoryRouter><PatternsScreen db={db} scope={scope} now={clock} /></MemoryRouter>);

const SCREENS = [
  { name: 'coach', scope: 'real', mount: coach, title: 'Your coach', intro: "Your coach points out where this month's trades went against your own plan, rules or goals.", full: 'It never tells you what to buy or sell, and it never guesses' },
  { name: 'coach', scope: 'practice', mount: coach, title: 'Your practice coach', intro: "Your practice coach points out where this month's practice trades went against your plan, strategy or reviews.", full: 'Practice trades never count in your Journal.' },
  { name: 'patterns', scope: 'real', mount: patterns, title: 'Your patterns', intro: 'Your patterns show what repeats in the trades you closed in the last 90 days.', full: 'they never predict a price or tell you what to buy or sell' },
  { name: 'patterns', scope: 'practice', mount: patterns, title: 'Your practice patterns', intro: 'Your practice patterns show what repeats in the practice trades you closed in the last 90 days.', full: 'They describe your own past practice only' },
] as const;

describe('T-049i Coach and Patterns on the kit', () => {
  it.each(SCREENS)('$name ($scope): the insight header, a one-sentence intro and "How this works" with the full text', async ({ scope, mount, title, intro, full }) => {
    const db = await database();
    await withZone(db);
    const { container } = mount(db, scope);
    const heading = screen.getByRole('heading', { level: 1, name: title });
    expect(heading.closest('header')).toHaveAttribute('data-tone', 'insight');
    const introLine = screen.getByText(intro);
    expect(introLine.textContent!.split(/[.!?](\s|$)/).filter(part => part && part.trim()).length).toBe(1);
    expect(screen.queryByText(full, { exact: false })).toBeNull();
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'How this works' }));
    const sheet = screen.getByRole('dialog', { name: 'How this works' });
    expect(sheet).toHaveTextContent(full);
    expect(await axeViolations(document.body)).toEqual([]);
  });

  it('coach: loading, then a failed load with "Try again" that loads the notes', async () => {
    const db = await database();
    await withZone(db);
    await saveManualTrade(db, oversized);
    vi.mocked(loadCoachNotes).mockRejectedValueOnce(new Error('storage'));
    coach(db, 'real');
    expect(screen.getByRole('status')).toHaveTextContent('Loading your coach…');
    const message = await screen.findByText('Kairos could not load your coach. Your trades are not affected.');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(within(message.parentElement!).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { level: 2, name: '1 trade this month was bigger than you planned.' })).toBeInTheDocument();
    expect(screen.queryByText('Kairos could not load your coach. Your trades are not affected.')).toBeNull();
    expect(loadCoachNotes).toHaveBeenCalledTimes(2);
  });

  it('patterns: loading, then a failed load with "Try again" that loads the patterns', async () => {
    const db = await database();
    await withZone(db);
    await saveManualTrade(db, oversized);
    vi.mocked(loadTradePatterns).mockRejectedValueOnce(new Error('storage'));
    patterns(db, 'real');
    expect(screen.getByRole('status')).toHaveTextContent('Loading your patterns…');
    const message = await screen.findByText('Kairos could not load your patterns. Your trades are not affected.');
    expect(screen.queryByRole('alert')).toBeNull();
    fireEvent.click(within(message.parentElement!).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'All your trades' })).toBeInTheDocument();
    expect(loadTradePatterns).toHaveBeenCalledTimes(2);
  });
});
