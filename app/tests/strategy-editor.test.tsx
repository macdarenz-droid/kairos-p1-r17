import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadStrategies, saveStrategy, strategyDraftFrom, type StrategyDraft } from '../src/application/discipline/strategies';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { Strategy } from '../src/domain/discipline';
import { StrategyEditor } from '../src/features/discipline/StrategyEditor';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-strategy-editor-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const empty: StrategyDraft = { id: null, name: '', rules: [] };
function mount(db: KairosDatabase, initial: StrategyDraft = empty, save = (draft: StrategyDraft) => saveStrategy(db, draft)) {
  const onSaved = vi.fn<(strategy: Strategy) => void>(), onCancel = vi.fn();
  render(<StrategyEditor initial={initial} save={save} onSaved={onSaved} onCancel={onCancel} />);
  return { onSaved, onCancel };
}
const type = (label: RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const tick = (label: string) => fireEvent.click(screen.getByRole('checkbox', { name: label }));
const submit = async () => {
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save strategy' })); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Save strategy' })).not.toHaveAttribute('aria-busy'), { timeout: 3000 });
};
const stored = async (db: KairosDatabase) => { const loaded = await loadStrategies(db); return loaded.ok ? loaded.strategies : null; };

async function saveBreakout(db: KairosDatabase): Promise<Strategy> {
  const result = await saveStrategy(db, { id: null, name: 'Breakout', rules: [
    { id: 'risk', kind: 'max-risk', amount: '50', currency: 'USDT' }, { id: 'reward', kind: 'min-reward-to-risk', ratio: '2' }, { id: 'markets', kind: 'markets', symbols: 'BTCUSDT' },
  ] });
  if (!result.ok) throw new Error(result.reason);
  return result.strategy;
}

