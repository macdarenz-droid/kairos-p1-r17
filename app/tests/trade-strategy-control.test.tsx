import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { JournalRoute } from '../src/app/JournalRoute';
import { PracticeRoute } from '../src/app/PracticeRoute';
import { loadTradeDiscipline, saveTradeDiscipline } from '../src/application/discipline';
import { deleteStrategy, saveStrategy, strategyDraftFrom } from '../src/application/discipline/strategies';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, runKairosAtomicWrite, type KairosDatabase } from '../src/data/database';
import type { Strategy, TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId, TradeRecord } from '../src/domain/trades';
import { TradeStrategyControl } from '../src/features/discipline/TradeStrategyControl';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-strategy-control-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const card = (symbol: string) => screen.getAllByRole('listitem').find(item => within(item).queryByText(symbol) !== null)!;
const cardButton = async (symbol: string, name: string | RegExp) => { let found: HTMLElement | null = null; await waitFor(() => { found = within(card(symbol)).getByRole('button', { name }); }); return found!; };
const idOf = (saved: { ok: boolean; tradeId?: unknown }) => { if (!saved.ok) throw new Error('fixture'); return saved.tradeId as TradeId; };
const WAIT = 'I wait for a close above the line';

async function breakout(db: KairosDatabase): Promise<Strategy> {
  const saved = await saveStrategy(db, { id: null, name: 'Breakout', rules: [
    { id: 'risk', kind: 'max-risk', amount: '50', currency: 'USDT' },
    { id: 'reward', kind: 'min-reward-to-risk', ratio: '2' },
    { id: 'stop', kind: 'stop-planned' },
    { id: 'wait', kind: 'written', label: WAIT },
  ] });
  if (!saved.ok) throw new Error('fixture');
  return saved.strategy;
}

