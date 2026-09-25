import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { loadTradeDiscipline } from '../src/application/discipline';
import { deleteStrategy, saveStrategy } from '../src/application/discipline/strategies';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { Strategy } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';
import { TradeForm } from '../src/features/journal/TradeForm';

const names: string[] = [];
async function database() { const name = `kairos-trade-form-strategy-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); try { window.localStorage.clear(); } catch { /* ignore */ } for (const name of names.splice(0)) await Dexie.delete(name); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

async function breakout(db: KairosDatabase): Promise<Strategy> {
  const saved = await saveStrategy(db, { id: null, name: 'Breakout', rules: [
    { id: 'risk', kind: 'max-risk', amount: '50', currency: 'USDT' }, { id: 'reward', kind: 'min-reward-to-risk', ratio: '2' },
    { id: 'stop', kind: 'stop-planned' }, { id: 'wait', kind: 'written', label: 'I wait for a close above the line' },
  ] });
  if (!saved.ok) throw new Error(saved.reason);
  return saved.strategy;
}
async function checklistOnly(db: KairosDatabase): Promise<Strategy> {
  const saved = await saveStrategy(db, { id: null, name: 'Careful', rules: [{ id: 'check', kind: 'checklist-complete' }] });
  if (!saved.ok) throw new Error(saved.reason);
  return saved.strategy;
}
function fillDraft(quantity = '10') {
  type(/^Symbol/, 'BTCUSDT');
  type(/^Market/, 'crypto');
  type(/^Direction/, 'long');
  type(/^Status/, 'draft');
  type('Currency code', 'USDT');
  type('Planned entry', '100');
  type('Planned stop', '90');
  type('Planned target', '130');
  type('Planned quantity', quantity);
}
const chooseStrategy = async (name: string) => { fireEvent.change(await screen.findByLabelText(/^Strategy/), { target: { value: screen.getByRole('option', { name }).getAttribute('value') } }); };
const marks = () => document.querySelector('.kairos-trade-form__strategy-marks')!.textContent;
const save = async (name = 'Save trade') => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };

describe('T-040h a strategy on the trade form', () => {
  it('says when there are no strategies, and saves a trade without one', async () => {
    const db = await database();
    render(<TradeForm db={db} kind="journal" onSaved={async () => {}} />);
    expect(await screen.findByText('No strategies yet. Write your rules in More → Strategies, then choose one here.')).toBeInTheDocument();
    fillDraft();
    await save();
    expect(await screen.findByText('Trade saved to your journal.')).toBeInTheDocument();
    expect(await db.tradeDiscipline.count()).toBe(0);
  });

  it('shows which rules the trade keeps and breaks before saving, then saves the strategy with it', async () => {
    const db = await database();
    await breakout(db);
    render(<TradeForm db={db} kind="journal" onSaved={async () => {}} />);
    fillDraft();
    await chooseStrategy('Breakout');
    expect(screen.getByText('This trade breaks 1 of your 4 Breakout rules.')).toBeInTheDocument();
    expect(screen.getByText('Risk: 100 USDT is more than your most, 50 USDT.')).toBeInTheDocument();
    expect(screen.getByText('I wait for a close above the line: not ticked yet.')).toBeInTheDocument();
    expect(screen.getByText('You can still save this trade.')).toBeInTheDocument();
    expect(marks()).toBe('✗✓✓?');
    expect(screen.getByRole('button', { name: 'Save trade' })).toHaveAccessibleDescription(expect.stringContaining('breaks 1 of your 4'));
    type('Planned quantity', '5');
    expect(screen.getByText('This trade keeps 3 of your 4 Breakout rules so far; 1 still to check.')).toBeInTheDocument();

    await save();
    expect(await screen.findByText('Trade saved to your journal.')).toBeInTheDocument();
    const [trade] = await db.trades.toArray();
    const loaded = await loadTradeDiscipline(db, [trade!.id as TradeId]);
    expect(loaded.ok && loaded.records.get(trade!.id as TradeId)?.strategy).toMatchObject({ name: 'Breakout', revision: 1, answers: [] });
    expect(screen.getByLabelText(/^Strategy/)).toHaveValue('');
  });

  it('stays busy until the strategy is written too', async () => {
    const db = await database();
    await breakout(db);
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const real = db.transaction.bind(db) as (...args: unknown[]) => unknown;
    vi.spyOn(db, 'transaction').mockImplementation((async (...args: unknown[]) => {
      const touchesDiscipline = args.flat().some(arg => arg === 'tradeDiscipline' || (typeof arg === 'object' && arg !== null && (arg as { name?: unknown }).name === 'tradeDiscipline'));
      if (touchesDiscipline) await held;
      return real(...args);
    }) as never);
    render(<TradeForm db={db} kind="journal" onSaved={async () => {}} />);
    fillDraft('5');
    await chooseStrategy('Breakout');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await waitFor(async () => expect(await db.trades.count()).toBe(1));
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    release();
    expect(await screen.findByText('Trade saved to your journal.')).toBeInTheDocument();
    expect(await db.trades.count()).toBe(1);
  });

  it('works for a practice trade', async () => {
    const db = await database();
    await breakout(db);
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    fillDraft('5');
    await chooseStrategy('Breakout');
    await save('Save practice trade');
    await waitFor(async () => expect(await db.tradeDiscipline.count()).toBe(1));
    const [trade] = await db.trades.toArray();
    expect(trade!.source).toBe('paper');
    expect((await db.tradeDiscipline.toArray())[0]!.strategy?.name).toBe('Breakout');
  });

  it('never breaks the checklist rule when no checklist can be known', async () => {
    const db = await database();
    await checklistOnly(db);
    render(<TradeForm db={db} kind="journal" onSaved={async () => {}} />);
    await chooseStrategy('Careful');
    type(/^Status/, 'draft');
    expect(screen.getByText(/^Checklist: not ticked yet\./)).toBeInTheDocument();
    type(/^Status/, 'cancelled');
    expect(screen.getByText('Checklist: this trade was cancelled before a checklist was ticked.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    expect(marks()).toBe('?');
    expect(document.querySelector('.kairos-trade-form__strategy-note p[data-verdict="unknown"]')!.textContent).toContain("Checklist: none was saved before this trade closed, so Kairos can't check it.");
  });

  it('still saves the trade when the strategy is gone before saving', async () => {
    const db = await database();
    const strategy = await breakout(db);
    render(<TradeForm db={db} kind="journal" onSaved={async () => {}} />);
    fillDraft('5');
    await chooseStrategy('Breakout');
    expect((await deleteStrategy(db, strategy.id)).ok).toBe(true);
    await save();
    expect(await screen.findByText('Trade saved to your journal. Its strategy was not saved: choose it again on the trade card.')).toBeInTheDocument();
    expect(await db.trades.count()).toBe(1);
  });

  it('says when strategies cannot be loaded, and still saves', async () => {
    const db = await database();
    vi.spyOn(db.metadata, 'get').mockRejectedValue(new Error('storage'));
    render(<TradeForm db={db} kind="journal" onSaved={async () => {}} />);
    expect(await screen.findByText('Kairos could not load your strategies. You can still save this trade.')).toBeInTheDocument();
    fillDraft();
    await save();
    expect(await screen.findByText('Trade saved to your journal.')).toBeInTheDocument();
  });
});