describe('T-040f the strategy editor', () => {
  it('writes a new strategy with checked and written rules, and shows the reward as two bars', async () => {
    const db = await database();
    const { onSaved } = mount(db);
    expect(screen.getByRole('heading', { name: 'New strategy' })).toHaveFocus();
    type(/^Name/, 'Breakout');
    tick('Most I risk on one trade');
    type(/^Amount/, '50');
    type(/^Currency/, 'usdt');
    tick('Least I aim to make for what I risk');
    type(/^Times what you risk/, '2');
    expect(screen.getByText('For every 1 you risk, you aim to make 2.')).toBeInTheDocument();
    const risk = document.querySelector('[data-bar="risk"]')!, reward = document.querySelector('[data-bar="reward"]')!;
    expect(risk.getAttribute('data-steps')).toBe('5');
    expect(reward.getAttribute('data-steps')).toBe('10');
    expect(risk.previousElementSibling?.textContent).toBe('Risk');
    expect(reward.previousElementSibling?.textContent).toBe('Reward');
    for (const bad of ['0', '-2']) {
      type(/^Times what you risk/, bad);
      expect(document.querySelector('[data-bar]')).toBeNull();
      expect(screen.queryByText(/^For every 1 you risk/)).toBeNull();
    }
    type(/^Times what you risk/, '2');
    tick('Trade only these markets');
    type(/^Markets/, 'btc/usdt, ETHUSDT');
    fireEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    type(/^Rule 1/, 'I wait for a close above the line');
    await submit();
    expect(onSaved).toHaveBeenCalledTimes(1);
    const saved = onSaved.mock.calls[0]![0];
    expect(saved.revision).toBe(1);
    expect(saved.rules.map(rule => rule.kind)).toEqual(['max-risk', 'min-reward-to-risk', 'markets', 'written']);
    expect(saved.rules[0]).toMatchObject({ amount: '50', currency: 'USDT' });
    expect(saved.rules[2]).toMatchObject({ symbols: ['BTCUSDT', 'ETHUSDT'] });
    expect(await stored(db)).toEqual([saved]);
  });

  it.each([
    ['no rule', () => { type(/^Name/, 'Plan'); }, 'Choose at least one rule.', null],
    ['no name', () => { tick('Plan a stop before every trade'); }, 'Give your strategy a name.', /^Name/],
    ['a bad amount', () => { type(/^Name/, 'Plan'); tick('Most I risk on one trade'); type(/^Amount/, 'abc'); type(/^Currency/, 'USDT'); }, 'Use an amount above 0, like 50.', /^Amount/],
    ['a bad currency', () => { type(/^Name/, 'Plan'); tick('Most I risk on one trade'); type(/^Amount/, '50'); type(/^Currency/, 'US D'); }, 'Use a currency code such as USDT.', /^Currency/],
    ['no market', () => { type(/^Name/, 'Plan'); tick('Trade only these markets'); }, 'Add at least one market, for example BTCUSDT, and at most 20.', /^Markets/],
    ['an empty written rule', () => { type(/^Name/, 'Plan'); fireEvent.click(screen.getByRole('button', { name: 'Add a rule' })); }, 'Each rule you tick yourself needs some words. Fill it in or remove it.', /^Rule 1/],
  ] as const)('refuses %s in plain words and stores nothing', async (_label, fill, message, field) => {
    const db = await database();
    mount(db);
    fill();
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent(message);
    if (field) {
      await waitFor(() => expect(screen.getByLabelText(field)).toHaveFocus());
      expect(screen.getByLabelText(field)).toHaveAttribute('aria-invalid', 'true');
    }
    expect(await stored(db)).toEqual([]);
  });

  it('refuses a second strategy with the same name', async () => {
    const db = await database();
    await saveBreakout(db);
    mount(db);
    type(/^Name/, 'breakout');
    tick('Plan a stop before every trade');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('You already have a strategy with this name. Choose another name.');
    expect(await stored(db)).toHaveLength(1);
  });

  it('changes a saved strategy, keeping its rule ids', async () => {
    const db = await database();
    const breakout = await saveBreakout(db);
    const { onSaved } = mount(db, strategyDraftFrom(breakout));
    expect(screen.getByRole('heading', { name: 'Change Breakout' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Most I risk on one trade' })).toBeChecked();
    expect(screen.getByLabelText(/^Amount/)).toHaveValue('50');
    expect(screen.getByLabelText(/^Times what you risk/)).toHaveValue('2');
    expect(screen.getByLabelText(/^Markets/)).toHaveValue('BTCUSDT');
    tick('Trade only these markets');
    await submit();
    const saved = onSaved.mock.calls[0]![0];
    expect(saved.revision).toBe(2);
    expect(saved.rules.map(rule => rule.id)).toEqual(['risk', 'reward']);
  });

  it('keeps focus when a written rule is removed', async () => {
    const db = await database();
    mount(db);
    fireEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    type(/^Rule 1/, 'First');
    fireEvent.click(screen.getByRole('button', { name: 'Add a rule' }));
    type(/^Rule 2/, 'Second');
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
    await waitFor(() => expect(screen.getByLabelText(/^Rule 1/)).toHaveFocus());
    expect(screen.getByLabelText(/^Rule 1/)).toHaveValue('Second');
    fireEvent.click(screen.getByRole('button', { name: 'Remove rule 1' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Add a rule' })).toHaveFocus());
  });

  it('cancels without storing anything', async () => {
    const db = await database();
    const { onCancel } = mount(db);
    type(/^Name/, 'Plan');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(await stored(db)).toEqual([]);
  });

  it('says when saving failed, and keeps the values', async () => {
    const db = await database();
    mount(db, empty, async () => ({ ok: false, type: 'storage-error', reason: 'strategies-save-failed' }));
    type(/^Name/, 'Plan');
    tick('Plan a stop before every trade');
    await submit();
    expect(screen.getByRole('alert')).toHaveTextContent('Kairos could not save this strategy. Your saved strategies were not changed.');
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Plan');
  });
});
