import { useContext, useEffect, useId, useMemo, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../../application/journal';
import { projectTradePicture } from '../../application/trade-visualizer';
import type { MarketCandle } from '../../services/market-data/MarketCandleHistoryPort';
import { TradePictureCard } from './TradePictureCard';
import { browserTradePictureCandleLoader, TradePictureCandleLoaderContext } from './tradePictureCandleQueue';
import { saveTradePictureImage, serializeTradePictureSvg, tradePictureFileName, type TradePictureSavePorts } from './tradePictureImage';

type CandleState = { readonly kind: 'waiting' } | { readonly kind: 'done'; readonly candles: readonly MarketCandle[] | null };

/** Loads the trade's candles once the picture is on screen (at once where the browser cannot tell). */
function useTradePictureCandles(entry: JournalHistoryEntry, target: React.RefObject<Element | null>, eager: boolean): CandleState {
  const contextLoader = useContext(TradePictureCandleLoaderContext);
  const [visible, setVisible] = useState(eager);
  const [state, setState] = useState<CandleState>({ kind: 'waiting' });
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
    if (!visible) return;
    let active = true;
    setState({ kind: 'waiting' });
    const load = contextLoader ?? browserTradePictureCandleLoader();
    void load(entry.trade, entry.executions).catch(() => null).then(candles => { if (active) setState({ kind: 'done', candles }); });
    return () => { active = false; };
  }, [visible, contextLoader, entry.trade, entry.executions]);
  return state;
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
  const candles = useTradePictureCandles(entry, container, variant === 'full');
  const model = useMemo(() => projectTradePicture({
    trade: entry.trade, plans: entry.plans, executions: entry.executions, fees: entry.fees,
    candles: candles.kind === 'done' ? candles.candles : null,
    now: new Date().toISOString(),
  }), [entry, candles]);
  const loading = candles.kind === 'waiting';
  const dateIso = model.info.find(row => row.key === 'date')?.value ?? null;

  if (variant === 'full') {
    return <section className="kairos-trade-picture-panel" aria-labelledby={titleId} ref={container}>
      <h2 id={titleId}>Your trade</h2>
      <TradePictureCard model={model} candlesLoading={loading} svgRef={svg} />
      <div className="kairos-trade-picture-panel__actions"><SaveImageButton svg={svg} symbol={model.symbol} dateIso={dateIso} ports={savePorts} /></div>
    </section>;
  }

  return <div className="kairos-trade-picture-thumb" ref={container}>
    <button type="button" className="kairos-trade-picture-thumb__open" aria-label={`Open the ${model.symbol} trade picture`} onClick={() => setOpen(true)}>
      <TradePictureCard model={model} candlesLoading={loading} compact />
    </button>
    {open ? <div className="kairos-trade-picture-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={event => { if (event.key === 'Escape') setOpen(false); }}>
      <div className="kairos-trade-picture-dialog__sheet">
        <h2 id={titleId}>{model.symbol} trade</h2>
        <TradePictureCard model={model} candlesLoading={loading} svgRef={dialogSvg} />
        <div className="kairos-trade-picture-panel__actions">
          <SaveImageButton svg={dialogSvg} symbol={model.symbol} dateIso={dateIso} ports={savePorts} />
          <button type="button" autoFocus onClick={() => setOpen(false)}>Close</button>
        </div>
      </div>
    </div> : null}
  </div>;
}
