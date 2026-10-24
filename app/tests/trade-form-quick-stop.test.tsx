import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { listJournalHistory } from '../src/application/journal';
import { projectTradeTimesRisked } from '../src/application/performance/tradeRisk';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { TradeForm } from '../src/features/journal/TradeForm';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-quick-stop-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); localStorage.clear(); for (const name of names.splice(0)) await Dexie.delete(name); });
const type = (label: RegExp | string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const HINT = "Without a stop, Kairos can't draw your risk or show × what you risked.";

function quickLog(): void {
  fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
  type(/Symbol/, 'BTCUSDT');
  type(/Market/, 'crypto');
  type(/Direction/, 'long');
  type(/Entry price/, '100');
  type(/Exit price/, '120');
  type(/^Quantity/, '2');
  type(/^Opened/, '2026-09-12T10:00');
  type(/^Closed/, '2026-09-12T11:00');
}

describe('T-059a the stop and target in Quick log', () => {
  it('asks for the stop and target right after the exit price, once each; All details keeps them in the plan', async () => {
    const db = await database();
    const { container } = render(<TradeForm db={db} kind="journal" onSaved={async () => undefined} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quick log' }));
    const exit = screen.getByLabelText(/Exit price/);
    const stop = screen.getByLabelText(/^Planned stop/);
    const target = screen.getByLabelText(/^Planned target/);
    expect(screen.getAllByLabelText(/^Planned stop/)).toHaveLength(1);
    expect(screen.getAllByLabelText(/^Planned target/)).toHaveLength(1);
    expect(exit.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(stop.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(target.compareDocumentPosition(screen.getByLabelText(/^Quantity/)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(stop.closest('details')).toBeNull();
    expect(screen.getByLabelText(/^Planned entry/).closest('details')).not.toBeNull();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'All details' }));
    expect(screen.getByLabelText(/^Planned stop/).closest('details')).not.toBeNull();
    expect(screen.getByLabelText(/^Planned target/).closest('details')).not.toBeNull();
    expect(screen.queryByText(HINT)).toBeNull();
  });

  it('says what a blank stop costs and never stops the save; a stop and target are saved as the plan', async () => {
    const db = await database();
    render(<TradeForm db={db} kind="journal" onSaved={async () => undefined} />);
    quickLog();
    expect(screen.getByText(HINT)).toBeInTheDocument();
    type(/^Planned stop/, '90');
    expect(screen.queryByText(HINT)).toBeNull();
    type(/^Planned stop/, '');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    expect((await screen.findByRole('status')).textContent).toBe('Trade saved to your journal.');
    expect(await db.tradePlans.count()).toBe(0);
    quickLog();
    type(/^Planned stop/, '90');
    type(/^Planned target/, '130');
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));
    await waitFor(async () => expect(await db.tradePlans.count()).toBe(1));
    expect(await db.tradePlans.toArray()).toEqual([expect.objectContaining({ plannedStopPrice: '90', plannedTargetPrice: '130', plannedEntryPrice: null })]);
    const saved = (await listJournalHistory(db)).find(entry => entry.plans.length === 1)!;
    expect(projectTradeTimesRisked(saved)).toMatchObject({ available: true, value: '2', moneyAtRisk: '20' });
  });

});
