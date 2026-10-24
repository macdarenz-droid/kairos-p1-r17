import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveManualTrade } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { TradeId } from '../src/domain/trades';
import { ResultsDashboard } from '../src/features/results/ResultsDashboard';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-journal-discipline-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-10T12:00:00.000Z';
const closed = (symbol: string, closeAt: string) => ({ symbol, marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-08-01T00:00:00.000Z', closedAt: closeAt, executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-08-01T00:00:00.000Z' }, { type: 'exit', price: '110', quantity: '1', executedAt: closeAt }] } as const);
async function save(db: KairosDatabase, symbol: string, closeAt: string): Promise<TradeId> {
  const saved = await saveManualTrade(db, closed(symbol, closeAt));
  if (!saved.ok) throw new Error('fixture');
  return saved.tradeId as TradeId;
}
const panel = () => screen.getByRole('region', { name: 'Your discipline' });
/** "Your results" for real trades (T-051e), with a refresh counter the test raises. */
function Results({ db, revision }: { readonly db: KairosDatabase; readonly revision: number }) {
  const [choice, setChoice] = useState<VisualPnlPeriodChoice>({ kind: 'month', at: null });
  return <ResultsDashboard db={db} scope="real" now={now} choice={choice} onChoiceChange={setChoice} renderTradeLink={() => null} refreshRevision={revision} />;
}

describe('T-033b discipline score in the Journal', () => {
  it('follows the calendar month and a review saved on a card', async () => {
    const db = await database();
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', now());
    const reviewed = await save(db, 'BTCUSDT', '2026-09-02T10:00:00.000Z');
    await save(db, 'ETHUSDT', '2026-09-05T10:00:00.000Z');
    await save(db, 'SOLUSDT', '2026-08-20T10:00:00.000Z');
    expect((await saveTradeDiscipline(db, { tradeId: reviewed, scope: 'real', half: 'review', answers: [], mistakeIds: ['moved-stop'], note: '' })).ok).toBe(true);
    const view = render(<MemoryRouter><Results db={db} revision={0} /></MemoryRouter>);

    await waitFor(() => expect(within(panel()).getByText('After the trade: you reviewed 1 of 2 closed trades (50%).')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Previous month' }));
    await waitFor(() => expect(within(panel()).getByText('After the trade: you reviewed 0 of 1 closed trade (0%).')).toBeTruthy());
    expect(within(panel()).getByRole('img', { name: 'Discipline score: 0 out of 100' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next month' }));
    await waitFor(() => expect(within(panel()).getByText('After the trade: you reviewed 1 of 2 closed trades (50%).')).toBeTruthy());

    const second = (await db.trades.toArray()).find(trade => trade.symbol === 'ETHUSDT')!.id as TradeId;
    expect((await saveTradeDiscipline(db, { tradeId: second, scope: 'real', half: 'review', answers: [{ itemId: 'followed-plan', answer: 'yes' }], mistakeIds: [], note: '' })).ok).toBe(true);
    view.rerender(<MemoryRouter><Results db={db} revision={1} /></MemoryRouter>);
    await waitFor(() => expect(within(panel()).getByText('After the trade: you reviewed 2 of 2 closed trades (100%).')).toBeTruthy());
  });
});
