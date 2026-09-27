import { useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../../application/journal';
import { describeMarketDataUnavailable, type UnavailableWords } from '../../application/online/onlineWords';
import { projectTradePicture, tradePictureHasCandleSource, type TradePictureCandlesResult } from '../../application/trade-visualizer';
import { Sheet } from '../../design-system/primitives';
import { TradePictureCard } from './TradePictureCard';
import { TradePictureCandleLoaderContext } from './tradePictureCandleQueue';
import { saveTradePictureImage, serializeTradePictureSvg, tradePictureFileName, type TradePictureSavePorts } from './tradePictureImage';

type CandleState = { readonly kind: 'waiting' } | { readonly kind: 'done'; readonly result: TradePictureCandlesResult };

const NO_CANDLE_SOURCE: TradePictureCandlesResult = Object.freeze({ ok: false, why: 'no-candle-source', retryAfterSeconds: null, note: null });
const NO_CANDLES: TradePictureCandlesResult = Object.freeze({ ok: false, why: 'no-candles', retryAfterSeconds: null, note: null });
const SOURCE_DOWN: TradePictureCandlesResult = Object.freeze({ ok: false, why: 'source-down', retryAfterSeconds: null, note: null });

/** What the card shows for the loaded candles: the source line and note, or the words for why there are none. */
function candleCardProps(state: CandleState): { candleSource: string | null; candleNote: string | null; candleFailure: UnavailableWords | null } {
  if (state.kind === 'waiting') return { candleSource: null, candleNote: null, candleFailure: null };
  const { result } = state;
  if (result.ok) return { candleSource: result.source, candleNote: result.note, candleFailure: null };
  switch (result.why) {
    case 'no-candle-source':
    case 'no-start':
    case 'no-candles': return { candleSource: null, candleNote: null, candleFailure: null };
    case 'not-listed': return { candleSource: null, candleNote: result.note, candleFailure: null };
    default: return { candleSource: null, candleNote: null, candleFailure: describeMarketDataUnavailable({ ok: false, reason: 'unavailable', why: result.why, retryAfterSeconds: result.retryAfterSeconds }, 'Candles') };
  }
}

/** Loads the trade's candles once the picture is on screen (at once where the browser cannot tell); `reload` asks again. */
function useTradePictureCandles(entry: JournalHistoryEntry, target: React.RefObject<Element | null>, eager: boolean): { readonly state: CandleState; readonly reload: () => void } {
  const contextLoader = useContext(TradePictureCandleLoaderContext);
  const [visible, setVisible] = useState(eager);
  const [state, setState] = useState<CandleState>({ kind: 'waiting' });
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(value => value + 1), []);
  const hasSource = tradePictureHasCandleSource(entry.trade.marketType);
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
    setState({ kind: 'waiting' });
    const load = contextLoader ?? (async () => NO_CANDLES);
    void load(entry.trade, entry.executions).catch(() => SOURCE_DOWN).then(result => { if (active) setState({ kind: 'done', result }); });
    return () => { active = false; };
  }, [hasSource, visible, contextLoader, entry.trade, entry.executions, revision]);
  return { state, reload };
}

function SaveImageButton({ svg, symbol, dateIso, ports }: { readonly svg: React.RefObject<SVGSVGElement | null>; readonly symbol: string; readonly dateIso: string | null; readonly ports?: TradePictureSavePorts }) {
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  return <>
    <button type="button" disabled={status === 'saving'} onClick={() => {
      const element = svg.current;
      if (!element) return;
      setStatus('saving');
      void saveTradePictureImage(serializeTradePictureSvg(element), tradePictureFileName(symbol, dateIso), ports).then(result => setStatus(result === 'failed' ? 'failed' : 'idle'));
    }}>{status === 'saving' ? 'Preparing image…' : 'Share or download image'}</button>
    {status === 'failed' ? <small role="alert">The image could not be made. Nothing was changed.</small> : null}
  </>;
}

/**
 * The trade picture for one saved trade. `thumbnail` (Journal, Practice) is a
 * small card that opens the full picture in a dialog; `full` (Analysis) shows
 * it at once under "Your trade". Candles load only while the picture is on screen.
 */
export function TradePicture({ entry, variant, savePorts }: {
  readonly entry: JournalHistoryEntry;
  readonly variant: 'thumbnail' | 'full';
  readonly savePorts?: TradePictureSavePorts;
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
    now: new Date().toISOString(),
  }), [entry, candles]);
  const loading = candles.kind === 'waiting';
  const candleProps = { ...candleCardProps(candles), onRetryCandles: reload };
  const dateIso = model.info.find(row => row.key === 'opened')?.value ?? null;

  if (variant === 'full') {
    return <section className="kairos-trade-picture-panel" aria-labelledby={titleId} ref={container}>
      <h2 id={titleId}>Your trade</h2>
      <TradePictureCard model={model} candlesLoading={loading} svgRef={svg} {...candleProps} />
      <div className="kairos-trade-picture-panel__actions"><SaveImageButton svg={svg} symbol={model.symbol} dateIso={dateIso} ports={savePorts} /></div>
    </section>;
  }

  return <div className="kairos-trade-picture-thumb" ref={container}>
    <button type="button" className="kairos-trade-picture-thumb__open" aria-label={`Open the ${model.symbol} trade picture`} onClick={() => setOpen(true)}>
      <TradePictureCard model={model} candlesLoading={loading} compact {...candleProps} />
    </button>
    <Sheet open={open} title={`${model.symbol} trade`} onClose={() => setOpen(false)}>
      <TradePictureCard model={model} candlesLoading={loading} svgRef={dialogSvg} {...candleProps} />
      <div className="kairos-trade-picture-panel__actions">
        <SaveImageButton svg={dialogSvg} symbol={model.symbol} dateIso={dateIso} ports={savePorts} />
      </div>
    </Sheet>
  </div>;
}
