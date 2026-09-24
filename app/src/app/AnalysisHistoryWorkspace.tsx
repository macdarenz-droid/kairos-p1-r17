import { useEffect, useRef, useState, type ComponentType } from 'react';
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
import { normalizeTradeSymbol, pickTradeReviewInterval, tradeReviewTimes } from '../features/analysis/tradeReviewInterval';
import { useAnalysisTradeFocus } from '../features/analysis/useAnalysisTradeFocus';
import './analysisHistory.css';

type Ports = { readonly metadata: LiveMarketUniverseInstrumentMetadataAcquisitionPort };
type Metadata = { readonly phase: 'loading' | 'ready' | 'error'; readonly facts: readonly LiveMarketUniverseInstrumentMetadataFact[] };
type LiveCandleCanvas = ComponentType<AnalysisLiveCandleCanvasProps>;
type SavedTradeLiveCandleCanvas = ComponentType<AnalysisSavedTradeOverlayLiveCandleCanvasProps>;
export const ANALYSIS_HISTORY_REQUEST_TIMEOUT_MS = 15000;

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
  const [tradeSymbolMissing, setTradeSymbolMissing] = useState(false);
  const tradeApplied = useRef<string | null>(null);
  const tradeId = entry?.trade.id ?? null;
  const tradeSymbol = typeof entry?.trade.symbol === 'string' ? entry.trade.symbol : null;
  const tradeTimes = entry && Array.isArray(entry.executions) ? tradeReviewTimes(entry) : null;
  const tradeStartMs = tradeTimes?.startMs ?? null, tradeEndMs = tradeTimes?.endMs ?? null;
  useEffect(() => {
    // "Choose another trade" clears the entry: its "not on Binance Spot" note goes with it.
    if (tradeId === null) setTradeSymbolMissing(false);
  }, [tradeId]);
  useEffect(() => {
    if (tradeId === null || tradeSymbol === null || metadata.phase !== 'ready' || tradeApplied.current === tradeId) return;
    tradeApplied.current = tradeId;
    const wanted = normalizeTradeSymbol(tradeSymbol);
    const match = metadata.facts.find(item => item.instrument.symbol === wanted);
    setTradeSymbolMissing(!match);
    if (!match) return;
    setSymbol(current => (current === '' || autoSymbol.current ? (autoSymbol.current = true, match.instrument.symbol) : current));
    if (tradeStartMs !== null) setTimeframe(current => (current === '' || autoInterval.current ? (autoInterval.current = true, pickTradeReviewInterval(tradeStartMs, Date.now())) : current));
  }, [tradeId, tradeSymbol, tradeStartMs, metadata]);
  const fact = metadata.phase === 'ready' ? metadata.facts.find(item => item.instrument.symbol === symbol) : undefined;
  const selected = Boolean(fact && interval);
  // The saved-trade chart opens on the trade's time window (the renderer session applies it after the first render).
  const tradeWindow = useAnalysisTradeFocus(savedTradePending ? null : entry, interval, revision);
  const estimateMarkers = useAnalysisTimeAssistedMarkers(fact && interval ? [fact.instrument.venue, fact.instrument.symbol, interval, String(revision)].join('|') : null);
  const estimateWindow = useAnalysisTimeAssistedWindow(fact && interval ? [fact.instrument.venue, fact.instrument.symbol, interval, String(revision)].join('|') : null);
  const drawingTools = useAnalysisDrawingTools(fact && interval ? { venue: fact.instrument.venue, symbol: fact.instrument.symbol, interval, revision } : null, estimateMarkers.lifecycle, estimateWindow.lifecycle);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setMetadata({ phase: 'loading', facts: [] });
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false; controller.abort(); setMetadata({ phase: 'error', facts: [] });
    }, ANALYSIS_HISTORY_REQUEST_TIMEOUT_MS);
    void ports.metadata.acquireInstrumentMetadata({ signal: controller.signal }).then(result => {
      if (!active) return;
      window.clearTimeout(timeout);
      if (!result.ok) { setMetadata({ phase: 'error', facts: [] }); return; }
      const counts = new Map<string, number>();
      for (const item of result.facts) if (item.instrument.venue === BINANCE_SPOT_VENUE) counts.set(item.instrument.symbol, (counts.get(item.instrument.symbol) ?? 0) + 1);
      const facts = result.facts.filter(item => item.instrument.venue === BINANCE_SPOT_VENUE && item.tradingEnabled && counts.get(item.instrument.symbol) === 1).slice().sort((a, b) => a.instrument.symbol.localeCompare(b.instrument.symbol));
      setMetadata({ phase: 'ready', facts });
    }).catch(() => { if (active) { window.clearTimeout(timeout); setMetadata({ phase: 'error', facts: [] }); } });
    return () => { active = false; window.clearTimeout(timeout); controller.abort(); };
  }, [ports.metadata, metadataRevision]);

  return <section className="kairos-analysis-chart" aria-labelledby="kairos-chart-title">
    <div className="kairos-analysis-chart__heading"><h2 id="kairos-chart-title">Market chart</h2><span>Binance Spot · Historical + live</span></div>
    <div className="kairos-analysis-chart__selection">
      <SymbolPicker facts={metadata.facts} value={fact ? symbol : ''} onChange={next => { autoSymbol.current = false; setSymbol(next); }} disabled={metadata.phase !== 'ready' || !metadata.facts.length} />
      <label><span>Timeframe</span><select aria-label="Timeframe" value={interval} onChange={event => { autoInterval.current = false; setTimeframe(event.target.value); }}><option value="">Choose timeframe</option>{BINANCE_SPOT_CANDLE_INTERVALS.map(value => <option key={value} value={value}>{value === '1M' ? '1 month' : value}</option>)}</select></label>
    </div>
    {tradeSymbolMissing && !fact ? <p role="status">This trade's symbol is not on Binance Spot.</p> : null}
    {metadata.phase === 'loading' ? <p role="status">Loading supported symbols…</p> : metadata.phase === 'error' ? <div role="alert"><p>Supported symbols are unavailable. Check your connection.</p><button type="button" onClick={() => setMetadataRevision(value => value + 1)}>Retry symbols</button></div> : !metadata.facts.length ? <p role="status">No supported symbols are available.</p> : !selected ? <div className="kairos-analysis-chart__empty"><p>Choose a symbol and timeframe to explore its candles.</p><p className="kairos-analysis-chart__note">You can use this chart without a saved trade.</p></div> : null}
    {selected ? <>
      <div className="kairos-analysis-chart__heading"><strong>{symbol} · {interval === '1M' ? '1 month' : interval}</strong><button type="button" onClick={() => setRevision(value => value + 1)}>Refresh candles</button></div>
      <div className="kairos-analysis-chart__controls">
        <AnalysisDrawingToolsControls state={drawingTools.state} drawingCount={drawingTools.drawingCount} onSelectTrendLine={drawingTools.selectTrendLineTool} onCancel={drawingTools.cancel} onDeleteSelected={drawingTools.deleteSelected} onSelectZone={drawingTools.selectZoneTool} zoneCount={drawingTools.zoneCount} selectedKind={drawingTools.selectedKind} />
        <AnalysisSavedAnalysisControls ports={savedAnalysis} market={fact && interval ? analysisMarketReference(fact.instrument) : null} drawingCount={drawingTools.drawingCount} getDrawings={drawingTools.getDrawings} onLoad={drawingTools.loadDrawings} />
        <AnalysisTimeAssistedSnapshotControls instrument={fact ? fact.instrument : null} onSnapshot={estimateMarkers.present} markers={estimateMarkers.presentation} onShowWindow={estimateWindow.show} window={estimateWindow.last} />
      </div>
      {fact && savedTradePending ? <p role="status">Preparing the saved trade chart…</p> : null}
      <AnalysisOverlaySessionFactoryContext.Provider value={drawingTools.overlaySessionFactory}>
      <AnalysisTradeWindowContext.Provider value={tradeWindow}>
      {fact && !savedTradePending && entry ? <SavedTradeLiveCanvas entry={entry} instrument={fact.instrument} interval={interval} quoteAsset={fact.quoteAsset} revision={revision} /> : null}
      </AnalysisTradeWindowContext.Provider>
      </AnalysisOverlaySessionFactoryContext.Provider>
      <AnalysisLiveSessionFactoryContext.Provider value={drawingTools.liveSessionFactory}>
      {fact && !savedTradePending && !entry ? <LiveCanvas instrument={fact.instrument} interval={interval} quoteAsset={fact.quoteAsset} revision={revision} /> : null}
      </AnalysisLiveSessionFactoryContext.Provider>
      <p className="kairos-analysis-chart__note">Shows the latest {ANALYSIS_LIVE_CANDLE_HISTORY_LIMIT} candles. Connection status is shown above the chart.</p>
    </> : null}
    <p className="kairos-analysis-chart__note">Market reference only. Saved trade prices and results stay separate.</p>
    <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">Charts powered by TradingView Lightweight Charts™</a>
  </section>;
}
