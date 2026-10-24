import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnalysisSavedAnalysisControls } from '../src/app/AnalysisSavedAnalysisControls';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import { analysisMarketReference, createAnalysisSavedAnalysisPorts } from '../src/app/analysisSavedAnalysisRoundTrip';
import { createAnalysisSavedTimeAssistedSnapshotPorts } from '../src/app/analysisSavedTimeAssistedSnapshotRoundTrip';
import type { TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import { saveSavedTimeAssistedSnapshot } from '../src/application/saved-time-assisted-snapshot';
import { SAVED_RECORD_LABEL_MAX_LENGTH } from '../src/domain/saved-records/savedRecordLabel';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import type { ChartDrawing } from '../src/features/chart';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const market = analysisMarketReference(instrument);
const line = (id: string): ChartDrawing => ({ id, kind: 'trend-line', start: { timestamp: '2026-09-10T02:00:00.000Z', price: '2100' as DecimalString }, end: { timestamp: '2026-09-10T03:00:00.000Z', price: '2300' as DecimalString } });
const candleAt = (startTimeMs: number) => ({ openTime: new Date(startTimeMs).toISOString(), closeTime: new Date(startTimeMs + 59_999).toISOString(), open: '2100.5' as DecimalString, high: '2104' as DecimalString, low: '2099.25' as DecimalString, close: '2102' as DecimalString });
const port = () => ({ acquireHistory: vi.fn(async (request: MarketCandleHistoryRequest): Promise<MarketCandleHistoryResult> => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: '2026-09-17T12:00:00.000Z', candles: [candleAt(request.startTimeMs!)] } })) });
const now = () => Date.parse('2026-09-17T12:00:00.000Z');
const names: string[] = [];
async function database() { const name = `kairos-saved-record-label-${names.length}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const click = async (name: string) => { await act(async () => { fireEvent.click(screen.getByRole('button', { name })); }); };
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('P25.2 saved record labels on the Analysis page', () => {
  it('saves a Saved Analysis with the typed label, clears the input, lists the label first, and keeps an unlabelled record readable', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    render(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={1} getDrawings={() => [line('d1')]} onLoad={vi.fn()} />);
    const group = () => screen.getByRole('group', { name: 'Saved analysis' });
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('0'));
    expect((screen.getByLabelText('Analysis label') as HTMLInputElement).maxLength).toBe(SAVED_RECORD_LABEL_MAX_LENGTH);
    type('Analysis label', '  Breakout plan ');
    await click('Save analysis');
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('1'));
    expect((screen.getByLabelText('Analysis label') as HTMLInputElement).value).toBe('');
    const [labelled] = await db.savedAnalyses.toArray();
    expect(labelled.label).toBe('Breakout plan');
    expect(screen.getByRole('option', { name: `Breakout plan · ${labelled.id.slice(0, 8)} · 1 line` })).toBeTruthy();
    await click('Save analysis');
    await waitFor(() => expect(group().getAttribute('data-saved-analysis-count')).toBe('2'));
    const plain = (await db.savedAnalyses.toArray()).find(record => record.id !== labelled.id)!;
    expect('label' in plain).toBe(false);
    expect(screen.getByRole('option', { name: `${plain.id.slice(0, 8)} · 1 line` })).toBeTruthy();
  });

  it('rejects an over-long analysis label in plain words and writes nothing', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    render(<AnalysisSavedAnalysisControls ports={ports} market={market} drawingCount={1} getDrawings={() => [line('d1')]} onLoad={vi.fn()} />);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Saved analysis' }).getAttribute('data-saved-analysis-count')).toBe('0'));
    fireEvent.change(screen.getByLabelText('Analysis label'), { target: { value: 'x'.repeat(SAVED_RECORD_LABEL_MAX_LENGTH + 1) } });
    await click('Save analysis');
    await waitFor(() => expect(screen.getByText(`The label must be ${SAVED_RECORD_LABEL_MAX_LENGTH} characters or fewer. Nothing was written.`)).toBeTruthy());
    expect(await db.savedAnalyses.count()).toBe(0);
  });

  it('lists a saved snapshot by its label first, and loads it back unchanged', async () => {
    const db = await database();
    // U14 (D12): Analysis makes no new estimates, so the labelled one is seeded through its save command.
    const snapshot: TimeAssistedTradeSnapshot = { kind: 'snapshot', isEstimate: true, source: 'market-reference', instrument, side: 'long', opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27Z', reason: 'no-candle' }, closing: null, durationMs: null };
    expect((await saveSavedTimeAssistedSnapshot(db, { snapshot, inputTimeZone: 'UTC', label: ' Morning scalp ' })).ok).toBe(true);
    const ports = createAnalysisSavedTimeAssistedSnapshotPorts(db);
    render(<AnalysisTimeAssistedSnapshotControls saved={ports} instrument={instrument} />);
    const group = () => screen.getByRole('group', { name: 'Your saved estimates' });
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-count')).toBe('1'));
    const [record] = await db.savedTimeAssistedSnapshots.toArray();
    expect(record.label).toBe('Morning scalp');
    expect((screen.getByRole('option', { name: /^Morning scalp · / }) as HTMLOptionElement).value).toBe(record.id);
    await click('Open estimate');
    await waitFor(() => expect(group().getAttribute('data-saved-snapshot-status')).toBe('loaded'));
    expect(screen.getByRole('region', { name: 'Trades estimated from time' }).getAttribute('data-time-assisted-status')).toBe('snapshot');
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(1);
  });
});
