import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisSavedAnalysisControls } from '../src/app/AnalysisSavedAnalysisControls';
import { LibraryRoute } from '../src/app/LibraryRoute';
import { analysisMarketReference, createAnalysisSavedAnalysisPorts } from '../src/app/analysisSavedAnalysisRoundTrip';
import { commitSavedRecordImport, exportKairosBackup, prepareSavedRecordImport } from '../src/application/backup';
import { parseKairosBackup } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { SavedRiskRewardAnalysis } from '../src/domain/saved-records/savedAnalysisContract';
import type { DecimalString } from '../src/domain/trades';
import type { ChartDrawing } from '../src/features/chart';

const names: string[] = [];
async function database() {
  const name = `kairos-saved-risk-boxes-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const d = (value: string) => value as DecimalString;
const market = analysisMarketReference({ venue: 'binance-spot', symbol: 'ETHUSDT' });
const line: ChartDrawing = { id: 'line-1', kind: 'trend-line', start: { timestamp: '2026-09-10T02:00:00.000Z', price: d('2100') }, end: { timestamp: '2026-09-10T03:00:00.000Z', price: d('2300') } };
const box: SavedRiskRewardAnalysis = {
  analysis: { id: 'box-1', side: 'long', levels: { entry: d('2100.5'), stop: d('2050'), target: d('2201.50') } },
  extent: { start: '2026-09-10T02:00:00.000Z', end: '2026-09-10T02:25:00.000Z' },
};

describe('T-022d risk boxes in Saved Analysis', () => {
  it('saves a line and a box, lists the box count and hands both back on Load', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    const onLoad = vi.fn(), onLoadRiskBoxes = vi.fn();
    render(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={1} getDrawings={() => [line]} onLoad={onLoad} riskBoxCount={1} getRiskBoxes={() => [box]} onLoadRiskBoxes={onLoadRiskBoxes} />);
    const group = () => screen.getByRole('group', { name: 'Saved analysis' });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('0'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save analysis' })); });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-status')).toBe('saved'));
    expect(screen.getByText(/Saved analysis [0-9a-f]{8} with 1 line and 1 risk box\./)).toBeTruthy();
    const [record] = await createKairosRepositories(db).savedAnalyses.listAll();
    expect(JSON.stringify(record.riskRewards)).toBe(JSON.stringify([box]));
    expect(await ports.list(market)).toEqual([{ id: record.id, drawingCount: 1, riskBoxCount: 1 }]);
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('1'));
    expect(screen.getByRole('option').textContent).toContain('1 line and 1 risk box');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load analysis' })); });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-status')).toBe('loaded'));
    expect(onLoad).toHaveBeenCalledWith([line]);
    expect(onLoadRiskBoxes).toHaveBeenCalledWith([box]);
    expect(onLoad.mock.invocationCallOrder[0]).toBeLessThan(onLoadRiskBoxes.mock.invocationCallOrder[0]);
    expect(screen.getByText(/Loaded analysis [0-9a-f]{8} with 1 line and 1 risk box\./)).toBeTruthy();
  });

  it('saves a box with no drawing', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    render(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={0} getDrawings={() => []} onLoad={vi.fn()} riskBoxCount={1} getRiskBoxes={() => [box]} />);
    const save = screen.getByRole('button', { name: 'Save analysis' }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    await act(async () => { fireEvent.click(save); });
    await waitFor(() => expect(screen.getByText(/Saved analysis [0-9a-f]{8} with 1 risk box\./)).toBeTruthy());
    const [record] = await createKairosRepositories(db).savedAnalyses.listAll();
    expect(record.drawings).toEqual([]);
    expect(record.riskRewards).toEqual([box]);
  });

  it('clears the boxes when loading an analysis that has none', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    await ports.save(market, [line]);
    const onLoadRiskBoxes = vi.fn();
    render(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={0} getDrawings={() => []} onLoad={vi.fn()} getRiskBoxes={() => []} onLoadRiskBoxes={onLoadRiskBoxes} />);
    const group = () => screen.getByRole('group', { name: 'Saved analysis' });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('1'));
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load analysis' })); });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-status')).toBe('loaded'));
    expect(onLoadRiskBoxes).toHaveBeenCalledWith([]);
    expect(screen.getByText(/Loaded analysis [0-9a-f]{8} with 1 line\./)).toBeTruthy();
  });

  it('keeps the box through a backup and brings it in with merge import', async () => {
    const source = await database();
    const saved = await createAnalysisSavedAnalysisPorts(source).save(market, [line], undefined, [box]);
    expect(saved.ok).toBe(true);
    const exported = await exportKairosBackup(source, new Date('2026-09-24T00:00:00.000Z'));
    if (!exported.ok) throw new Error('export failed');
    expect(parseKairosBackup(exported.file.contents).payload.savedAnalyses[0].riskRewards).toEqual([box]);
    const target = await database();
    const prepared = await prepareSavedRecordImport(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect(await commitSavedRecordImport(target, prepared.import)).toMatchObject({ ok: true, added: { analyses: 1 } });
    const [imported] = await createKairosRepositories(target).savedAnalyses.listAll();
    expect(imported.riskRewards).toEqual([box]);
  });

  it('shows "1 risk box" in the Library', async () => {
    const db = await database();
    await createAnalysisSavedAnalysisPorts(db).save(market, [line], undefined, [box]);
    render(<MemoryRouter><LibraryRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Library' }).getAttribute('data-library-status')).toBe('ready'));
    expect(screen.getByText(/1 drawing · 1 risk box/)).toBeTruthy();
  });
});
