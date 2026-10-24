import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react';
import { ANALYSIS_HANDOFF_DEFAULT_INTERVAL, useAnalysisHandoff } from './analysisHandoff';
import type { JournalHistoryEntry } from '../application/journal';
import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort } from '../services/market-data/LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../services/market-data/liveMarketUniverseInstrumentMetadataFact';
import { BINANCE_SPOT_CANDLE_INTERVALS } from '../services/market-data/providers/binance/binanceSpotCandleHistoryRequest';
import { BINANCE_SPOT_VENUE } from '../services/market-data/providers/binance/binanceSpotTradeStream';
import { analysisHistoryPorts } from './analysisHistoryPorts';
import { ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT } from './analysisLiveCandleProductPolicy';
import { AnalysisDrawingToolsControls } from '../features/analysis/AnalysisDrawingToolsControls';
import { AnalysisLiveSessionFactoryContext, AnalysisOverlaySessionFactoryContext, AnalysisTradeWindowContext } from './analysisDrawingToolsContext';
import { useAnalysisDrawingTools } from './useAnalysisDrawingTools';
import { AnalysisSavedAnalysisControls } from './AnalysisSavedAnalysisControls';
import { AnalysisTimeAssistedSnapshotControls } from './AnalysisTimeAssistedSnapshotControls';
import { useAnalysisTimeAssistedMarkers } from './useAnalysisTimeAssistedMarkers';
import { useAnalysisTimeAssistedWindow } from './useAnalysisTimeAssistedWindow';
import { analysisMarketReference, analysisSavedAnalysisPorts, type AnalysisSavedAnalysisPorts } from './analysisSavedAnalysisRoundTrip';
import { AnalysisLiveCandleCanvas, type AnalysisLiveCandleCanvasProps } from './AnalysisLiveCandleCanvas';
import {
  AnalysisSavedTradeOverlayLiveCandleCanvas,
  type AnalysisSavedTradeOverlayLiveCandleCanvasProps,
} from './AnalysisSavedTradeOverlayLiveCandleCanvas';
import { SymbolPicker } from '../features/analysis/SymbolPicker';
import { pickTradeReviewInterval, tradeReviewTimes } from '../features/analysis/tradeReviewInterval';
import { useAnalysisTradeFocus } from '../features/analysis/useAnalysisTradeFocus';
import { describeNoCandleSource, FOREX_CANDLES_NEED_SERVER, tradePictureCandleSource } from '../application/trade-visualizer/tradePictureCandles';
import { describeFuturesOnlyOnChart, futuresOnlyMarket, matchCryptoMarket, matchNoteFor } from '../application/market-reference/cryptoMarket';
import { describeMarketDataUnavailable } from '../application/online/onlineWords';
import { OANDA_FOREX_VENUE, type MarketDataInstrument, type MarketDataUnavailable } from '../services/market-data/marketDataTypes';
import { parseForexPair } from '../application/markets/forexPair';
import { UnavailableNotice } from '../design-system/primitives';
import './analysisHistory.css';

type Ports = {
  readonly metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort;
  /** False in a build without the Kairos server: no forex candles (D231). */
  readonly forexCandles?: boolean;
};
type Metadata = { readonly phase: 'loading' | 'ready' | 'error'; readonly facts: readonly LiveMarketUniverseInstrumentMetadataFact[]; readonly failure?: MarketDataUnavailable };
type LiveCandleCanvas = ComponentType<AnalysisLiveCandleCanvasProps>;
type SavedTradeLiveCandleCanvas = ComponentType<AnalysisSavedTradeOverlayLiveCandleCanvasProps>;
export const ANALYSIS_HISTORY_REQUEST_TIMEOUT_MS = 15000;
/** U10 (D234): the forex chart's timeframes, all of which OANDA has. */
export const FOREX_ANALYSIS_INTERVALS = Object.freeze(['1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'] as const);

