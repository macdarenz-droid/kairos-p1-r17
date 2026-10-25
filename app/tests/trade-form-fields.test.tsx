import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { previewTradeStrategyCheck } from '../src/application/discipline/strategyCheck';
import { getJournalHistoryEntry } from '../src/application/journal';
import { createEmptyManualTradeDraft } from '../src/application/trades';
import type { StrategyRuleId } from '../src/domain/discipline';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { DecimalString, TradeId } from '../src/domain/trades';
import { TradeForm, TRADE_FORM_MODE_STORAGE_KEY, type TradeFormKind } from '../src/features/journal/TradeForm';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
async function database(): Promise<KairosDatabase> {
  const name = `kairos-form-fields-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { cleanup(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const mount = (db: KairosDatabase, kind: TradeFormKind = 'journal', mode: 'quick' | 'full' = 'full') => {
  localStorage.setItem(TRADE_FORM_MODE_STORAGE_KEY, mode);
  return render(<TradeForm db={db} kind={kind} onSaved={async () => undefined} />);
};
const save = (kind: TradeFormKind = 'journal') => fireEvent.click(screen.getByRole('button', { name: kind === 'practice' ? 'Save practice trade' : 'Save trade' }));

/** All details: a planned e-mini trade with every new field. */
function fullDetails(): void {
  type(/Symbol/, 'ESZ6');
  type(/Market/, 'futures');
  type(/Direction/, 'long');
  type(/Status/, 'draft');
  type('Currency code', 'USD');
  type(/Each point is worth/, '50');
  type(/Where you traded/, '  CME   Globex ');
  type(/Leverage/, '10');
  type(/^Tags/, 'breakout, London  open, Breakout, ');
  type(/Why I'm taking it/, ' Retest of the high. ');
  type(/Planned entry/, '5000');
}

describe('T-056c the new trade fields on the form', () => {
  for (const kind of ['journal', 'practice'] as const) {
    it(`saves each new field, written one way (${kind})`, async () => {
      const db = await database();
      mount(db, kind);
      fullDetails();
      save(kind);
      await screen.findByRole('status');
      const [trade] = await db.trades.toArray();
      expect(trade).toMatchObject({ source: kind === 'practice' ? 'paper' : 'manual', contractSize: '50', exchange: 'CME Globex', tags: ['breakout', 'London open'], leverage: '10' });
      const [plan] = await db.tradePlans.toArray();
      expect(plan).toMatchObject({ reason: 'Retest of the high.', plannedEntryPrice: '5000' });
      // Nothing new is remembered between trades.
      for (const label of [/Where you traded/, /Leverage/, /^Tags/, /Why I'm taking it/]) expect(screen.getByLabelText(label)).toHaveValue('');
    });
  }

  it('Quick log: a futures trade with how much one point is worth gets its full result', async () => {
    const db = await database();
    mount(db, 'journal', 'quick');
    type(/Symbol/, 'ESZ6'); type(/Market/, 'futures'); type(/Direction/, 'long');
    type(/Entry price/, '5000'); type(/Exit price/, '5010'); type(/^Quantity/, '1');
    type(/^Opened/, '2026-09-21T14:00'); type(/^Closed/, '2026-09-21T15:00');
    type('Currency code', 'USD');
    const fields = [...document.querySelectorAll('form input, form select, form textarea')].map(control => control.getAttribute('name'));
    expect(fields.indexOf('contractSize')).toBe(fields.indexOf('quantity') + 1);
    type(/Each point is worth/, '50');
    type(/^Tags/, 'opening range');
    save();
    await screen.findByRole('status');
    const [trade] = await db.trades.toArray();
    expect(trade).toMatchObject({ contractSize: '50', tags: ['opening range'] });
    expect((await getJournalHistoryEntry(db, trade!.id as TradeId))?.metrics).toMatchObject({ grossPnl: '500', netPnl: '500' });
  });

  it('Quick log never saves "Where you traded" or "Leverage", which it does not show (review r1)', async () => {
    const db = await database();
    mount(db);
    type(/Where you traded/, 'CME');
    type(/Leverage/, '2000');
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    type(/Symbol/, 'ESZ6'); type(/Market/, 'futures'); type(/Direction/, 'long');
    type(/Entry price/, '5000'); type(/Exit price/, '5010'); type(/^Quantity/, '1'); type(/Each point is worth/, '50');
    type(/^Opened/, '2026-09-21T14:00'); type(/^Closed/, '2026-09-21T15:00');
    save();
    await screen.findByRole('status');
    const [trade] = await db.trades.toArray();
    expect(trade).toMatchObject({ contractSize: '50' });
    expect(trade).not.toHaveProperty('exchange');
    expect(trade).not.toHaveProperty('leverage');
  });

  it('a crypto, stock or forex trade never shows "Each point is worth"; a value typed before changing market and blank fields are not saved', async () => {
    const db = await database();
    mount(db);
    type(/Symbol/, 'BTCUSDT'); type(/Market/, 'futures'); type(/Direction/, 'long'); type(/Status/, 'draft');
    type(/Each point is worth/, '5');
    for (const market of ['crypto', 'stock', 'forex', 'other']) {
      type(/Market/, market);
      expect(screen.queryByLabelText(/Each point is worth/)).toBeNull();
    }
    type(/Market/, 'crypto');
    type(/Where you traded/, '   '); type(/^Tags/, ' , ,'); type(/Why I'm taking it/, '  ');
    save();
    await screen.findByRole('status');
    const [trade] = await db.trades.toArray();
    for (const key of ['contractSize', 'exchange', 'tags', 'leverage']) expect(trade).not.toHaveProperty(key);
    expect(await db.tradePlans.count()).toBe(0);
  });

  it('says what is wrong with each field, marks it, and moves focus to the message', async () => {
    const db = await database();
    mount(db);
    const cases: Array<[RegExp, string, string]> = [
      [/Each point is worth/, '0', 'Enter how much one point is worth, such as 50.'],
      [/Leverage/, '1001', 'Leverage is a number such as 10, up to 1000.'],
      [/^Tags/, Array.from({ length: 11 }, (_, i) => `tag ${i}`).join(', '), 'At most 10 tags, each up to 24 letters.'],
      [/^Tags/, 'x'.repeat(25), 'At most 10 tags, each up to 24 letters.'],
      [/Where you traded/, 'x'.repeat(41), '"Where you traded" can be up to 40 letters.'],
      [/Why I'm taking it/, 'x'.repeat(501), '"Why I\'m taking it" can be up to 500 letters.'],
    ];
    type(/Symbol/, 'ESZ6'); type(/Market/, 'futures'); type(/Direction/, 'long'); type(/Status/, 'draft');
    for (const [label, value, message] of cases) {
      type(label, value);
      save();
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent(message);
      await waitFor(() => expect(alert).toHaveFocus());
      expect(screen.getByLabelText(label)).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText(label)).toHaveAccessibleDescription(expect.stringContaining(message));
      type(label, '');
    }
    expect(await db.trades.count()).toBe(0);
  });

  it('the strategy "most risk" check reads "Each point is worth" as typed', () => {
    const rule = { id: 'r' as StrategyRuleId, kind: 'max-risk' as const, amount: '400' as DecimalString, currency: 'USD' };
    const strategy = { id: 's', name: 'ES plan', rules: [rule] } as unknown as Parameters<typeof previewTradeStrategyCheck>[2];
    const draft = { ...createEmptyManualTradeDraft(), symbol: 'ESZ6', marketType: 'futures' as const, side: 'long' as const, priceCurrency: 'USD', plan: { plannedEntryPrice: '5000', plannedStopPrice: '4990', plannedTargetPrice: '', plannedQuantity: '1' } };
    expect(previewTradeStrategyCheck({ ...draft, contractSize: '50' }, 'draft', strategy).results[0]).toMatchObject({ verdict: 'broken', reason: 'over', risk: '500' });
    expect(previewTradeStrategyCheck({ ...draft, contractSize: '20' }, 'draft', strategy).results[0]).toMatchObject({ verdict: 'kept', reason: 'within', risk: '200' });
    expect(previewTradeStrategyCheck({ ...draft, contractSize: '' }, 'draft', strategy).results[0]).toMatchObject({ verdict: 'unknown', reason: 'needs-contract-size' });
  });

  it('tags are split by commas, joined and shown once; removing one moves focus to the next, then back to the field', async () => {
    const db = await database();
    const { container } = mount(db);
    type(/^Tags/, ' breakout ,London   open,BREAKOUT,, news ');
    const list = screen.getByRole('list', { name: 'Your tags' });
    expect(within(list).getAllByRole('listitem').map(item => item.textContent?.replace('×', ''))).toEqual(['breakout', 'London open', 'news']);
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(within(list).getByRole('button', { name: 'Remove tag London open' }));
    expect(screen.getByLabelText(/^Tags/)).toHaveValue('breakout, news');
    expect(screen.getByRole('button', { name: 'Remove tag news' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag news' }));
    expect(screen.getByRole('button', { name: 'Remove tag breakout' })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag breakout' }));
    expect(screen.queryByRole('list', { name: 'Your tags' })).toBeNull();
    expect(screen.getByLabelText(/^Tags/)).toHaveFocus();
  });
});
