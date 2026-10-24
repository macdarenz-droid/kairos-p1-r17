import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { saveStrategy } from '../src/application/discipline/strategies';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { KAIROS_DEFAULT_DISCIPLINE_LISTS, type Strategy, type TradeDisciplineRecord } from '../src/domain/discipline';
import { TradeForm, TRADE_FORM_MODE_STORAGE_KEY, type TradeFormKind } from '../src/features/journal/TradeForm';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-before-you-trade-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { cleanup(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const steps = KAIROS_DEFAULT_DISCIPLINE_LISTS.checklist;
const mount = (db: KairosDatabase, kind: TradeFormKind = 'journal', mode: 'quick' | 'full' = 'full') => {
  localStorage.setItem(TRADE_FORM_MODE_STORAGE_KEY, mode);
  return render(<TradeForm db={db} kind={kind} onSaved={async () => undefined} />);
};
function planned(status: 'draft' | 'open' = 'draft'): void {
  type(/^Symbol/, 'BTCUSDT'); type(/^Market/, 'crypto'); type(/^Direction/, 'long'); type(/^Status/, status);
  if (status === 'open') type(/^Opened/, '2026-10-24T09:00');
  type('Currency code', 'USDT'); type('Planned entry', '100'); type('Planned stop', '95');
}
async function strategy(db: KairosDatabase): Promise<Strategy> {
  const saved = await saveStrategy(db, { id: null, name: 'Careful', rules: [{ id: 'check', kind: 'checklist-complete' }, { id: 'wait', kind: 'written', label: 'I wait for the close' }] });
  if (!saved.ok) throw new Error('fixture');
  return saved.strategy;
}
const checklist = async () => screen.findByRole('group', { name: /Before you trade/ });
const records = async (db: KairosDatabase): Promise<TradeDisciplineRecord[]> => db.tradeDiscipline.toArray();
const marks = () => document.querySelector('.kairos-trade-form__strategy-marks')?.textContent;

describe('T-057b "Before you trade" in the form', () => {
  for (const kind of ['journal', 'practice'] as const) {
    it(`saves the ticked steps and written rules with the trade in one record (${kind})`, async () => {
      const db = await database();
      const chosen = await strategy(db);
      mount(db, kind);
      planned();
      const list = await checklist();
      fireEvent.click(await within(list).findByRole('checkbox', { name: steps[0]!.label }));
      fireEvent.change(await screen.findByLabelText(/^Strategy/), { target: { value: chosen.id } });
      fireEvent.click(await screen.findByRole('checkbox', { name: 'I wait for the close' }));
      fireEvent.click(screen.getByRole('button', { name: kind === 'practice' ? 'Save practice trade' : 'Save trade' }));
      await screen.findByRole('status');
      const [trade] = await db.trades.toArray();
      const [record] = await records(db);
      expect(record).toMatchObject({
        tradeId: trade!.id, checklistCompletedAt: trade!.createdAt,
        preTradeChecklist: steps.map((step, index) => ({ itemId: step.id, label: step.label, answer: index === 0 ? 'yes' : 'no' })),
        strategy: { strategyId: chosen.id, answers: [{ ruleId: 'wait', answer: 'yes' }] },
      });
      // The ticks clear with the form.
      type(/^Status/, 'draft');
      expect(within(await checklist()).getAllByRole('checkbox').every(box => !(box as HTMLInputElement).checked)).toBe(true);
    });
  }

  it('saves no checklist when nothing is ticked, and no record at all without a strategy', async () => {
    const db = await database();
    mount(db);
    planned('open');
    await checklist();
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await screen.findByRole('status');
    expect(await db.trades.count()).toBe(1);
    expect(await records(db)).toEqual([]);
  });

  it('Quick log and a closed trade say they were logged after the trade, and save no checklist', async () => {
    const db = await database();
    mount(db, 'journal', 'quick');
    expect(screen.getByRole('region', { name: 'Before you trade' })).toHaveTextContent('Logged after the trade, so no checklist.');
    expect(screen.queryByRole('group', { name: /Before you trade/ })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'All details' }));
    planned();
    await checklist();
    type(/^Status/, 'closed');
    expect(screen.getByRole('region', { name: 'Before you trade' })).toHaveTextContent('Logged after the trade, so no checklist.');
    expect(screen.queryByRole('group', { name: /Before you trade/ })).toBeNull();
  });

  it('the strategy check follows the ticks: every step is ✓, a missed step is ✗', async () => {
    const db = await database();
    const chosen = await strategy(db);
    const { container } = mount(db);
    planned();
    fireEvent.change(await screen.findByLabelText(/^Strategy/), { target: { value: chosen.id } });
    const list = await checklist();
    expect(marks()).toBe('??');
    fireEvent.click(await within(list).findByRole('checkbox', { name: steps[0]!.label }));
    expect(marks()).toBe('✗?');
    for (const step of steps.slice(1)) fireEvent.click(within(list).getByRole('checkbox', { name: step.label }));
    expect(marks()).toBe('✓?');
    const rule = screen.getByRole('checkbox', { name: 'I wait for the close' });
    fireEvent.click(rule);
    expect(marks()).toBe('✓✓');
    expect(rule).toBeChecked();
    expect(await axeViolations(container)).toEqual([]);
  });
});
