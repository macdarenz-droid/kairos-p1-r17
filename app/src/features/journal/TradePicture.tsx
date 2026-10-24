import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../../application/journal';
import { describeMarketDataUnavailable, type UnavailableWords } from '../../application/online/onlineWords';
import { projectTradePicture, tradePictureCandleSource, type TradePictureCandlesResult } from '../../application/trade-visualizer';
import { Sheet } from '../../design-system/primitives';
import { TradePictureCard } from './TradePictureCard';
import { TradePictureCandleLoaderContext } from './tradePictureCandleQueue';
import type { TradePictureSavePorts } from './tradePictureImage';
import { TradeShareControls } from './TradeShareControls';

/** `retrying`: "Try again" was tapped; the last answer stays on screen (its box and focused button) until the new one arrives. */
type CandleState = { readonly kind: 'waiting' } | { readonly kind: 'done'; readonly result: TradePictureCandlesResult; readonly retrying?: boolean };

const NO_CANDLE_SOURCE: TradePictureCandlesResult = Object.freeze({ ok: false, why: 'no-candle-source', retryAfterSeconds: null, note: null });
const NO_CANDLES: TradePictureCandlesResult = Object.freeze({ ok: false, why: 'no-candles', retryAfterSeconds: null, note: null });
const SOURCE_DOWN: TradePictureCandlesResult = Object.freeze({ ok: false, why: 'source-down', retryAfterSeconds: null, note: null });

/** What the card shows for the loaded candles: the source line and note, or the words for why there are none. */
function candleCardProps(state: CandleState): { candleSource: string | null; candleNote: string | null; candleFailure: UnavailableWords | null; candleRetrying?: boolean } {
  if (state.kind === 'waiting') return { candleSource: null, candleNote: null, candleFailure: null };
  if (state.retrying) return { ...candleCardProps({ kind: 'done', result: state.result }), candleRetrying: true };
  const { result } = state;
  if (result.ok) return { candleSource: result.source, candleNote: result.note, candleFailure: null };
  switch (result.why) {
    // A source this build cannot ask says so in its note ("Forex candles need the Kairos server.").
    case 'no-candle-source': return { candleSource: null, candleNote: result.note, candleFailure: null };
    case 'no-start':
    case 'no-candles': return { candleSource: null, candleNote: null, candleFailure: null };
    case 'not-listed': return { candleSource: null, candleNote: result.note, candleFailure: null };
    default: return { candleSource: null, candleNote: null, candleFailure: describeMarketDataUnavailable({ ok: false, reason: 'unavailable', why: result.why, retryAfterSeconds: result.retryAfterSeconds }, 'Candles', result.source) };
  }
}

/** Loads the trade's candles once the picture is on screen (at once where the browser cannot tell); `reload` asks again. */
function useTradePictureCandles(entry: JournalHistoryEntry, target: React.RefObject<Element | null>, eager: boolean): { readonly state: CandleState; readonly reload: () => void } {
  const contextLoader = useContext(TradePictureCandleLoaderContext);
  const [visible, setVisible] = useState(eager);
  const [state, setState] = useState<CandleState>({ kind: 'waiting' });
  const [revision, setRevision] = useState(0);
  const retryRequested = useRef(false);
  const reload = useCallback(() => { retryRequested.current = true; setRevision(value => value + 1); }, []);
  const hasSource = tradePictureCandleSource(entry.trade.marketType, entry.trade.symbol) !== null;
  useEffect(() => {
    if (visible) return;
    const element = target.current;
    if (!element || typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(item => item.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [visible, target]);
  useEffect(() => {
    if (!hasSource) { setState({ kind: 'done', result: NO_CANDLE_SOURCE }); return; }
    if (!visible) return;
    let active = true;
    const retry = retryRequested.current;
    retryRequested.current = false;
    setState(current => (retry && current.kind === 'done' ? { ...current, retrying: true } : { kind: 'waiting' }));
    const load = contextLoader ?? (async () => NO_CANDLES);
    void load(entry.trade, entry.executions).catch(() => SOURCE_DOWN).then(result => { if (active) setState({ kind: 'done', result }); });
    return () => { active = false; };
  }, [hasSource, visible, contextLoader, entry.trade, entry.executions, revision]);
  return { state, reload };
}

/**
 * The trade picture for one saved trade. `thumbnail` is a small card that opens
 * the full picture in a dialog; `row` (the Journal's and Practice's rows, D261)
 * is the small drawing alone, decorative inside the row's link; `full` (the
 * trade's page, Analysis) shows it at once under "Your trade". Candles load only
 * while the picture is on screen.
 */
export function TradePicture({ entry, variant, savePorts, strategyName = null }: {
  readonly entry: JournalHistoryEntry;
  readonly variant: 'thumbnail' | 'row' | 'full';
  readonly savePorts?: TradePictureSavePorts;
  /** The strategy the trader chose for this trade, for the share card (P28). */
  readonly strategyName?: string | null;
}) {
  const container = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dialogSvg = useRef<SVGSVGElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const { state: candles, reload } = useTradePictureCandles(entry, container, variant === 'full');
  const model = useMemo(() => projectTradePicture({
    trade: entry.trade, plans: entry.plans, executions: entry.executions, fees: entry.fees,
    candles: candles.kind === 'done' && candles.result.ok ? candles.result.candles : null,
    candleInterval: candles.kind === 'done' && candles.result.ok ? candles.result.interval ?? null : null,
    now: new Date().toISOString(),
  }), [entry, candles]);
  const loading = candles.kind === 'waiting';
  const candleProps = { ...candleCardProps(candles), onRetryCandles: reload };

  if (variant === 'full') {
    return <section className="kairos-trade-picture-panel" aria-labelledby={titleId} ref={container}>
      <h2 id={titleId}>Your trade</h2>
      <TradePictureCard model={model} candlesLoading={loading} svgRef={svg} {...candleProps} />
      <div className="kairos-trade-picture-panel__actions"><TradeShareControls model={model} svg={svg} strategyName={strategyName} ports={savePorts} /></div>
    </section>;
  }

  // The row's link names the trade; its picture is only seen.
  if (variant === 'row') return <div className="kairos-trade-picture-row" ref={container} aria-hidden="true">
    <TradePictureCard model={model} candlesLoading={loading} compact {...candleProps} />
  </div>;

  return <div className="kairos-trade-picture-thumb" ref={container}>
    <button type="button" className="kairos-trade-picture-thumb__open" aria-label={`Open the ${model.symbol} trade picture`} onClick={() => setOpen(true)}>
      <TradePictureCard model={model} candlesLoading={loading} compact {...candleProps} />
    </button>
    <Sheet open={open} title={`${model.symbol} trade`} onClose={() => setOpen(false)}>
      <TradePictureCard model={model} candlesLoading={loading} svgRef={dialogSvg} {...candleProps} />
      <div className="kairos-trade-picture-panel__actions">
        <TradeShareControls model={model} svg={dialogSvg} strategyName={strategyName} ports={savePorts} />
      </div>
    </Sheet>
  </div>;
}