async function journal(db: KairosDatabase, strategy: Strategy | null): Promise<TradeId> {
  const btc = idOf(await saveManualTrade(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'draft', grossPnlCurrency: 'USDT', plan: { plannedEntryPrice: '100', plannedStopPrice: '95', plannedTargetPrice: '110', plannedQuantity: '10' } }));
  await saveManualTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'short', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T07:00:00.000Z' });
  await saveManualTrade(db, { symbol: 'SOLUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }] });
  if (strategy) {
    const marked = await saveTradeDiscipline(db, { tradeId: btc, scope: 'real', half: 'strategy', strategyId: strategy.id, answers: [] });
    if (!marked.ok) throw new Error('fixture');
  }
  return btc;
}

async function saveSheet(dialog: HTMLElement) {
  await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save strategy' })); });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
}
const choose = (dialog: HTMLElement, name: string) => {
  const select = within(dialog).getByRole('combobox', { name: 'Strategy' }) as HTMLSelectElement;
  const option = within(select).getByRole('option', { name }) as HTMLOptionElement;
  fireEvent.change(select, { target: { value: option.value } });
};
const before = (a: Node, b: Node) => expect(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

describe('T-040i the trade card: its strategy, the rule check and your ticks', () => {
  it('shows the strategy on the card, draws the bars and saves ticks', async () => {
    const db = await database();
    await journal(db, await breakout(db));
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    const button = await cardButton('BTCUSDT', 'Strategy Breakout: keeps 3 of 4 rules, 1 to check');
    expect(await cardButton('ETHUSDT', 'Strategy: none chosen')).toBeTruthy();
    expect(await cardButton('SOLUSDT', 'Strategy: none chosen')).toBeTruthy();
    expect(screen.getAllByRole('listitem')).toHaveLength(3);

    fireEvent.click(button);
    const dialog = screen.getByRole('dialog', { name: 'Strategy: BTCUSDT' });
    const risk = within(dialog).getByText('Risk: 50 USDT, within your most of 50 USDT.');
    const reward = within(dialog).getByText('Reward: 2× what you risk, at least your 2×.');
    const pictures = [...dialog.querySelectorAll('.kairos-strategy-bars')];
    expect(pictures).toHaveLength(2);
    for (const [picture, sentence] of [[pictures[0]!, risk], [pictures[1]!, reward]] as const) {
      const trade = picture.querySelector('[data-bar="trade"]')!;
      const rule = picture.querySelector('[data-bar="rule"]')!;
      expect(trade.getAttribute('data-steps')).toBe('10');
      expect(rule.getAttribute('data-steps')).toBe('10');
      const words = [...picture.children].filter(child => child.tagName === 'SPAN' && !child.classList.contains('kairos-strategy-bar'));
      expect(words.map(word => word.textContent)).toEqual(['This trade', 'Your rule']);
      expect(words[0]!.nextElementSibling).toBe(trade);
      expect(words[1]!.nextElementSibling).toBe(rule);
      before(picture, sentence);
    }

    fireEvent.click(within(dialog).getByRole('checkbox', { name: WAIT }));
    await saveSheet(dialog);
    fireEvent.click(await cardButton('BTCUSDT', 'Strategy Breakout: keeps all 4 rules'));
    const again = screen.getByRole('dialog', { name: 'Strategy: BTCUSDT' });
    const box = within(again).getByRole('checkbox', { name: WAIT }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await saveSheet(again);
    expect(await cardButton('BTCUSDT', 'Strategy Breakout: breaks 1 of 4 rules')).toBeTruthy();
  });

  it('chooses a strategy for a trade and takes it off again', async () => {
    const db = await database();
    await journal(db, await breakout(db));
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('ETHUSDT', 'Strategy: none chosen'));
    let dialog = screen.getByRole('dialog', { name: 'Strategy: ETHUSDT' });
    choose(dialog, 'Breakout');
    expect(within(dialog).getByText('Save to use your Breakout rules as they are now. Then open this again to tick the rules you keep yourself.')).toBeTruthy();
    await saveSheet(dialog);
    fireEvent.click(await cardButton('ETHUSDT', /^Strategy Breakout:/));
    dialog = screen.getByRole('dialog', { name: 'Strategy: ETHUSDT' });
    choose(dialog, 'No strategy');
    expect(within(dialog).getByText('Save to take the strategy off this trade. The trade itself is not changed.')).toBeTruthy();
    await saveSheet(dialog);
    expect(await cardButton('ETHUSDT', 'Strategy: none chosen')).toBeTruthy();
  });

  it('judges an old trade by the rules it was chosen with', async () => {
    const db = await database();
    const strategy = await breakout(db);
    await journal(db, strategy);
    const changed = await saveStrategy(db, { ...strategyDraftFrom(strategy), rules: strategyDraftFrom(strategy).rules.map(rule => (rule.kind === 'max-risk' ? { ...rule, amount: '40' } : rule)) });
    expect(changed.ok && changed.strategy.revision).toBe(2);
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    expect(await cardButton('BTCUSDT', 'Strategy Breakout: keeps 3 of 4 rules, 1 to check')).toBeTruthy();
    cleanup();

    expect((await deleteStrategy(db, strategy.id)).ok).toBe(true);
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    fireEvent.click(await cardButton('BTCUSDT', 'Strategy Breakout: keeps 3 of 4 rules, 1 to check'));
    const dialog = screen.getByRole('dialog', { name: 'Strategy: BTCUSDT' });
    const kept = within(dialog).getByRole('option', { name: 'Breakout (kept on this trade)' }) as HTMLOptionElement;
    expect(kept.selected).toBe(true);
  });

  it('keeps the ticks and says so when saving fails', async () => {
    const tradeId = 'trade-1' as TradeId;
    const at = '2026-09-25T10:00:00.000Z';
    const record: TradeDisciplineRecord = {
      id: 'discipline-1' as TradeDisciplineId, tradeId, preTradeChecklist: [], postTradeReview: [], mistakes: [], note: '', checklistCompletedAt: null, reviewedAt: null, createdAt: at, updatedAt: at,
      strategy: { strategyId: 'breakout', revision: 1, name: 'Breakout', rules: [{ id: 'wait', kind: 'written', label: WAIT }], answers: [], linkedAt: at },
    };
    const onSaved = vi.fn();
    const save = vi.fn().mockResolvedValue({ ok: false, type: 'storage-error', reason: 'discipline-save-failed' });
    render(<TradeStrategyControl symbol="BTCUSDT" tradeId={tradeId} scope="real" strategies={[]} record={record}
      check={{ results: [{ kind: 'written', ruleId: 'wait', verdict: 'unknown', reason: 'not-answered', label: WAIT }], kept: 0, broken: 0, unknown: 1, total: 1 }} save={save} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole('button', { name: 'Strategy Breakout: keeps 0 of 1 rule, 1 to check' }));
    const dialog = screen.getByRole('dialog', { name: 'Strategy: BTCUSDT' });
    const box = within(dialog).getByRole('checkbox', { name: WAIT }) as HTMLInputElement;
    fireEvent.click(box);
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save strategy' })); });
    expect(await within(dialog).findByRole('alert')).toHaveProperty('textContent', 'Kairos could not save the strategy for this trade. Your choices are kept so you can try again.');
    expect(box.checked).toBe(true);
    expect(save).toHaveBeenCalledWith({ tradeId, scope: 'real', half: 'strategy', strategyId: 'breakout', answers: [{ itemId: 'wait', answer: 'yes' }] });
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('works on paper and replay trades in Practice', async () => {
    const db = await database();
    await breakout(db);
    const paper = idOf(await savePracticeTrade(db, { symbol: 'ETHUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T09:00:00.000Z', closedAt: '2026-09-18T10:00:00.000Z', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-09-18T09:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: '2026-09-18T10:00:00.000Z' }] }));
    const replay: TradeRecord = { id: 'replay-1' as TradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'replay', grossPnlCurrency: 'USDT', openedAt: '2026-09-18T11:00:00.000Z', closedAt: '2026-09-18T12:00:00.000Z', createdAt: '2026-09-18T11:00:00.000Z', updatedAt: '2026-09-18T12:00:00.000Z' };
    await runKairosAtomicWrite(db, ['trades'], async ({ repositories }) => { await repositories.trades.put(replay); });
    render(<MemoryRouter><PracticeRoute db={db} /></MemoryRouter>);
    for (const symbol of ['ETHUSDT', 'BTCUSDT']) {
      fireEvent.click(await cardButton(symbol, 'Strategy: none chosen'));
      const dialog = screen.getByRole('dialog', { name: `Strategy: ${symbol}` });
      choose(dialog, 'Breakout');
      await saveSheet(dialog);
      expect(await cardButton(symbol, /^Strategy Breakout:/)).toBeTruthy();
    }
    const loaded = await loadTradeDiscipline(db, [paper, replay.id]);
    expect(loaded.ok && [...loaded.records.values()].map(item => item.strategy?.name)).toEqual(['Breakout', 'Breakout']);
  });

  it('shows no strategy button when there are no strategies and no marks', async () => {
    const db = await database();
    await journal(db, null);
    render(<MemoryRouter><JournalRoute db={db} /></MemoryRouter>);
    await cardButton('ETHUSDT', 'Before you trade: not done yet');
    for (const symbol of ['BTCUSDT', 'ETHUSDT', 'SOLUSDT']) expect(within(card(symbol)).queryByRole('button', { name: /^Strategy/ })).toBeNull();
  });
});
