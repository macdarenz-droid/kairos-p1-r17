import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import { createAnalysisSavedTimeAssistedSnapshotPorts, savedTimeAssistedSnapshotToSnapshot, type AnalysisSavedTimeAssistedSnapshotPorts } from '../src/app/analysisSavedTimeAssistedSnapshotRoundTrip';
import type { TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const other = { venue: 'binance-spot', symbol: 'BTCUSDT' } as const;
const candleAt = (startTimeMs: number) => ({ openTime: new Date(startTimeMs).toISOString(), closeTime: new Date(startTimeMs + 59_999).toISOString(), open: '2100.5' as DecimalString, high: '2104' as DecimalString, low: '2099.25' as DecimalString, close: '2102' as DecimalString });
const port = () => ({ acquireHistory: vi.fn(async (request: MarketCandleHistoryRequest): Promise<MarketCandleHistoryResult> => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: '2026-09-17T12:00:00.000Z', candles: [candleAt(request.startTimeMs!)] } })) });
const now = () => Date.parse('2026-09-17T12:00:00.000Z');
const snapshot: TimeAssistedTradeSnapshot = Object.freeze({
  kind: 'snapshot', isEstimate: true, source: 'market-reference', instrument, side: 'short',
  opening: { kind: 'candle-range', isEstimate: true, source: 'market-reference', method: 'containing-candle', resolution: '1m', instrument, requestedAt: '2026-09-10T02:13:27', requestedAtUtc: new Date(Date.parse('2026-09-10T02:13:27')).toISOString(), candle: candleAt(Date.parse('2026-09-10T02:13:00')), gapMs: 27_000, acquiredAt: '2026-09-17T12:00:00.000Z' },
  closing: null, durationMs: null,
}) as TimeAssistedTradeSnapshot;
const names: string[] = [];
async function database() { const name = `kairos-saved-time-assisted-round-trip-${names.length}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const section = () => screen.getByRole('region', { name: 'Time-assisted snapshot' });
const group = () => screen.getByRole('group', { name: 'Saved snapshot' });
const estimate = async () => { await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Estimate' })); }); await waitFor(() => expect(section().getAttribute('data-time-assisted-status')).toBe('snapshot')); };

describe('P23.5 Analysis saved time-assisted snapshot round trip over the released P23 owners', () => {
  it('saves a composed snapshot for the exact market, lists only that market newest first, loads it back with its provenance, and never touches the journal', async () => {
    const db = await database();
    const ports = createAnalysisSavedTimeAssistedSnapshotPorts(db);
    const first = await ports.save(snapshot, 'Europe/Berlin');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await ports.save({ ...snapshot, side: 'long' }, 'UTC');
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await ports.save({ ...snapshot, instrument: other }, 'UTC');
    const listed = await ports.list(instrument);
    expect(listed.map(item => item.id)).toEqual([...listed].sort((a, b) => (a.savedAt === b.savedAt ? a.id.localeCompare(b.id) : b.savedAt.localeCompare(a.savedAt))).map(item => item.id));
    expect(listed).toHaveLength(2);
    expect(listed.find(item => item.id === first.savedTimeAssistedSnapshotId)).toEqual({ id: first.savedTimeAssistedSnapshotId, side: 'short', openedAtUtc: first.record.openedAtUtc, closedAtUtc: null, savedAt: first.record.savedAt });
    expect(await ports.list(other)).toHaveLength(1);
    const loaded = await ports.load(first.savedTimeAssistedSnapshotId);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.savedTimeAssistedSnapshot).toEqual(first.record);
    expect(loaded.savedTimeAssistedSnapshot.inputTimeZone).toBe('Europe/Berlin');
    expect(savedTimeAssistedSnapshotToSnapshot(loaded.savedTimeAssistedSnapshot)).toEqual(snapshot);
    expect(await ports.load('missing')).toEqual({ ok: false, type: 'not-found', reason: 'saved-time-assisted-snapshot-not-found' });
    expect(await createKairosRepositories(db).trades.listAll()).toEqual([]);
  });

  it('drives save, list and load from the preview: a loaded snapshot restores the inputs, re-presents the saved estimates without a new request, and publishes them as markers', async () => {
    const db = await database();
    const ports = createAnalysisSavedTimeAssistedSnapshotPorts(db);
    const p = port();
    const onSnapshot = vi.fn();
    render(<AnalysisTimeAssistedSnapshotControls history={p} saved={ports} instrument={instrument} now={now} onSnapshot={onSnapshot} />);
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-count')).toBe('0'));
    expect(screen.getByText(/nothing is saved until you save a snapshot/)).toBeTruthy();
    expect(screen.getByText('No saved snapshots for this market yet.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Save snapshot' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Load snapshot' }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Snapshot side'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Snapshot opened at'), { target: { value: '2026-09-10T02:13:27' } });
    // jsdom normalises a datetime-local value (it appends milliseconds); the saved record keeps the instant exactly as the input reports it.
    const entered = (screen.getByLabelText('Snapshot opened at') as HTMLInputElement).value;
    await estimate();
    expect(p.acquireHistory).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Save snapshot' }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' })); });
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-status')).toBe('saved'));
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-count')).toBe('1'));
    const [record] = await db.savedTimeAssistedSnapshots.toArray();
    expect(record).toMatchObject({ market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' }, side: 'short', openedAt: entered, closedAt: null, isEstimate: true, source: 'market-reference' });
    expect(record.opening).toMatchObject({ kind: 'candle-range', gapMs: 27_000 });
    expect(screen.getByText(`Saved snapshot ${record.id.slice(0, 8)} with its estimates as shown.`)).toBeTruthy();
    expect((screen.getByLabelText('Saved snapshots') as HTMLSelectElement).value).toBe(record.id);

    fireEvent.change(screen.getByLabelText('Snapshot side'), { target: { value: 'long' } });
    fireEvent.change(screen.getByLabelText('Snapshot opened at'), { target: { value: '2026-09-11T10:00:05' } });
    await estimate();
    expect(p.acquireHistory).toHaveBeenCalledTimes(2);
    onSnapshot.mockClear();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load snapshot' })); });
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-status')).toBe('loaded'));
    expect(p.acquireHistory).toHaveBeenCalledTimes(2);
    expect((screen.getByLabelText('Snapshot side') as HTMLSelectElement).value).toBe('short');
    expect((screen.getByLabelText('Snapshot opened at') as HTMLInputElement).value).toBe(entered);
    expect((screen.getByLabelText('Snapshot closed at') as HTMLInputElement).value).toBe('');
    expect(section().getAttribute('data-time-assisted-status')).toBe('snapshot');
    expect(section().querySelector('[data-estimate="entry"]')!.getAttribute('data-candle-open-time')).toBe(record.opening.kind === 'candle-range' ? record.opening.candle.openTime : '');
    expect(onSnapshot).toHaveBeenCalledWith(savedTimeAssistedSnapshotToSnapshot(record));
    expect(screen.getByText(new RegExp(`Loaded snapshot ${record.id.slice(0, 8)} saved .* UTC; estimates as acquired then, not re-estimated\\.`))).toBeTruthy();
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(1);
  });

  it('reports save and list failures in plain words without changing the shown estimate', async () => {
    const failing: AnalysisSavedTimeAssistedSnapshotPorts = {
      save: vi.fn(async () => ({ ok: false as const, type: 'storage-error' as const, reason: 'saved-time-assisted-snapshot-save-failed' as const })),
      list: vi.fn(async () => { throw new Error('closed'); }),
      load: vi.fn(async () => ({ ok: false as const, type: 'not-found' as const, reason: 'saved-time-assisted-snapshot-not-found' as const })),
      remove: vi.fn(async () => ({ ok: false as const, type: 'not-found' as const, reason: 'saved-time-assisted-snapshot-not-found' as const })),
    };
    render(<AnalysisTimeAssistedSnapshotControls history={port()} saved={failing} instrument={instrument} now={now} />);
    await waitFor(() => expect(screen.getByText('Saved snapshots are unavailable right now.')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Snapshot opened at'), { target: { value: '2026-09-10T02:13:27' } });
    await estimate();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Save snapshot' })); });
    await waitFor(() => expect(screen.getByText('The snapshot could not be saved. Nothing was written.')).toBeTruthy());
    expect(section().getAttribute('data-time-assisted-status')).toBe('snapshot');
    expect(group().getAttribute('data-saved-snapshot-status')).toBe('error');
  });
});
