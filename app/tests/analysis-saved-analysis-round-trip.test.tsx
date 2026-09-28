import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisSavedAnalysisControls } from '../src/app/AnalysisSavedAnalysisControls';
import { analysisMarketReference, createAnalysisSavedAnalysisPorts } from '../src/app/analysisSavedAnalysisRoundTrip';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { ChartDrawing } from '../src/features/chart';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const line = (id: string, endPrice: string): ChartDrawing => ({ id, kind: 'trend-line', start: { timestamp: '2026-09-10T02:00:00.000Z', price: '2100' as DecimalString }, end: { timestamp: '2026-09-10T03:00:00.000Z', price: endPrice as DecimalString } });
const market = analysisMarketReference({ venue: 'binance-spot', symbol: 'ETHUSDT' });
const other = analysisMarketReference({ venue: 'binance-spot', symbol: 'BTCUSDT' });
const names: string[] = [];
async function database() {
  const name = `kairos-saved-analysis-round-trip-${names.length}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

describe('Analysis Saved Analysis round trip over the released P20 owners', () => {
  it('saves the drawings for the exact market, lists only that market, and loads them back byte-equal with stable ids', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    const drawings = [line('d1', '2300'), line('d2', '2000')];
    const saved = await ports.save(market, drawings);
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    await ports.save(other, [line('d3', '1')]);
    expect(await ports.list(market)).toEqual([{ id: saved.savedAnalysisId, drawingCount: 2 }]);
    expect(await ports.list(other)).toHaveLength(1);
    const loaded = await ports.load(saved.savedAnalysisId);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.savedAnalysis).toEqual({ id: saved.savedAnalysisId, market, drawings, riskRewards: [] });
    expect(await ports.load('missing')).toEqual({ ok: false, type: 'not-found', reason: 'saved-analysis-not-found' });
    // No journal record is touched by the round trip.
    const repositories = createKairosRepositories(db);
    expect(await repositories.trades.listAll()).toEqual([]);
  });

  it('drives save, list and load from the controls and hands loaded drawings to the caller without owning them', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    const onLoad = vi.fn();
    let current: readonly ChartDrawing[] = [line('d1', '2300')];
    const view = render(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={current.length} getDrawings={() => current} onLoad={onLoad} />);
    const group = () => screen.getByRole('group', { name: 'Saved analysis' });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('0'));
    expect(screen.getByText('No saved analyses for this market yet.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Load analysis' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save analysis' })); });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-status')).toBe('saved'));
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('1'));
    expect(screen.getByText(/Saved analysis [0-9a-f]{8} with 1 line\./)).toBeTruthy();
    const [summary] = await ports.list(market);
    expect((screen.getByRole('combobox', { name: 'Saved analyses' }) as HTMLSelectElement).value).toBe(summary.id);
    current = [];
    view.rerender(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={0} getDrawings={() => current} onLoad={onLoad} />);
    expect((screen.getByRole('button', { name: 'Save analysis' }) as HTMLButtonElement).disabled).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load analysis' })); });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-status')).toBe('loaded'));
    expect(onLoad).toHaveBeenCalledWith([line('d1', '2300')]);
    expect(screen.getByText(/Loaded analysis [0-9a-f]{8} with 1 line\./)).toBeTruthy();
    // Another market lists nothing; no market hides the controls.
    view.rerender(<AnalysisSavedAnalysisControls ports={ports} market={other} drawingCount={0} getDrawings={() => current} onLoad={onLoad} />);
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('0'));
    view.rerender(<AnalysisSavedAnalysisControls ports={ports} market={null} drawingCount={0} getDrawings={() => current} onLoad={onLoad} />);
    expect(screen.queryByRole('group', { name: 'Saved analysis' })).toBeNull();
  });

  it('reports a failed save without inventing an id and a missing load without calling back', async () => {
    const onLoad = vi.fn();
    const ports = { save: async () => ({ ok: false as const, type: 'storage-error' as const, reason: 'saved-analysis-save-failed' as const }), list: async () => [{ id: 'gone', drawingCount: 1 }], load: async () => ({ ok: false as const, type: 'not-found' as const, reason: 'saved-analysis-not-found' as const }), remove: async () => ({ ok: false as const, type: 'not-found' as const, reason: 'saved-analysis-not-found' as const }) };
    render(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={1} getDrawings={() => [line('d1', '2300')]} onLoad={onLoad} />);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Saved analysis' }).getAttribute('data-saved-analysis-count')).toBe('1'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save analysis' })); });
    await waitFor(() => expect(screen.getByText('The analysis could not be saved. Nothing was written.')).toBeTruthy());
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load analysis' })); });
    await waitFor(() => expect(screen.getByText('That saved analysis no longer exists.')).toBeTruthy());
    expect(onLoad).not.toHaveBeenCalled();
  });
});
