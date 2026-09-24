import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisSavedAnalysisControls } from '../src/app/AnalysisSavedAnalysisControls';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import { analysisMarketReference, createAnalysisSavedAnalysisPorts, type AnalysisSavedAnalysisPorts } from '../src/app/analysisSavedAnalysisRoundTrip';
import { createAnalysisSavedTimeAssistedSnapshotPorts, type AnalysisSavedTimeAssistedSnapshotPorts } from '../src/app/analysisSavedTimeAssistedSnapshotRoundTrip';
import type { TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { ChartDrawing } from '../src/features/chart';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const market = analysisMarketReference(instrument);
const line = (id: string): ChartDrawing => ({ id, kind: 'trend-line', start: { timestamp: '2026-09-10T02:00:00.000Z', price: '2100' as DecimalString }, end: { timestamp: '2026-09-10T03:00:00.000Z', price: '2300' as DecimalString } });
const snapshot: TimeAssistedTradeSnapshot = { kind: 'snapshot', isEstimate: true, source: 'market-reference', instrument, side: 'long', opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27Z', reason: 'no-candle' }, closing: null, durationMs: null };
const history = { acquireHistory: vi.fn(async () => { throw new Error('unused'); }) };
const names: string[] = [];
async function database() { const name = `kairos-saved-record-delete-${names.length}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const click = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };

describe('P24.2 saved record delete controls over the released P24.1 commands', () => {
  it('deletes the selected Saved Analysis from the Saved analysis group and leaves the chart and the journal alone', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    const first = await ports.save(market, [line('d1')]); const second = await ports.save(market, [line('d2')]);
    expect(first.ok && second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    const onLoad = vi.fn();
    render(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={0} getDrawings={() => []} onLoad={onLoad} />);
    const group = () => screen.getByRole('group', { name: 'Saved analysis' });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('2'));
    fireEvent.change(screen.getByLabelText('Saved analyses'), { target: { value: second.savedAnalysisId } });
    await click('Delete analysis');
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-status')).toBe('deleted'));
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('1'));
    expect(screen.getByText(`Deleted analysis ${second.savedAnalysisId.slice(0, 8)}. The chart is unchanged.`)).toBeTruthy();
    expect((await createKairosRepositories(db).savedAnalyses.listAll()).map(record => record.id)).toEqual([first.savedAnalysisId]);
    expect((screen.getByLabelText('Saved analyses') as HTMLSelectElement).value).toBe(first.savedAnalysisId);
    expect(onLoad).not.toHaveBeenCalled();
    expect(await db.trades.count()).toBe(0);
    await click('Delete analysis');
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('0'));
    expect((screen.getByRole('button', { name: 'Delete analysis' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(`Deleted analysis ${first.savedAnalysisId.slice(0, 8)}. The chart is unchanged.`)).toBeTruthy();
    expect(await db.savedAnalyses.count()).toBe(0);
  });

  it('deletes the selected saved snapshot from the Saved snapshot group without touching the shown estimate', async () => {
    const db = await database();
    const ports = createAnalysisSavedTimeAssistedSnapshotPorts(db);
    const saved = await ports.save(snapshot, 'UTC');
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;
    const onSnapshot = vi.fn();
    render(<AnalysisTimeAssistedSnapshotControls history={history} saved={ports} instrument={instrument} onSnapshot={onSnapshot} />);
    const group = () => screen.getByRole('group', { name: 'Saved snapshot' });
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-count')).toBe('1'));
    expect((screen.getByRole('button', { name: 'Delete snapshot' }) as HTMLButtonElement).disabled).toBe(false);
    await click('Delete snapshot');
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-status')).toBe('deleted'));
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-count')).toBe('0'));
    expect(screen.getByText(`Deleted snapshot ${saved.savedTimeAssistedSnapshotId.slice(0, 8)}. The shown estimate is unchanged.`)).toBeTruthy();
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(0);
    expect(screen.getByRole('region', { name: 'Time-assisted snapshot' }).getAttribute('data-time-assisted-status')).toBe('idle');
    expect(onSnapshot).not.toHaveBeenCalled();
    expect(history.acquireHistory).not.toHaveBeenCalled();
    expect((screen.getByRole('button', { name: 'Delete snapshot' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('reports a vanished record and a storage failure in plain words and refreshes the list only for not-found', async () => {
    const analysisPorts: AnalysisSavedAnalysisPorts = {
      save: vi.fn(async () => ({ ok: false as const, type: 'storage-error' as const, reason: 'saved-analysis-save-failed' as const })),
      list: vi.fn(async () => [{ id: 'gone', drawingCount: 1 }]),
      load: vi.fn(async () => ({ ok: false as const, type: 'not-found' as const, reason: 'saved-analysis-not-found' as const })),
      remove: vi.fn(async () => ({ ok: false as const, type: 'not-found' as const, reason: 'saved-analysis-not-found' as const })),
    };
    render(<AnalysisSavedAnalysisControls ports={analysisPorts} market={market} drawingCount={0} getDrawings={() => []} onLoad={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Saved analysis' }).getAttribute('data-saved-analysis-count')).toBe('1'));
    await click('Delete analysis');
    await waitFor(() => expect(screen.getByText('That saved analysis no longer exists.')).toBeTruthy());
    expect(analysisPorts.list).toHaveBeenCalledTimes(2);
    const snapshotPorts: AnalysisSavedTimeAssistedSnapshotPorts = {
      save: vi.fn(async () => ({ ok: false as const, type: 'storage-error' as const, reason: 'saved-time-assisted-snapshot-save-failed' as const })),
      list: vi.fn(async () => [{ id: 'kept', side: 'long' as const, openedAtUtc: '2026-09-10T02:13:27.000Z', closedAtUtc: null, savedAt: '2026-09-18T03:30:00.000Z' }]),
      load: vi.fn(async () => ({ ok: false as const, type: 'not-found' as const, reason: 'saved-time-assisted-snapshot-not-found' as const })),
      remove: vi.fn(async () => ({ ok: false as const, type: 'storage-error' as const, reason: 'saved-time-assisted-snapshot-delete-failed' as const })),
    };
    render(<AnalysisTimeAssistedSnapshotControls history={history} saved={snapshotPorts} instrument={instrument} />);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Saved snapshot' }).getAttribute('data-saved-snapshot-count')).toBe('1'));
    await click('Delete snapshot');
    await waitFor(() => expect(screen.getByText('The saved snapshot could not be deleted. It is still saved.')).toBeTruthy());
    expect(snapshotPorts.list).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('group', { name: 'Saved snapshot' }).getAttribute('data-saved-snapshot-count')).toBe('1');
  });
});
