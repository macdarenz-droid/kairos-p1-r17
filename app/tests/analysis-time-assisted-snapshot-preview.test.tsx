import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisTimeAssistedSnapshotControls } from '../src/app/AnalysisTimeAssistedSnapshotControls';
import type { MarketCandleHistoryRequest, MarketCandleHistoryResult } from '../src/services/market-data/MarketCandleHistoryPort';
import type { DecimalString } from '../src/domain/trades/tradeTypes';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const candleAt = (startTimeMs: number) => ({ openTime: new Date(startTimeMs).toISOString(), closeTime: new Date(startTimeMs + 59_999).toISOString(), open: '2100.5' as DecimalString, high: '2104' as DecimalString, low: '2099.25' as DecimalString, close: '2102' as DecimalString });
const port = (missing: number[] = []) => ({ acquireHistory: vi.fn(async (request: MarketCandleHistoryRequest): Promise<MarketCandleHistoryResult> => ({ ok: true, snapshot: { source: 'market-reference', timeZone: 'UTC', request, observedAt: '2026-09-17T12:00:00.000Z', candles: missing.includes(request.startTimeMs!) ? [] : [candleAt(request.startTimeMs!)] } })) });
const now = () => Date.parse('2026-09-17T12:00:00.000Z');
const section = () => screen.getByRole('region', { name: 'Time-assisted snapshot' });

describe('P22.3 time-assisted snapshot preview', () => {
  it('renders nothing without a selected market and a form with the device time zone once selected', () => {
    const { rerender } = render(<AnalysisTimeAssistedSnapshotControls history={port()} instrument={null} now={now} />);
    expect(screen.queryByRole('region', { name: 'Time-assisted snapshot' })).toBeNull();
    rerender(<AnalysisTimeAssistedSnapshotControls history={port()} instrument={instrument} now={now} />);
    expect(section().getAttribute('data-time-assisted-status')).toBe('idle');
    expect(screen.getByText(/Times are in your device time zone/)).toBeTruthy();
    expect(screen.getByText(/never your fill, and nothing is saved/)).toBeTruthy();
  });

  it('estimates entry and exit through the released composition and shows the exact candle ranges, never a fill', async () => {
    const p = port();
    render(<AnalysisTimeAssistedSnapshotControls history={p} instrument={instrument} now={now} />);
    fireEvent.change(screen.getByLabelText('Snapshot side'), { target: { value: 'short' } });
    fireEvent.change(screen.getByLabelText('Snapshot opened at'), { target: { value: '2026-09-10T02:13:27' } });
    fireEvent.change(screen.getByLabelText('Snapshot closed at'), { target: { value: '2026-09-10T04:30:00' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Estimate' })); });
    await waitFor(() => expect(section().getAttribute('data-time-assisted-status')).toBe('snapshot'));
    expect(p.acquireHistory).toHaveBeenCalledTimes(2);
    expect(p.acquireHistory.mock.calls[0][0]).toMatchObject({ instrument, interval: '1m', limit: 1, startTimeMs: Date.parse('2026-09-10T02:13:00') });
    const entry = section().querySelector('[data-estimate="entry"]')!;
    expect(entry.getAttribute('data-estimate-kind')).toBe('candle-range');
    expect(entry.getAttribute('data-candle-low')).toBe('2099.25');
    expect(entry.getAttribute('data-candle-high')).toBe('2104');
    expect(entry.textContent).toContain('27s after its open. Not your fill.');
    expect(entry.textContent).toContain('2099.25 – 2104');
    expect(section().querySelector('[data-estimate="exit"]')!.getAttribute('data-estimate-kind')).toBe('candle-range');
    expect(screen.getByText(/Short · held 2h 16m 33s · ETHUSDT on binance-spot/)).toBeTruthy();
  });

  it('reports request problems and per-instant unavailability in plain words', async () => {
    const p = port([Date.parse('2026-09-10T04:30:00')]);
    render(<AnalysisTimeAssistedSnapshotControls history={p} instrument={instrument} now={now} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Estimate' })); });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Enter the opening date and time.'));
    expect(p.acquireHistory).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Snapshot opened at'), { target: { value: '2026-09-10T04:30:00' } });
    fireEvent.change(screen.getByLabelText('Snapshot closed at'), { target: { value: '2026-09-10T02:13:27' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Estimate' })); });
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('The closing time must not be before the opening time.'));
    fireEvent.change(screen.getByLabelText('Snapshot opened at'), { target: { value: '2026-09-10T02:13:27' } });
    fireEvent.change(screen.getByLabelText('Snapshot closed at'), { target: { value: '2026-09-10T04:30:00' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Estimate' })); });
    await waitFor(() => expect(section().getAttribute('data-time-assisted-status')).toBe('snapshot'));
    const exit = section().querySelector('[data-estimate="exit"]')!;
    expect(exit.getAttribute('data-estimate-kind')).toBe('unavailable');
    expect(exit.textContent).toContain('No market candle exists for that minute on this venue.');
    fireEvent.change(screen.getByLabelText('Snapshot closed at'), { target: { value: '' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Estimate' })); });
    await waitFor(() => expect(screen.getByText(/still open/)).toBeTruthy());
    expect(section().querySelector('[data-estimate="exit"]')).toBeNull();
  });
});
