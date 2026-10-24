import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { AnalysisHandoffContext, analysisHandoffHref, parseAnalysisHandoff } from '../src/app/analysisHandoff';
import { AnalysisHistoryWorkspace } from '../src/app/AnalysisHistoryWorkspace';
import type { AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import { AnalysisSavedAnalysisControls } from '../src/app/AnalysisSavedAnalysisControls';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import { LibraryRoute } from '../src/app/LibraryRoute';
import { analysisMarketReference, createAnalysisSavedAnalysisPorts } from '../src/app/analysisSavedAnalysisRoundTrip';
import { createAnalysisSavedTimeAssistedSnapshotPorts } from '../src/app/analysisSavedTimeAssistedSnapshotRoundTrip';
import { defineSavedTimeAssistedSnapshot } from '../src/domain/saved-records/savedTimeAssistedSnapshotContract';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { ChartDrawing } from '../src/features/chart';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

// This device's time, read with Date's own local getters: "10 Sep 02:13".
const localWhen = (iso: string) => { const at = new Date(iso); const year = at.getFullYear() === new Date().getFullYear() ? '' : ` ${at.getFullYear()}`; return `${at.getDate()} ${at.toLocaleString('en-GB', { month: 'short' })}${year} ${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`; };
const names: string[] = [];
async function database() { const name = `kairos-library-route-${names.length}-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const eth = analysisMarketReference(instrument);
const btc = analysisMarketReference({ venue: 'binance-spot', symbol: 'BTCUSDT' });
const line = (id: string): ChartDrawing => ({ id, kind: 'trend-line', start: { timestamp: '2026-09-10T02:00:00.000Z', price: '2100' as DecimalString }, end: { timestamp: '2026-09-10T03:00:00.000Z', price: '2300' as DecimalString } });
// Entered instants are what the datetime-local input reported at save time (no zone suffix), as the P23.5 round trip stores them.
const snapshot = (id: string, savedAt: string, label?: string) => defineSavedTimeAssistedSnapshot({ id, market: eth, side: 'short', openedAt: '2026-09-10T02:13:27', openedAtUtc: '2026-09-10T02:13:27.000Z', closedAt: null, closedAtUtc: null, inputTimeZone: 'UTC', opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27', reason: 'no-candle' }, closing: null, durationMs: null, savedAt, isEstimate: true, source: 'market-reference', ...(label === undefined ? {} : { label }) });

describe('P27.2 Library route and the Analysis handoff', () => {
  it('parses and builds the handoff URL exactly, rejecting malformed markets and kinds', () => {
    expect(analysisHandoffHref(eth, { kind: 'snapshot', id: 's-1' })).toBe('/analysis?market=binance-spot%3AETHUSDT&open=snapshot%3As-1');
    expect(parseAnalysisHandoff(new URLSearchParams('market=binance-spot:ETHUSDT&open=analysis:a-1'))).toEqual({ market: { venue: 'binance-spot', instrument: 'ETHUSDT' }, open: { kind: 'analysis', id: 'a-1' } });
    expect(parseAnalysisHandoff(new URLSearchParams('market=binance-spot:ETHUSDT'))).toEqual({ market: { venue: 'binance-spot', instrument: 'ETHUSDT' }, open: null });
    expect(parseAnalysisHandoff(new URLSearchParams('market=binance-spot:ETHUSDT&open=trade:x'))).toEqual({ market: { venue: 'binance-spot', instrument: 'ETHUSDT' }, open: null });
    expect(parseAnalysisHandoff(new URLSearchParams('market=ETHUSDT'))).toBeNull();
    expect(parseAnalysisHandoff(new URLSearchParams('trade=abc'))).toBeNull();
  });

  it('lists every saved record across markets from the index, filters by kind and market, and links each to Analysis', async () => {
    const db = await database();
    const analyses = createAnalysisSavedAnalysisPorts(db);
    const a1 = await analyses.save(eth, [line('d1')], 'Breakout plan'); const a2 = await analyses.save(btc, [line('d2')]);
    expect(a1.ok && a2.ok).toBe(true);
    if (!a1.ok || !a2.ok) return;
    await createKairosRepositories(db).savedTimeAssistedSnapshots.put(snapshot('s-1', '2026-09-18T03:30:00.000Z', 'Morning scalp'));
    render(<MemoryRouter><LibraryRoute db={db} /></MemoryRouter>);
    const route = () => screen.getByRole('region', { name: 'Library' });
    await waitFor(() => expect(route().getAttribute('data-library-status')).toBe('ready'));
    expect(route().getAttribute('data-library-count')).toBe('3');
    expect(screen.getByText('2 saved analyses and 1 trade estimated from time across 2 markets. Open one to load it in Analysis.')).toBeTruthy();
    const items = () => [...route().querySelectorAll('[data-record-id]')].map(item => item.getAttribute('data-record-id'));
    expect(items()).toEqual(['s-1', a1.savedAnalysisId, a2.savedAnalysisId]);
    expect(screen.getByRole('link', { name: 'Open Morning scalp in Analysis' }).getAttribute('href')).toBe('/analysis?market=binance-spot%3AETHUSDT&open=snapshot%3As-1');
    expect(screen.getByRole('link', { name: `Open ${a2.savedAnalysisId.slice(0, 8)} in Analysis` }).getAttribute('href')).toBe(`/analysis?market=binance-spot%3ABTCUSDT&open=analysis%3A${a2.savedAnalysisId}`);
    fireEvent.change(screen.getByLabelText('Record kind'), { target: { value: 'analysis' } });
    expect(items()).toEqual([a1.savedAnalysisId, a2.savedAnalysisId]);
    fireEvent.change(screen.getByLabelText('Record market'), { target: { value: 'binance-spot:BTCUSDT' } });
    expect(items()).toEqual([a2.savedAnalysisId]);
    fireEvent.change(screen.getByLabelText('Record kind'), { target: { value: 'snapshot' } });
    expect(route().getAttribute('data-library-count')).toBe('0');
    expect(screen.getByRole('status').textContent).toBe('No saved charts match these filters.');
  });

  it('shows the empty state when nothing is saved', async () => {
    const db = await database();
    render(<MemoryRouter><LibraryRoute db={db} /></MemoryRouter>);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Nothing saved yet. Save an analysis on the Analysis page and it will appear here.'));
  });

  it('opens a handed-off Saved Analysis exactly once through the released load path, and ignores a handoff for another kind or an unknown id', async () => {
    const db = await database();
    const ports = createAnalysisSavedAnalysisPorts(db);
    const saved = await ports.save(eth, [line('d1')]); expect(saved.ok).toBe(true); if (!saved.ok) return;
    const onLoad = vi.fn();
    const { rerender } = render(<AnalysisHandoffContext.Provider value={{ market: { venue: 'binance-spot', instrument: 'ETHUSDT' }, open: { kind: 'analysis', id: saved.savedAnalysisId } }}><AnalysisSavedAnalysisControls ports={ports} market={eth} drawingCount={0} getDrawings={() => []} onLoad={onLoad} /></AnalysisHandoffContext.Provider>);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Saved analysis' }).getAttribute('data-saved-analysis-status')).toBe('loaded'));
    expect(onLoad).toHaveBeenCalledTimes(1);
    expect(onLoad).toHaveBeenCalledWith([line('d1')]);
    rerender(<AnalysisHandoffContext.Provider value={{ market: { venue: 'binance-spot', instrument: 'ETHUSDT' }, open: { kind: 'analysis', id: saved.savedAnalysisId } }}><AnalysisSavedAnalysisControls ports={ports} market={eth} drawingCount={1} getDrawings={() => [line('d1')]} onLoad={onLoad} /></AnalysisHandoffContext.Provider>);
    await act(async () => {});
    expect(onLoad).toHaveBeenCalledTimes(1);
    const second = vi.fn();
    render(<AnalysisHandoffContext.Provider value={{ market: { venue: 'binance-spot', instrument: 'ETHUSDT' }, open: { kind: 'snapshot', id: saved.savedAnalysisId } }}><AnalysisSavedAnalysisControls ports={ports} market={eth} drawingCount={0} getDrawings={() => []} onLoad={second} /></AnalysisHandoffContext.Provider>);
    await waitFor(() => expect(screen.getAllByRole('group', { name: 'Saved analysis' })[1].getAttribute('data-saved-analysis-count')).toBe('1'));
    expect(second).not.toHaveBeenCalled();
  });

  it('opens a handed-off saved snapshot exactly once, showing its side and times as text and publishing the saved estimates', async () => {
    const db = await database();
    await createKairosRepositories(db).savedTimeAssistedSnapshots.put(snapshot('s-1', '2026-09-18T03:30:00.000Z'));
    const ports = createAnalysisSavedTimeAssistedSnapshotPorts(db);
    const onSnapshot = vi.fn();
    render(<AnalysisHandoffContext.Provider value={{ market: { venue: 'binance-spot', instrument: 'ETHUSDT' }, open: { kind: 'snapshot', id: 's-1' } }}><AnalysisTimeAssistedSnapshotControls saved={ports} instrument={instrument} onSnapshot={onSnapshot} /></AnalysisHandoffContext.Provider>);
    await waitFor(() => expect(screen.getByRole('group', { name: 'Your saved estimates' }).getAttribute('data-saved-snapshot-status')).toBe('loaded'));
    const section = screen.getByRole('region', { name: 'Trades estimated from time' });
    expect(section.querySelector('[data-time-assisted-times]')!.textContent).toBe(`Short · opened ${localWhen('2026-09-10T02:13:27.000Z')} · still open`);
    expect(section.getAttribute('data-time-assisted-status')).toBe('snapshot');
    expect(screen.queryByLabelText('Snapshot side')).toBeNull();
    expect(onSnapshot).toHaveBeenCalledTimes(1);
  });

  it('opens a saved forex estimate from the Library on its pair\'s OANDA chart (D12: old records stay readable)', async () => {
    const db = await database();
    const pair = { venue: 'oanda-forex', symbol: 'EURUSD' } as const;
    const forex = defineSavedTimeAssistedSnapshot({ ...snapshot('f-1', '2026-09-18T03:30:00.000Z'), market: analysisMarketReference(pair), opening: { kind: 'unavailable', instrument: pair, requestedAt: '2026-09-10T02:13:27', reason: 'no-candle' } });
    await createKairosRepositories(db).savedTimeAssistedSnapshots.put(forex);
    render(<MemoryRouter><LibraryRoute db={db} /></MemoryRouter>);
    const link = await screen.findByRole('link', { name: 'Open f-1 in Analysis' });
    const href = link.getAttribute('href')!;
    expect(href).toBe('/analysis?market=oanda-forex%3AEURUSD&open=snapshot%3Af-1');
    cleanup();
    const metadata = { acquireInstrumentMetadata: vi.fn(async () => ({ ok: true as const, facts: [] })) };
    const LiveCanvas = (props: AnalysisLiveCandleCanvasProps) => <div data-testid="live-candle-canvas">{`${props.instrument.venue} ${props.instrument.symbol}/${props.interval} ${props.quoteAsset}`}</div>;
    render(<AnalysisHandoffContext.Provider value={parseAnalysisHandoff(new URL(href, 'https://kairos.invalid').searchParams)}>
      <AnalysisHistoryWorkspace ports={{ metadata, forexCandles: true }} LiveCanvas={LiveCanvas} savedSnapshots={createAnalysisSavedTimeAssistedSnapshotPorts(db)} />
    </AnalysisHandoffContext.Provider>);
    expect(await screen.findByTestId('live-candle-canvas')).toHaveTextContent('oanda-forex EURUSD/5m USD');
    await waitFor(() => expect(screen.getByRole('group', { name: 'Your saved estimates' }).getAttribute('data-saved-snapshot-status')).toBe('loaded'));
    expect(screen.getByText('No candle at that minute. Forex is closed at weekends, and a quiet minute can have none.')).toBeTruthy();
    expect(metadata.acquireInstrumentMetadata).not.toHaveBeenCalled();
    cleanup();
    // Without the Kairos server there are no forex candles: the Analysis page says why the record didn't open.
    render(<AnalysisHandoffContext.Provider value={parseAnalysisHandoff(new URL(href, 'https://kairos.invalid').searchParams)}>
      <AnalysisHistoryWorkspace ports={{ metadata, forexCandles: false }} LiveCanvas={LiveCanvas} savedSnapshots={createAnalysisSavedTimeAssistedSnapshotPorts(db)} />
    </AnalysisHandoffContext.Provider>);
    expect(await screen.findByText("Forex candles need the Kairos server. Your saved EUR/USD record can't open here.")).toBeTruthy();
  });
});
