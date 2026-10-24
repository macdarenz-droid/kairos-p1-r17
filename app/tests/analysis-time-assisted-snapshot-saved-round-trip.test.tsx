import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import { createAnalysisSavedTimeAssistedSnapshotPorts, savedTimeAssistedSnapshotToSnapshot, type AnalysisSavedTimeAssistedSnapshotPorts } from '../src/app/analysisSavedTimeAssistedSnapshotRoundTrip';
import type { TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import { saveSavedTimeAssistedSnapshot } from '../src/application/saved-time-assisted-snapshot';
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
const section = () => screen.getByRole('region', { name: 'Your saved trades estimated from time' });
const group = () => screen.getByRole('group', { name: 'Saved snapshot' });

describe('P23.5 Analysis saved time-assisted snapshot round trip over the released P23 owners', () => {
  it('lists only the exact market newest first, loads a saved snapshot back with its provenance, and never touches the journal', async () => {
    const db = await database();
    const ports = createAnalysisSavedTimeAssistedSnapshotPorts(db);
    // U14 (D12): Analysis makes no new estimates, so the saved ones are seeded through their save command.
    const first = await saveSavedTimeAssistedSnapshot(db, { snapshot, inputTimeZone: 'Europe/Berlin' });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await saveSavedTimeAssistedSnapshot(db, { snapshot: { ...snapshot, side: 'long' }, inputTimeZone: 'UTC' });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    await saveSavedTimeAssistedSnapshot(db, { snapshot: { ...snapshot, instrument: other }, inputTimeZone: 'UTC' });
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

  it('loads a saved snapshot: its side and times as text, the saved estimates without a new request, published as markers', async () => {
    const db = await database();
    const saved = await saveSavedTimeAssistedSnapshot(db, { snapshot, inputTimeZone: 'UTC' });
    if (!saved.ok) throw new Error('seed');
    const record = saved.record;
    const ports = createAnalysisSavedTimeAssistedSnapshotPorts(db);
    const onSnapshot = vi.fn();
    render(<AnalysisTimeAssistedSnapshotControls saved={ports} instrument={instrument} onSnapshot={onSnapshot} />);
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-count')).toBe('1'));
    expect(screen.getByText('Your saved trades estimated from time. To check a price at a minute, use "See the market price at that minute" in the trade form.')).toBeTruthy();
    expect(screen.getByText('1 saved snapshot for this market.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Estimate' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Save snapshot' })).toBeNull();
    expect(screen.queryByLabelText('Snapshot opened at')).toBeNull();
    expect(section().getAttribute('data-time-assisted-status')).toBe('idle');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Load snapshot' })); });
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-status')).toBe('loaded'));
    expect(section().getAttribute('data-time-assisted-status')).toBe('snapshot');
    expect(section().querySelector('[data-time-assisted-times]')!.textContent).toBe(`Short · opened ${record.openedAtUtc.replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC')} · still open`);
    expect(section().querySelector('[data-estimate="entry"]')!.getAttribute('data-candle-open-time')).toBe(record.opening.kind === 'candle-range' ? record.opening.candle.openTime : '');
    expect(onSnapshot).toHaveBeenCalledWith(savedTimeAssistedSnapshotToSnapshot(record));
    expect(screen.getByText(new RegExp(`Loaded snapshot ${record.id.slice(0, 8)} saved .* UTC; estimates as acquired then, not re-estimated\\.`))).toBeTruthy();
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(1);
  });

  it('reports a list failure in plain words', async () => {
    const failing: AnalysisSavedTimeAssistedSnapshotPorts = {
      list: vi.fn(async () => { throw new Error('closed'); }),
      load: vi.fn(async () => ({ ok: false as const, type: 'not-found' as const, reason: 'saved-time-assisted-snapshot-not-found' as const })),
      remove: vi.fn(async () => ({ ok: false as const, type: 'not-found' as const, reason: 'saved-time-assisted-snapshot-not-found' as const })),
    };
    render(<AnalysisTimeAssistedSnapshotControls saved={failing} instrument={instrument} />);
    await waitFor(() => expect(screen.getByText('Saved snapshots are unavailable right now.')).toBeTruthy());
    expect(section().getAttribute('data-time-assisted-status')).toBe('idle');
    expect(group().getAttribute('data-saved-snapshot-status')).toBe('error');
  });
});
