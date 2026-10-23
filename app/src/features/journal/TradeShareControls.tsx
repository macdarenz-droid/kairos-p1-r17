import { useEffect, useId, useMemo, useRef, useState, type RefObject } from 'react';
import { describeTradeShareCard, projectTradeShareCard, type TradePictureModel } from '../../application/trade-visualizer';
import { Button, Segmented } from '../../design-system/primitives';
import { browserTradePictureSavePorts, saveTradePictureImage, tradePictureFileName, type TradePictureSavePorts } from './tradePictureImage';
import { makeTradeShareImage, serializeTradeShareChart, type TradeShareShape } from './tradeShareCardImage';

const SHAPES = [{ value: 'tall', label: 'Tall' }, { value: 'square', label: 'Square' }] as const;

/** The trade's day on the card, in the device's zone like the picture's Opened and Closed rows. */
function cardDate(iso: string | null): string | null {
  if (iso === null) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(date);
}

/** A card made by one run of `make` (so a newer model, shape or choice never counts it as current); `blob` null when it could not be made. */
type Make = () => Promise<Made>;
type Made = Readonly<{ by: Make; blob: Blob | null; url: string | null }>;

/**
 * U6 (D214, D215): the share card under a full trade picture: its shape, "Hide money amounts", a preview,
 * and "Share or download image". The card is made from the picture model and the picture's own drawing.
 */
export function TradeShareControls({ model, svg, strategyName = null, ports }: {
  readonly model: TradePictureModel;
  /** The picture's drawn SVG, for the card's chart. */
  readonly svg: RefObject<SVGSVGElement | null>;
  readonly strategyName?: string | null;
  readonly ports?: TradePictureSavePorts;
}) {
  const [shape, setShape] = useState<TradeShareShape>('tall');
  const [hideMoney, setHideMoney] = useState(false);
  const [status, setStatus] = useState<'idle' | 'saving' | 'failed'>('idle');
  const [made, setMade] = useState<Made | null>(null);
  const hideId = useId();
  const savePorts = useMemo(() => ports ?? browserTradePictureSavePorts(), [ports]);
  const card = useMemo(() => projectTradeShareCard(model, { hideMoney, strategyName }), [model, hideMoney, strategyName]);
  const dateIso = model.info.find(row => row.key === 'opened')?.value ?? null;
  const fileName = tradePictureFileName(model.symbol, dateIso);
  const working = useRef<Readonly<{ by: Make; run: Promise<Made> }> | null>(null);
  const shownUrl = useRef<string | null>(null);

  const make = useMemo(() => {
    const run: Make = async () => {
      const element = svg.current;
      try {
        const blob = await makeTradeShareImage(card, shape, element === null ? null : (width, height) => serializeTradeShareChart(element, width, height), cardDate(card.closed ?? card.opened), savePorts);
        return { by: run, blob, url: typeof URL.createObjectURL === 'function' ? URL.createObjectURL(blob) : null };
      } catch {
        return { by: run, blob: null, url: null };
      }
    };
    return run;
  }, [card, shape, svg, savePorts]);

  // The preview follows every change; an answer for an older choice is thrown away.
  useEffect(() => {
    let current = true;
    const run = make();
    working.current = { by: make, run };
    void run.then(result => {
      if (!current) { if (result.url) URL.revokeObjectURL(result.url); return; }
      if (shownUrl.current) URL.revokeObjectURL(shownUrl.current);
      shownUrl.current = result.url;
      setMade(result);
    });
    return () => { current = false; };
  }, [make]);
  useEffect(() => () => { if (shownUrl.current) URL.revokeObjectURL(shownUrl.current); }, []);

  const share = async () => {
    if (status === 'saving') return;
    setStatus('saving');
    // Only the card for what is on screen now: an older picture or choice is never shared.
    const ready = made !== null && made.by === make ? made : await (working.current !== null && working.current.by === make ? working.current.run : make());
    const result = ready.blob === null ? 'failed' : await saveTradePictureImage(ready.blob, fileName, savePorts);
    setStatus(result === 'failed' ? 'failed' : 'idle');
  };

  const alt = describeTradeShareCard(card);
  return <div className="kairos-trade-share">
    <Segmented label="Image shape" options={SHAPES} value={shape} onChange={setShape} />
    <label className="kairos-trade-share__hide" htmlFor={hideId}>
      <input id={hideId} type="checkbox" checked={hideMoney} onChange={event => setHideMoney(event.target.checked)} /> <span>Hide money amounts</span>
    </label>
    {made === null || made.by !== make
      ? <p className="kairos-trade-share__making">Making the image…</p>
      : made.url !== null
        ? <img className="kairos-trade-share__preview" data-shape={shape} src={made.url} alt={alt} />
        : <p className="kairos-trade-share__making">{made.blob === null ? 'The preview could not be made.' : 'No preview on this device.'}</p>}
    {/* Never disabled, so focus stays on it during and after a share (the focus rule). */}
    <Button variant="secondary" aria-disabled={status === 'saving' ? true : undefined} onClick={() => { void share(); }}>
      {status === 'saving' ? 'Preparing image…' : 'Share or download image'}
    </Button>
    {status === 'failed' ? <small role="alert">The image could not be made. Nothing was changed.</small> : null}
  </div>;
}