/** What the chart draws: a Binance Spot market from the list, or a forex trade's OANDA pair. */
type ChartMarket = { readonly instrument: MarketDataInstrument; readonly quoteAsset: string };

/** Ephemeral Analysis selection lifecycle. The released live canvas owns history and transport; the released overlay composition owns saved-trade markers and Risk/Reward. */
export function AnalysisHistoryWorkspace({
  entry = null,
  savedTradePending = false,
  ports = analysisHistoryPorts,
  LiveCanvas = AnalysisLiveCandleCanvas,
  SavedTradeLiveCanvas = AnalysisSavedTradeOverlayLiveCandleCanvas,
  savedAnalysis = analysisSavedAnalysisPorts,
}: {
  readonly entry?: JournalHistoryEntry | null;
  readonly savedTradePending?: boolean;
  readonly ports?: Ports;
  readonly LiveCanvas?: LiveCandleCanvas;
  readonly SavedTradeLiveCanvas?: SavedTradeLiveCandleCanvas;
  readonly savedAnalysis?: AnalysisSavedAnalysisPorts;
}) {
  const [metadata, setMetadata] = useState<Metadata>({ phase: 'loading', facts: [] });
  const [metadataRevision, setMetadataRevision] = useState(0);
  const retryMetadata = useCallback(() => setMetadataRevision(value => value + 1), []);
  const [symbol, setSymbol] = useState('');
  const [interval, setTimeframe] = useState('');
  const [revision, setRevision] = useState(0);
  // Whether the current symbol / timeframe were filled in automatically. A later automatic pick may replace
  // an automatic one, never the user's own choice.
  const autoSymbol = useRef(false), autoInterval = useRef(false);
  const handoff = useAnalysisHandoff();
  const handoffApplied = useRef(false);
  useEffect(() => {
    if (handoff === null || handoffApplied.current || metadata.phase !== 'ready') return;
    handoffApplied.current = true;
    const match = metadata.facts.find(item => item.instrument.venue === handoff.market.venue && item.instrument.symbol === handoff.market.instrument);
    if (!match) return;
    setSymbol(current => (current === '' || autoSymbol.current ? (autoSymbol.current = true, match.instrument.symbol) : current));
    setTimeframe(current => (current === '' || autoInterval.current ? (autoInterval.current = true, ANALYSIS_HANDOFF_DEFAULT_INTERVAL) : current));
  }, [handoff, metadata]);
  // "View trade" (?trade=): pre-select the trade's symbol and a timeframe that fits it, once per trade, never over a user's choice.
  // The matching owner's sentence for the trade's symbol: not listed, or matched from another spelling (null when exact).
  const [tradeSymbolNote, setTradeSymbolNote] = useState<{ readonly symbol: string | null; readonly note: string } | null>(null);
  const tradeApplied = useRef<string | null>(null);
  const tradeId = entry?.trade.id ?? null;
  const tradeSymbol = typeof entry?.trade.symbol === 'string' ? entry.trade.symbol : null;
  // U10 (D235): a forex pair's chart is OANDA's, through the Kairos server; stocks and a forex symbol that is not a pair have none.
  // Neither is ever matched to a Binance symbol.
  const tradeSource = entry != null ? tradePictureCandleSource(entry.trade.marketType, tradeSymbol ?? '') : null;
  const forexPair = useMemo(() => {
    if (tradeSource !== 'forex' || tradeSymbol === null) return null;
    const parsed = parseForexPair(tradeSymbol);
    return parsed.ok ? parsed.pair : null;
  }, [tradeSource, tradeSymbol]);
  const forexWithoutServer = forexPair !== null && ports.forexCandles === false;
  const forexMarket = useMemo<ChartMarket | null>(() => (forexPair === null || forexWithoutServer ? null
    : { instrument: Object.freeze({ venue: OANDA_FOREX_VENUE, symbol: forexPair.symbol }), quoteAsset: forexPair.quote }), [forexPair, forexWithoutServer]);
  const tradeOffChart = entry != null && (tradeSource === null || forexWithoutServer);
  const offChartTrade = entry?.trade.marketType === 'stock' ? 'Your stock trade' : entry?.trade.marketType === 'forex' ? 'Your forex trade' : 'This trade';
  const offChartReason = forexWithoutServer ? FOREX_CANDLES_NEED_SERVER
    : entry?.trade.marketType === 'forex' ? describeNoCandleSource('forex') : 'The market chart has crypto and forex markets for now.';
  const tradeTimes = entry && Array.isArray(entry.executions) ? tradeReviewTimes(entry) : null;
  const tradeStartMs = tradeTimes?.startMs ?? null, tradeEndMs = tradeTimes?.endMs ?? null;
  useEffect(() => {
    // "Choose another trade" clears the entry: its "not on Binance Spot" note goes with it.
    if (tradeId === null) setTradeSymbolNote(null);
  }, [tradeId]);
  useEffect(() => {
    // A forex pair needs no market list: its timeframe is picked at once.
    if (tradeId === null || forexMarket === null || tradeApplied.current === tradeId) return;
    tradeApplied.current = tradeId;
    setTradeSymbolNote(null);
    if (tradeStartMs !== null) setTimeframe(current => (current === '' || autoInterval.current ? (autoInterval.current = true, pickTradeReviewInterval(tradeStartMs, Date.now())) : current));
  }, [tradeId, forexMarket, tradeStartMs]);
  useEffect(() => {
    if (tradeId === null || tradeSymbol === null || forexMarket !== null || metadata.phase !== 'ready' || tradeApplied.current === tradeId) return;
    tradeApplied.current = tradeId;
    if (tradeOffChart) { setTradeSymbolNote(null); return; }
    const marketType = entry?.trade.marketType ?? 'crypto';
    const match = matchCryptoMarket(tradeSymbol, marketType, metadata.facts);
    // The market chart is always Binance Spot: no "Futures candles." here, and a futures-only market is not "unlisted" (D171).
    const note = match.ok ? matchNoteFor(match, 'spot')
      : match.why === 'not-listed' && futuresOnlyMarket(tradeSymbol, marketType) !== null ? describeFuturesOnlyOnChart() : match.note;
    setTradeSymbolNote(match.ok ? (note === null ? null : { symbol: match.symbol, note }) : { symbol: null, note: note ?? match.note });
    if (!match.ok) return;
    setSymbol(current => (current === '' || autoSymbol.current ? (autoSymbol.current = true, match.symbol) : current));
    if (tradeStartMs !== null) setTimeframe(current => (current === '' || autoInterval.current ? (autoInterval.current = true, pickTradeReviewInterval(tradeStartMs, Date.now())) : current));
  }, [tradeId, tradeSymbol, tradeOffChart, forexMarket, tradeStartMs, metadata, entry?.trade.marketType]);
  const fact = metadata.phase === 'ready' ? metadata.facts.find(item => item.instrument.symbol === symbol) : undefined;
  const market: ChartMarket | undefined = forexMarket ?? fact;
  const intervals: readonly string[] = forexMarket !== null ? FOREX_ANALYSIS_INTERVALS : BINANCE_SPOT_CANDLE_INTERVALS;
  // A forex chart takes only OANDA's timeframes; a Binance choice made before stays unselected.
  const forexIntervalMissing = forexMarket !== null && !intervals.includes(interval);
  const selected = Boolean(market && interval && !forexIntervalMissing);
  // The saved-trade chart opens on the trade's time window (the renderer session applies it after the first render).
  const tradeWindow = useAnalysisTradeFocus(savedTradePending ? null : entry, interval, revision);
  const estimateMarkers = useAnalysisTimeAssistedMarkers(market && interval ? [market.instrument.venue, market.instrument.symbol, interval, String(revision)].join('|') : null);
  const estimateWindow = useAnalysisTimeAssistedWindow(market && interval ? [market.instrument.venue, market.instrument.symbol, interval, String(revision)].join('|') : null);
  const drawingTools = useAnalysisDrawingTools(market && interval ? { venue: market.instrument.venue, symbol: market.instrument.symbol, interval, revision } : null, estimateMarkers.lifecycle, estimateWindow.lifecycle);

  // A forex pair's chart needs no Binance market list.
  const needsMarketList = forexMarket === null;
  useEffect(() => {
    if (!needsMarketList) return;
    let active = true;
    const controller = new AbortController();
    setMetadata({ phase: 'loading', facts: [] });
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false; controller.abort(); setMetadata({ phase: 'error', facts: [], failure: noAnswer() });
    }, ANALYSIS_HISTORY_REQUEST_TIMEOUT_MS);
    void ports.metadata.acquireInstrumentMetadata({ signal: controller.signal }).then(result => {
      if (!active) return;
      window.clearTimeout(timeout);
      if (!result.ok) { setMetadata({ phase: 'error', facts: [], failure: result.reason === 'unavailable' ? result : noAnswer() }); return; }
      const counts = new Map<string, number>();
      for (const item of result.facts) if (item.instrument.venue === BINANCE_SPOT_VENUE) counts.set(item.instrument.symbol, (counts.get(item.instrument.symbol) ?? 0) + 1);
      const facts = result.facts.filter(item => item.instrument.venue === BINANCE_SPOT_VENUE && item.tradingEnabled && counts.get(item.instrument.symbol) === 1).slice().sort((a, b) => a.instrument.symbol.localeCompare(b.instrument.symbol));
      setMetadata({ phase: 'ready', facts });
    }).catch(() => { if (active) { window.clearTimeout(timeout); setMetadata({ phase: 'error', facts: [], failure: noAnswer() }); } });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [ports.metadata, metadataRevision, needsMarketList]);

  return <section className="kairos-analysis-chart" aria-labelledby="kairos-chart-title">
    <div className="kairos-analysis-chart__heading"><h2 id="kairos-chart-title">Market chart</h2><span>{forexPair !== null && forexMarket !== null ? `OANDA · ${forexPair.label} · mid prices` : 'Binance Spot · Historical + live'}</span></div>
    <div className="kairos-analysis-chart__selection">
      {forexMarket !== null && forexPair !== null
        ? <p className="kairos-analysis-chart__pair"><span>Market</span> <strong>{forexPair.label}</strong></p>
        : <SymbolPicker facts={metadata.facts} value={fact ? symbol : ''} onChange={next => { autoSymbol.current = false; setSymbol(next); }} disabled={metadata.phase !== 'ready' || !metadata.facts.length} />}
      <label><span>Timeframe</span><select aria-label="Timeframe" value={forexIntervalMissing ? '' : interval} onChange={event => { autoInterval.current = false; setTimeframe(event.target.value); }}><option value="">Choose timeframe</option>{intervals.map(value => <option key={value} value={value}>{value === '1M' ? '1 month' : value}</option>)}</select></label>
    </div>
    {tradeOffChart && !fact ? <p role="status">{`${offChartReason} ${offChartTrade} is drawn in its picture above, with your plan, entries and exits.`}</p>
      : tradeSymbolNote !== null && tradeSymbolNote.symbol === null && !fact ? <p role="status">This trade's symbol is not on Binance Spot. <span>{tradeSymbolNote.note}</span></p>
      : tradeSymbolNote !== null && fact && tradeSymbolNote.symbol === symbol ? <p role="status">{tradeSymbolNote.note}</p> : null}
    {forexMarket !== null ? (!selected ? <p role="status">Choose a timeframe to see this pair's candles.</p> : null)
      : metadata.phase === 'loading' ? <p role="status">Loading supported symbols…</p> : metadata.phase === 'error' ? <MarketsUnavailable failure={metadata.failure ?? noAnswer()} onRetry={retryMetadata} /> : !metadata.facts.length ? <p role="status">No supported symbols are available.</p> : !selected ? <div className="kairos-analysis-chart__empty"><p>Choose a symbol and timeframe to explore its candles.</p><p className="kairos-analysis-chart__note">You can use this chart without a saved trade.</p></div> : null}
    {selected && market ? <>
      <div className="kairos-analysis-chart__heading"><strong>{forexMarket !== null && forexPair !== null ? forexPair.label : symbol} · {interval === '1M' ? '1 month' : interval}</strong><button type="button" onClick={() => setRevision(value => value + 1)}>Refresh candles</button></div>
      <div className="kairos-analysis-chart__controls">
        <AnalysisDrawingToolsControls state={drawingTools.state} drawingCount={drawingTools.drawingCount} onSelectTrendLine={drawingTools.selectTrendLineTool} onCancel={drawingTools.cancel} onDeleteSelected={drawingTools.deleteSelected} onSelectZone={drawingTools.selectZoneTool} zoneCount={drawingTools.zoneCount} selectedKind={drawingTools.selectedKind} onSelectRiskBox={drawingTools.selectRiskBoxTool} riskBoxCount={drawingTools.riskBoxCount} selectedLabel={drawingTools.selectedLabel} />
        <AnalysisSavedAnalysisControls ports={savedAnalysis} market={interval ? analysisMarketReference(market.instrument) : null} drawingCount={drawingTools.drawingCount} getDrawings={drawingTools.getDrawings} onLoad={drawingTools.loadDrawings} riskBoxCount={drawingTools.riskBoxCount} getRiskBoxes={drawingTools.getRiskBoxes} onLoadRiskBoxes={drawingTools.loadRiskBoxes} />
        <AnalysisTimeAssistedSnapshotControls instrument={market.instrument} onSnapshot={estimateMarkers.present} markers={estimateMarkers.presentation} onShowWindow={estimateWindow.show} window={estimateWindow.last} />
      </div>
      {savedTradePending ? <p role="status">Preparing the saved trade chart…</p> : null}
      <AnalysisOverlaySessionFactoryContext.Provider value={drawingTools.overlaySessionFactory}>
      <AnalysisTradeWindowContext.Provider value={tradeWindow}>
      {!savedTradePending && entry ? <SavedTradeLiveCanvas entry={entry} instrument={market.instrument} interval={interval} quoteAsset={market.quoteAsset} revision={revision} /> : null}
      </AnalysisTradeWindowContext.Provider>
      </AnalysisOverlaySessionFactoryContext.Provider>
      <AnalysisLiveSessionFactoryContext.Provider value={drawingTools.liveSessionFactory}>
      {!savedTradePending && !entry ? <LiveCanvas instrument={market.instrument} interval={interval} quoteAsset={market.quoteAsset} revision={revision} /> : null}
      </AnalysisLiveSessionFactoryContext.Provider>
      <p className="kairos-analysis-chart__note">Shows the latest {ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT} candles. Connection status is shown above the chart.</p>
    </> : null}
    <p className="kairos-analysis-chart__note">Market reference only. Saved trade prices and results stay separate.</p>
    <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts powered by TradingView Lightweight Charts™</a>
  </section>;
}

/** A failure the port did not explain (a time limit, a thrown error): offline, or the source did not answer. */
function noAnswer(): MarketDataUnavailable {
  return { ok: false, reason: 'unavailable', why: typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'source-down', retryAfterSeconds: null };
}

function MarketsUnavailable({ failure, onRetry }: { readonly failure: MarketDataUnavailable; readonly onRetry: () => void }) {
  const words = describeMarketDataUnavailable(failure, 'Markets');
  return <UnavailableNotice message={words.message} retryLabel={words.retryLabel} onRetry={onRetry} retryWhenOnline={words.retryWhenOnline} />;
}
