import { useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { useTheme } from '../design-system/themes';
import type { MarketCandle, MarketCandleHistorySnapshot } from '../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';
import type { createAnalysisLiveCandleRouteSession } from './analysisLiveCandleRouteSession';
import { presentAnalysisLiveCandleStatus } from './analysisLiveCandleStatusPresentation';
import { AnalysisLiveSessionFactoryContext } from './analysisDrawingToolsContext';
import {
  useAnalysisLiveCandleRouteSession,
  type AnalysisLiveCandleReactBindingOptions,
  type AnalysisLiveCandleReactBindingResult,
} from './useAnalysisLiveCandleRouteSession';

export interface AnalysisLiveCandleCanvasProps {
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  /** Caller-authoritative display unit from the selected metadata fact. */
  readonly quoteAsset: string;
  /** Caller-owned refresh key; changing it reacquires the exact selected scope. */
  readonly revision?: number;
  /** Optional released route-session factory supplied by a higher composition owner. */
  readonly createSession?: typeof createAnalysisLiveCandleRouteSession;
  /** Reports only the exact successful activation snapshot already rendered here. */
  readonly onAuthoritativeSnapshot?: (snapshot: MarketCandleHistorySnapshot | null) => void;
  /** Reports only the exact candle the released live projection last rendered here; null when this presentation leaves. */
  readonly onLatestCandle?: (candle: MarketCandle | null) => void;
  readonly useBinding?: (options: AnalysisLiveCandleReactBindingOptions) => AnalysisLiveCandleReactBindingResult;
}

type ViewportControls = Pick<AnalysisLiveCandleReactBindingResult, 'pan' | 'zoom' | 'resetView'>;

interface MountedPresentationProps extends AnalysisLiveCandleCanvasProps {
  readonly container: HTMLElement;
  readonly helpId: string;
  readonly themeId: ReturnType<typeof useTheme>['themeId'];
  readonly publishControls: (controls: ViewportControls | null) => void;
}

function MountedPresentation({
  container,
  instrument,
  interval,
  quoteAsset,
  revision = 0,
  createSession,
  onAuthoritativeSnapshot,
  onLatestCandle,
  helpId,
  themeId,
  useBinding = useAnalysisLiveCandleRouteSession,
  publishControls,
}: MountedPresentationProps) {
  const binding = useBinding({ container, instrument, interval, themeId, revision, createSession });
  const presentation = presentAnalysisLiveCandleStatus(binding);
  const activationSnapshot = binding.activation?.ok ? binding.activation.snapshot : null;
  const snapshot = activationSnapshot
    && activationSnapshot.request.instrument.venue === instrument.venue
    && activationSnapshot.request.instrument.symbol === instrument.symbol
    && activationSnapshot.request.interval === interval
    ? activationSnapshot
    : null;

  useEffect(() => {
    onAuthoritativeSnapshot?.(snapshot);
    return () => onAuthoritativeSnapshot?.(null);
  }, [onAuthoritativeSnapshot, snapshot]);

  const disposition = binding.disposition;
  const latestCandle = disposition?.kind === 'rendered-current' || disposition?.kind === 'rendered-next' ? disposition.candle : null;
  useEffect(() => {
    if (latestCandle !== null) onLatestCandle?.(latestCandle);
  }, [latestCandle, onLatestCandle]);
  useEffect(() => () => onLatestCandle?.(null), [onLatestCandle]);

  useEffect(() => {
    const controls = { pan: binding.pan, zoom: binding.zoom, resetView: binding.resetView };
    publishControls(controls);
    return () => publishControls(null);
  }, [binding.pan, binding.resetView, binding.zoom, publishControls]);

  const urgent = presentation.kind === 'error' || presentation.kind === 'unavailable';
  return <>
    <div
      className={`kairos-analysis-chart__live-status kairos-analysis-chart__live-status--${presentation.kind}`}
      role={urgent ? 'alert' : 'status'}
      aria-live={urgent ? 'assertive' : 'polite'}
      data-live-candle-status={presentation.kind}
    >
      <strong>{instrument.symbol} · {interval} · {presentation.label}</strong>
      <span>{presentation.detail}</span>
    </div>
    <div className="kairos-analysis-chart__tools" aria-label="Live chart view controls">
      <button type="button" onClick={() => binding.zoom(1.25)} aria-label="Zoom out">−</button>
      <button type="button" onClick={() => binding.zoom(.8)} aria-label="Zoom in">+</button>
      <button type="button" onClick={binding.resetView}>Fit candles</button>
    </div>
    {snapshot ? <>
      <p className="kairos-analysis-chart__note">{snapshot.candles.length} candles · Prices in {quoteAsset} · Times in UTC</p>
      <p className="kairos-analysis-chart__note">Snapshot received {snapshot.observedAt.replace('T', ' ').replace('Z', ' UTC')}. Live updates follow this authoritative page; the final candle may be unfinished.</p>
      <details className="kairos-analysis-chart__data">
        <summary>Candle values</summary>
        <div className="kairos-analysis-chart__table-scroll" tabIndex={0} role="region" aria-label="Candle values table">
          <table>
            <caption>{instrument.symbol} · {interval} · UTC · {quoteAsset}</caption>
            <thead><tr><th scope="col">Open time</th><th scope="col">Open</th><th scope="col">High</th><th scope="col">Low</th><th scope="col">Close</th></tr></thead>
            <tbody>{snapshot.candles.map(candle => <tr key={candle.openTime}><th scope="row">{candle.openTime.replace('T', ' ').replace('.000Z', '')}</th><td>{candle.open}</td><td>{candle.high}</td><td>{candle.low}</td><td>{candle.close}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </> : null}
    <p id={helpId} className="kairos-analysis-chart__note">Drag sideways to pan. Pinch or use + / − to zoom. Hold to inspect. Keyboard: arrows, + / − and Home.</p>
  </>;
}

/**
 * Selected-scope presentation boundary for the released live-candle React
 * binding. This component owns only the real chart container, truthful status
 * copy and delegation of existing viewport commands. The Analysis route still
 * decides whether and where to mount it.
 */
export function AnalysisLiveCandleCanvas(props: AnalysisLiveCandleCanvasProps) {
  const { themeId } = useTheme();
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const controls = useRef<ViewportControls | null>(null);
  const helpId = useId();
  const publishControls = useCallback((next: ViewportControls | null) => { controls.current = next; }, []);
  // A higher composition may supply the released route-session factory through context; the prop still wins.
  const contextCreateSession = useContext(AnalysisLiveSessionFactoryContext);
  const createSession = props.createSession ?? contextCreateSession ?? undefined;

  return <>
    <div
      className="kairos-analysis-chart__canvas"
      ref={setContainer}
      tabIndex={0}
      role="group"
      aria-label={`${props.instrument.symbol} ${props.interval} live candlestick chart`}
      aria-describedby={helpId}
      onKeyDown={event => {
        const current = controls.current;
        if (!current) return;
        if (event.key === 'ArrowLeft') current.pan(-.2);
        else if (event.key === 'ArrowRight') current.pan(.2);
        else if (event.key === '+' || event.key === '=') current.zoom(.8);
        else if (event.key === '-') current.zoom(1.25);
        else if (event.key === 'Home') current.resetView();
        else return;
        event.preventDefault();
      }}
    />
    {container ? <MountedPresentation {...props} createSession={createSession} container={container} helpId={helpId} themeId={themeId} publishControls={publishControls} /> : null}
  </>;
}
