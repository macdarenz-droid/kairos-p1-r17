import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import { AnalysisLiveCandleCanvas } from '../src/app/AnalysisLiveCandleCanvas';
import type { AnalysisLiveCandleCanvasProps } from '../src/app/AnalysisLiveCandleCanvas';
import { AnalysisSavedTradeOverlayLiveCandleCanvas } from '../src/app/AnalysisSavedTradeOverlayLiveCandleCanvas';
import { AnalysisSavedTradeRiskRewardEvidencePresentation } from '../src/app/AnalysisSavedTradeRiskRewardEvidencePresentation';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeRiskRewardPresentationResult } from '../src/app/analysisSavedTradeRiskRewardPresentationSession';
import type { AnalysisLiveCandleReactBindingOptions, AnalysisLiveCandleReactBindingResult } from '../src/app/useAnalysisLiveCandleRouteSession';
import type { AnalysisSavedTradeOverlayReactBindingOptions } from '../src/app/useAnalysisSavedTradeOverlayPresentationSession';
import { ThemeProvider } from '../src/design-system/themes';
import type { DecimalString } from '../src/domain/trades';
import type { MarketCandle, MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';

const d = (value: string) => value as DecimalString;
const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const ready = (side: 'long' | 'short', entry: string, stop: string, target: string) => ({
  logical: { kind: 'risk-reward-ready', analysis: { id: 'rr', side, levels: { entry: d(entry), stop: d(stop), target: d(target) } } },
}) as unknown as AnalysisSavedTradeRiskRewardPresentationResult;
const unavailable = (reason: string) => ({ logical: { kind: 'unavailable', reason, referenceReason: null } }) as unknown as AnalysisSavedTradeRiskRewardPresentationResult;
const box = () => screen.getByRole('region', { name: 'Saved trade position box' });

describe('Saved trade position box presentation', () => {
  it('shows exact planned levels, reward and risk with percent of entry, the planned ratio and the live R with its source', () => {
    render(<AnalysisSavedTradeRiskRewardEvidencePresentation presentation={ready('long', '100', '95', '115')} lastError={null} symbol="ETHUSDT" quoteAsset="USDT" lastClose={d('107.5')} lastCloseSource="live" />);
    expect(box().getAttribute('data-saved-trade-risk-reward-evidence')).toBe('ready');
    expect(box().getAttribute('data-live-r')).toBe('profit');
    expect(box().getAttribute('data-live-r-exact')).toBe('1.5');
    expect(box().getAttribute('data-planned-ratio-exact')).toBe('3');
    expect(screen.getByText('+1.50 R')).toBeTruthy();
    expect(screen.getByText('+15 · 15.00%')).toBeTruthy();
    expect(screen.getByText('−5 · 5.00%')).toBeTruthy();
    expect(screen.getByText('1 : 3.00')).toBeTruthy();
    expect(screen.getByText('115')).toBeTruthy();
    expect(screen.getByText('Live R at 107.5 USDT · last rendered live candle. Prices in USDT. Nothing here is written to the journal.')).toBeTruthy();
  });

  it('falls back to the planned ratio as the headline while no close exists and tones a short under water as loss', () => {
    const { rerender } = render(<AnalysisSavedTradeRiskRewardEvidencePresentation presentation={ready('short', '2000', '2050', '1900')} lastError={null} symbol="ETHUSDT" quoteAsset="USDT" lastClose={null} lastCloseSource={null} />);
    expect(box().getAttribute('data-live-r')).toBe('unavailable');
    expect(screen.getAllByText('1 : 2.00')).toHaveLength(2);
    expect(screen.getByText(/Live R appears once a candle close is available/)).toBeTruthy();
    rerender(<AnalysisSavedTradeRiskRewardEvidencePresentation presentation={ready('short', '2000', '2050', '1900')} lastError={null} symbol="ETHUSDT" quoteAsset="USDT" lastClose={d('2025')} lastCloseSource="history" />);
    expect(box().getAttribute('data-live-r')).toBe('loss');
    expect(screen.getByText('-0.50 R')).toBeTruthy();
    expect(screen.getByText(/last authoritative history candle/)).toBeTruthy();
  });

  it('fails closed with exact reasons and keeps the refresh alert separate from the last complete box', () => {
    const { rerender } = render(<AnalysisSavedTradeRiskRewardEvidencePresentation presentation={null} lastError={null} symbol="ETHUSDT" quoteAsset="USDT" lastClose={null} lastCloseSource={null} />);
    expect(screen.getByRole('status').textContent).toContain('Preparing the saved trade position box');
    rerender(<AnalysisSavedTradeRiskRewardEvidencePresentation presentation={unavailable('planned-stop-missing')} lastError={null} symbol="ETHUSDT" quoteAsset="USDT" lastClose={null} lastCloseSource={null} />);
    expect(box().getAttribute('data-saved-trade-risk-reward-evidence')).toBe('unavailable');
    expect(screen.getByText('The saved plan has no stop price.')).toBeTruthy();
    rerender(<AnalysisSavedTradeRiskRewardEvidencePresentation presentation={ready('long', '100', '105', '115')} lastError={new Error('x')} symbol="ETHUSDT" quoteAsset="USDT" lastClose={null} lastCloseSource={null} />);
    expect(screen.getByRole('alert').textContent).toContain('could not be refreshed');
    expect(screen.getByText('Stop and target must sit on opposite sides of the entry for this side.')).toBeTruthy();
  });
});

describe('Live canvas latest-candle seam', () => {
  const binding = (overrides: Partial<AnalysisLiveCandleReactBindingResult> = {}): AnalysisLiveCandleReactBindingResult => ({
    availability: 'available', activation: { ok: false, reason: 'superseded' }, connection: null, disposition: null,
    backfillRequest: null, backfillRecovery: null, lastError: null, pan: vi.fn(), zoom: vi.fn(), resetView: vi.fn(), ...overrides,
  });
  const candle: MarketCandle = { openTime: '2026-09-13T16:00:00.000Z', closeTime: '2026-09-13T16:00:59.999Z', open: d('100'), high: d('101'), low: d('99'), close: d('100.5') };

  it('reports only rendered candles to a higher composition owner and clears them when the presentation leaves', () => {
    const onLatestCandle = vi.fn();
    const useBinding = vi.fn((_options: AnalysisLiveCandleReactBindingOptions) => binding({ disposition: { kind: 'ignored-stale' } }));
    const { rerender, unmount } = render(<ThemeProvider><AnalysisLiveCandleCanvas instrument={instrument} interval="1m" quoteAsset="USDT" useBinding={useBinding} onLatestCandle={onLatestCandle} /></ThemeProvider>);
    expect(onLatestCandle).not.toHaveBeenCalled();
    useBinding.mockImplementation(() => binding({ disposition: { kind: 'rendered-next', candle } }));
    rerender(<ThemeProvider><AnalysisLiveCandleCanvas instrument={instrument} interval="1m" quoteAsset="USDT" useBinding={useBinding} onLatestCandle={onLatestCandle} /></ThemeProvider>);
    expect(onLatestCandle).toHaveBeenLastCalledWith(candle);
    unmount();
    expect(onLatestCandle).toHaveBeenLastCalledWith(null);
  });
});

describe('Overlay canvas position box wiring', () => {
  const snapshot = {
    source: 'market-reference', timeZone: 'UTC', request: { instrument, interval: '5m', limit: 500 }, observedAt: '2026-09-15T01:15:00.000Z',
    candles: [
      { openTime: '2026-09-15T01:00:00.000Z', closeTime: '2026-09-15T01:04:59.999Z', open: '100', high: '102', low: '99', close: '101' },
      { openTime: '2026-09-15T01:10:00.000Z', closeTime: '2026-09-15T01:14:59.999Z', open: '101', high: '104', low: '100', close: '110' },
    ],
  } as unknown as MarketCandleHistorySnapshot;
  const liveCandle: MarketCandle = { openTime: '2026-09-15T01:20:00.000Z', closeTime: '2026-09-15T01:24:59.999Z', open: d('110'), high: d('121'), low: d('109'), close: d('120') };

  it('feeds the box the authoritative page close first, then the last rendered live candle, per selection', () => {
    const useOverlayBinding = vi.fn((_options: AnalysisSavedTradeOverlayReactBindingOptions) => ({
      rendererFactory: {} as AnalysisCandleRendererFactory, presentation: { markers: null, riskReward: ready('long', '100', '90', '130'), renderer: {} } as never, markerError: null, riskRewardError: null,
    }));
    const LiveCanvas = vi.fn((props: AnalysisLiveCandleCanvasProps) => (<>
      <button type="button" onClick={() => props.onAuthoritativeSnapshot?.(snapshot)}>Publish snapshot</button>
      <button type="button" onClick={() => props.onLatestCandle?.(liveCandle)}>Publish candle</button>
    </>));
    const view = render(<ThemeProvider><AnalysisSavedTradeOverlayLiveCandleCanvas entry={{} as JournalHistoryEntry} instrument={instrument} interval="5m" quoteAsset="USDT" revision={1} LiveCanvas={LiveCanvas} useOverlayBinding={useOverlayBinding} createLiveSession={vi.fn(() => ({})) as never} createRendererSession={vi.fn(() => ({})) as never} /></ThemeProvider>);
    expect(box().getAttribute('data-live-r')).toBe('unavailable');
    act(() => { screen.getByText('Publish snapshot').click(); });
    expect(screen.getByText('+1.00 R')).toBeTruthy();
    expect(screen.getByText(/last authoritative history candle/)).toBeTruthy();
    act(() => { screen.getByText('Publish candle').click(); });
    expect(screen.getByText('+2.00 R')).toBeTruthy();
    expect(screen.getByText(/last rendered live candle/)).toBeTruthy();
    view.rerender(<ThemeProvider><AnalysisSavedTradeOverlayLiveCandleCanvas entry={{} as JournalHistoryEntry} instrument={instrument} interval="5m" quoteAsset="USDT" revision={2} LiveCanvas={LiveCanvas} useOverlayBinding={useOverlayBinding} createLiveSession={vi.fn(() => ({})) as never} createRendererSession={vi.fn(() => ({})) as never} /></ThemeProvider>);
    expect(box().getAttribute('data-live-r')).toBe('unavailable');
  });
});
