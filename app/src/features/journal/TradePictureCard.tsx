import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState, type PointerEvent, type Ref } from 'react';
import type { UnavailableWords } from '../../application/online/onlineWords';
import { describePriceMove } from '../../application/performance/performanceWords';
import type { TradePictureBox, TradePictureCandle, TradePictureInfoKey, TradePictureModel } from '../../application/trade-visualizer';
import { decimalSubtract } from '../../domain/calculations';
import { UnavailableNotice } from '../../design-system/primitives';
import { projectChartDecimal } from '../chart';
import { GlossaryHint } from '../learn/GlossaryHint';
import { placeTradePictureAxisLabels, tradePictureTimeTicks } from './tradePictureAxis';
import './tradePictureCard.css';

/** Drawing area of the picture, in SVG units; the card scales it to its width. */
export const TRADE_PICTURE_WIDTH = 360;
export const TRADE_PICTURE_HEIGHT = 220;
const PAD = { left: 6, right: 58, top: 10, bottom: 18 } as const;
/** The thumbnail has no price labels, so its plot takes the label gutter back. */
const COMPACT_PAD = { ...PAD, right: PAD.left } as const;
type Pad = typeof PAD | typeof COMPACT_PAD;

/** A candle body fills this share of its time slot, within the pixel bounds below. */
export const TRADE_PICTURE_CANDLE_BODY_SHARE = 0.7;
export const TRADE_PICTURE_CANDLE_MIN_WIDTH = 2;
export const TRADE_PICTURE_CANDLE_MAX_WIDTH = 8;
export const TRADE_PICTURE_CANDLE_MIN_HEIGHT = 2;

/** Body width for `count` candles across `plotWidth`: never wider than its slot, never a hairline when there is room. */
export function tradePictureCandleBodyWidth(count: number, plotWidth: number): number {
  if (count <= 0) return 0;
  const slot = plotWidth / count;
  return Math.min(TRADE_PICTURE_CANDLE_MAX_WIDTH, Math.max(Math.min(TRADE_PICTURE_CANDLE_MIN_WIDTH, slot), slot * TRADE_PICTURE_CANDLE_BODY_SHARE));
}

// Pixel geometry only: prices go through the chart module's one decimal → drawing
// conversion. The exact decimal values stay in the model and are shown as text, unrounded, except the two ratios, which the model rounds for reading.
// The price range is the trade's (T-039b); candles past it are cut at the plot edge.
/** Trading words that explain an info row; tapping the "?" loads the glossary. */
const INFO_GLOSSARY_TERMS: Readonly<Partial<Record<TradePictureInfoKey, string>>> = {
  result: 'result-after-fees', 'planned-reward': 'reward-to-risk', 'actual-r': 'times-what-you-risked', stop: 'stop', target: 'target', size: 'position-size', pips: 'pip', 'pip-value': 'pip', 'per-share': 'share',
  'money-at-risk': 'money-at-risk', 'result-before-fees': 'result-before-fees', fees: 'fees', 'average-entry': 'entries-and-exits',
};

const toMs = (iso: string) => Date.parse(iso);

interface Scale {
  x(iso: string): number;
  y(price: string): number;
}

function makeScale(model: TradePictureModel, pad: Pad): Scale | null {
  if (model.priceRange === null || model.timeRange === null) return null;
  let low: number, high: number;
  try {
    low = projectChartDecimal(model.priceRange.low);
    high = projectChartDecimal(model.priceRange.high);
  } catch {
    return null;
  }
  const from = toMs(model.timeRange.from), to = toMs(model.timeRange.to);
  if (![low, high, from, to].every(Number.isFinite) || high <= low) return null;
  const width = TRADE_PICTURE_WIDTH - pad.left - pad.right, height = TRADE_PICTURE_HEIGHT - pad.top - pad.bottom;
  const span = Math.max(to - from, 1);
  return {
    x: iso => pad.left + ((toMs(iso) - from) / span) * width,
    y: price => {
      try {
        return pad.top + ((high - projectChartDecimal(price)) / (high - low)) * height;
      } catch {
        return Number.NaN;
      }
    },
  };
}

/** Up when close ≥ open, compared exactly through the decimal kernel; a kernel failure draws the candle flat. */
export function candleDirection(open: string, close: string): 'up' | 'down' | 'flat' {
  const difference = decimalSubtract(close, open);
  if (!difference.ok) return 'flat';
  return difference.value.startsWith('-') ? 'down' : 'up';
}

function Box({ box, scale, kind }: { readonly box: TradePictureBox; readonly scale: Scale; readonly kind: 'risk' | 'reward' }) {
  const x1 = scale.x(box.startAt), x2 = Math.max(scale.x(box.endAt), x1 + 2);
  const y1 = scale.y(box.top), y2 = scale.y(box.bottom);
  return <g className={`kairos-trade-picture__box kairos-trade-picture__box--${kind}`} data-box={kind}>
    <rect x={x1} y={y1} width={x2 - x1} height={Math.max(y2 - y1, 1)} />
  </g>;
}

/** Box labels: 10-unit bold words on a small background. */
const BOX_LABEL_HEIGHT = 12;
const BOX_LABEL_WIDTH = { risk: 28, reward: 48 } as const;
/** A box shorter than this puts its label outside, past its far edge. */
const BOX_LABEL_ROOM = BOX_LABEL_HEIGHT + 6;

/** "Risk" or "Reward" at the box's far edge (stop or target): inside when it fits, else just past that edge. */
function BoxLabel({ box, scale, kind }: { readonly box: TradePictureBox; readonly scale: Scale; readonly kind: 'risk' | 'reward' }) {
  const x = scale.x(box.startAt) + 8;
  const yEntry = scale.y(box.entryPrice), yEdge = scale.y(box.edgePrice);
  const inside = Math.abs(yEntry - yEdge) >= BOX_LABEL_ROOM;
  const under = yEdge + 2, over = yEdge - 2 - BOX_LABEL_HEIGHT;
  const top = yEdge < yEntry ? (inside ? under : over) : (inside ? over : under);
  return <g className={`kairos-trade-picture__box-label kairos-trade-picture__box-label--${kind}`} data-box-label={kind}>
    <rect x={x} y={top} width={BOX_LABEL_WIDTH[kind]} height={BOX_LABEL_HEIGHT} rx="2" />
    <text x={x + 3} y={top + 9.5}>{kind === 'risk' ? 'Risk' : 'Reward'}</text>
  </g>;
}

/** Time labels under the plot (D217: the device's time zone). A label too near an edge to fit is left out. */
const AXIS_EDGE_ROOM = 16;
function TimeAxis({ model, scale, pad }: { readonly model: TradePictureModel; readonly scale: Scale; readonly pad: Pad }) {
  const from = model.timeRange?.from ?? null, to = model.timeRange?.to ?? null;
  // Worked out once per time range: the slider and a drag re-render the card on every move.
  const found = useMemo(() => (from === null || to === null ? [] : tradePictureTimeTicks(toMs(from), toMs(to))), [from, to]);
  if (from === null || to === null) return null;
  const bottom = TRADE_PICTURE_HEIGHT - pad.bottom;
  const left = pad.left, right = TRADE_PICTURE_WIDTH - pad.right;
  const ticks = found
    .map(tick => ({ ...tick, x: scale.x(new Date(tick.ms).toISOString()) }))
    .filter(tick => tick.x >= left + AXIS_EDGE_ROOM && tick.x <= right - AXIS_EDGE_ROOM);
  // Each label stays inside the drawing, however long its words; one that would touch the one before it is left out.
  const placed = placeTradePictureAxisLabels(ticks, left, right);
  return <g className="kairos-trade-picture__axis">
    {ticks.map((tick, index) => <g key={tick.ms} data-axis-tick={new Date(tick.ms).toISOString()}>
      <line x1={tick.x} x2={tick.x} y1={bottom} y2={bottom + 3} />
      {placed[index] === null ? null : <text x={placed[index]!} y={bottom + 12} textAnchor="middle">{tick.label}</text>}
    </g>)}
  </g>;
}

/** D192: dotted lines at the highest and lowest price while you were in the trade; the one in your favour is "for-you". */
function PriceMoveLines({ model, scale }: { readonly model: TradePictureModel; readonly scale: Scale }) {
  const move = model.priceMove;
  if (!move.available) return null;
  const entries = model.markers.filter(marker => marker.kind === 'entry');
  const exits = model.markers.filter(marker => marker.kind === 'exit');
  if (entries.length === 0 || model.timeRange === null) return null;
  const x1 = scale.x(entries[0]!.at);
  const x2 = Math.max(scale.x(exits.length > 0 && model.status !== 'open' ? exits[exits.length - 1]!.at : model.timeRange.to), x1 + 2);
  const highFor = model.side === 'long';
  return <g className="kairos-trade-picture__move-lines">
    <line data-move={highFor ? 'for-you' : 'against-you'} x1={x1} x2={x2} y1={scale.y(move.highest)} y2={scale.y(move.highest)} />
    <line data-move={highFor ? 'against-you' : 'for-you'} x1={x1} x2={x2} y1={scale.y(move.lowest)} y2={scale.y(move.lowest)} />
  </g>;
}

/** D216: one candle's time and exact prices, in words. */
function describeCandle(candle: TradePictureCandle): string {
  return `${displayTime(candle.time)}: open ${candle.open}, high ${candle.high}, low ${candle.low}, close ${candle.close}`;
}
const NO_CANDLE_PICKED = 'Tap or hold a candle to see its time and prices.';

function Level({ price, scale, pad, kind, labelled }: { readonly price: string | null; readonly scale: Scale; readonly pad: Pad; readonly kind: 'entry' | 'stop' | 'target'; readonly labelled: boolean }) {
  if (price === null) return null;
  const y = scale.y(price);
  return <g className={`kairos-trade-picture__level kairos-trade-picture__level--${kind}`} data-level={kind}>
    <line x1={pad.left} x2={TRADE_PICTURE_WIDTH - pad.right} y1={y} y2={y} />
    {labelled ? <text x={TRADE_PICTURE_WIDTH - pad.right + 4} y={y + 4}>{price}</text> : null}
  </g>;
}

/** Market, direction and status make up the panel's title line instead of their own rows. */
const TITLE_ROWS: ReadonlySet<string> = new Set(['market', 'direction', 'status']);

function rowText(model: TradePictureModel, key: string): string | null {
  return model.info.find(row => row.key === key)?.text ?? null;
}

/** One sentence for screen readers: market, direction, result and R. */
export function describeTradePicture(model: TradePictureModel): string {
  const result = model.info.find(row => row.key === 'result');
  const r = rowText(model, 'actual-r');
  return [
    `${model.symbol} ${model.side === 'long' ? 'long' : 'short'} trade, ${rowText(model, 'status')?.toLowerCase() ?? 'status unknown'}.`,
    // A result with no value but a reason (D237: "Add how much one point is worth…") says the reason as its own sentence.
    result?.text == null ? 'Result not available yet.' : result.value === null ? result.text : `Result after fees ${result.text}.`,
    r === null ? null : `${r}.`,
  ].filter(Boolean).join(' ');
}

/** Same format and time zone (the device's) as the card header and View trade. */
function displayTime(isoTime: string): string {
  const date = new Date(isoTime);
  return Number.isNaN(date.getTime()) ? isoTime : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function displayValue(model: TradePictureModel, key: string): string {
  const row = model.info.find(item => item.key === key);
  if (!row || row.text === null) return 'Not available';
  if ((key === 'opened' || key === 'closed') && row.value !== null) return displayTime(row.value);
  // D212: a planned trade's price now is the last candle's close; the row says which candle.
  if (key === 'price-now' && model.priceNow !== null) return `${row.text} (last candle, ${displayTime(model.priceNow.at)})`;
  return row.text;
}

/**
 * The trade picture: candles with the planned risk and reward boxes, the
 * planned levels and every fill, beside a plain-word info panel. It draws the
 * T-027a model only; every number shown comes from that model.
 * Box labels sit at the far edge and are drawn last; every edge a candle runs past gets an arrow (T-039d).
 */
export function TradePictureCard({ model, candlesLoading = false, svgRef, compact = false, label, notes = true, candleSource = null, candleNote = null, candleFailure = null, onRetryCandles, candleRetrying = false }: {
  readonly model: TradePictureModel;
  /** Candles are still on their way: say so instead of the connection note. */
  readonly candlesLoading?: boolean;
  /** The drawn SVG, for "Save image". */
  readonly svgRef?: Ref<SVGSVGElement>;
  /** Thumbnail: the picture only, without price labels or the info panel. */
  readonly compact?: boolean;
  /** Replaces the screen-reader sentence (the replay describes its own chart). */
  readonly label?: string;
  /** Shows the notes under the drawing; the replay says what is happening itself. */
  readonly notes?: boolean;
  /** Where the candles came from ("Candles: Binance Spot · BTC/USDT"), shown under a full picture. */
  readonly candleSource?: string | null;
  /** How the typed market was matched, or why it was not; shown when not null. */
  readonly candleNote?: string | null;
  /** Why the candles could not be had, in the application's words; null when there is no such failure. */
  readonly candleFailure?: UnavailableWords | null;
  readonly onRetryCandles?: () => void;
  /** "Try again" is asking: the box and its button stay, busy, until the answer arrives. */
  readonly candleRetrying?: boolean;
}) {
  const pad = compact ? COMPACT_PAD : PAD;
  const clipId = `kairos-trade-picture-clip${useId()}`;
  const scale = makeScale(model, pad);
  const noCandles = model.candles.length === 0;
  const plotHeight = TRADE_PICTURE_HEIGHT - pad.top - pad.bottom;
  const candleWidth = scale ? tradePictureCandleBodyWidth(model.candles.length, TRADE_PICTURE_WIDTH - pad.left - pad.right) : 0;
  const planned = (key: 'planned-entry' | 'stop' | 'target') => model.info.find(row => row.key === key)?.value ?? null;
  // D216: look at one candle with the slider, or by tapping or holding the drawing. Presentation only.
  // The pick is kept by the candle's time, so a sliding window (Replay) keeps the same candle, and drops it once it leaves.
  const [pickedTime, setPickedTime] = useState<string | null>(null);
  const found = pickedTime === null ? -1 : model.candles.findIndex(candle => candle.time === pickedTime);
  const pickedIndex = found === -1 ? null : found;
  const picked = pickedIndex === null ? null : model.candles[pickedIndex]!;
  const setPickedIndex = (index: number | null) => setPickedTime(index === null ? null : model.candles[index]?.time ?? null);
  const svgElement = useRef<SVGSVGElement | null>(null);
  const pressed = useRef(false);
  const lookable = !compact && scale !== null && model.candles.length > 0;
  const lookupId = useId();
  const pickAt = (clientX: number) => {
    const box = svgElement.current?.getBoundingClientRect();
    if (!scale || !box || box.width <= 0) return;
    const x = ((clientX - box.left) / box.width) * TRADE_PICTURE_WIDTH;
    let best: number | null = null;
    model.candles.forEach((candle, index) => {
      if (best === null || Math.abs(scale.x(candle.time) - x) < Math.abs(scale.x(model.candles[best]!.time) - x)) best = index;
    });
    if (best !== null) setPickedIndex(best);
  };
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!lookable) return;
    pressed.current = true;
    event.currentTarget.setPointerCapture?.(event.pointerId);
    pickAt(event.clientX);
  };
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => { if (lookable && pressed.current) pickAt(event.clientX); };
  const onPointerEnd = () => { pressed.current = false; };
  const setSvg = useCallback((element: SVGSVGElement | null) => {
    svgElement.current = element;
    if (typeof svgRef === 'function') svgRef(element);
    else if (svgRef) (svgRef as { current: SVGSVGElement | null }).current = element;
  }, [svgRef]);
  const readout = picked === null ? NO_CANDLE_PICKED : describeCandle(picked);
  // The lines are drawn on every full picture (Replay too), so their words are always there with them.
  const moveWords = compact ? null : describePriceMove(model.priceMove);
  // A "Try again" that had focus and ends without a box (candles came) sends focus to the chart, so it stays in the sheet
  // and Escape still closes it. Ending with another failure keeps the box, whose button takes focus back itself.
  const main = useRef<HTMLDivElement>(null);
  const chart = useRef<HTMLDivElement>(null);
  const retryHadFocus = useRef(false);
  const boxShown = candleFailure !== null && candleFailure !== undefined;
  useLayoutEffect(() => {
    if (candleRetrying) { retryHadFocus.current = main.current?.contains(document.activeElement) ?? false; return; }
    if (!retryHadFocus.current) return;
    retryHadFocus.current = false;
    const active = document.activeElement;
    if (!boxShown && (active === null || active === document.body)) chart.current?.focus({ preventScroll: true });
  }, [candleRetrying, boxShown]);

  // The image role sits on the chart only: children of role="img" are hidden from screen readers, and the info panel holds buttons.
  return <figure className="kairos-trade-picture" data-trade-picture={model.symbol}>
    <div className="kairos-trade-picture__main" ref={main}>
    <div className="kairos-trade-picture__chart" role="img" aria-label={label ?? describeTradePicture(model)} ref={chart} tabIndex={compact ? undefined : -1}
      data-lookable={lookable ? '' : undefined} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
      <svg ref={setSvg} viewBox={`0 0 ${TRADE_PICTURE_WIDTH} ${TRADE_PICTURE_HEIGHT}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs><clipPath id={clipId}><rect x="0" y={pad.top} width={TRADE_PICTURE_WIDTH} height={plotHeight} /></clipPath></defs>
        <rect className="kairos-trade-picture__background" x="0" y="0" width={TRADE_PICTURE_WIDTH} height={TRADE_PICTURE_HEIGHT} rx="8" />
        {scale ? <>
          {model.riskBox ? <Box box={model.riskBox} scale={scale} kind="risk" /> : null}
          {model.rewardBox ? <Box box={model.rewardBox} scale={scale} kind="reward" /> : null}
          {lookable && picked !== null ? <rect className="kairos-trade-picture__picked" x={scale.x(picked.time) - Math.max(candleWidth, 4) / 2 - 2} y={pad.top} width={Math.max(candleWidth, 4) + 4} height={plotHeight} /> : null}
          <g className="kairos-trade-picture__candles" clipPath={`url(#${clipId})`}>
            {model.candles.map((candle, index) => {
              const x = scale.x(candle.time);
              const direction = candleDirection(candle.open, candle.close);
              const up = direction !== 'down';
              const top = scale.y(up ? candle.close : candle.open), bottom = scale.y(up ? candle.open : candle.close);
              const height = Math.max(bottom - top, TRADE_PICTURE_CANDLE_MIN_HEIGHT);
              const middle = (top + bottom) / 2;
              const bottomEdge = pad.top + plotHeight;
              const edges: readonly ('above' | 'below')[] = candle.cut === 'both' ? ['above', 'below'] : candle.cut === null ? [] : [candle.cut];
              return <g key={candle.time} className={`kairos-trade-picture__candle${direction === 'flat' ? '' : ` kairos-trade-picture__candle--${direction}`}`} data-direction={direction} data-picked={lookable && index === pickedIndex ? '' : undefined}>
                <line x1={x} x2={x} y1={scale.y(candle.high)} y2={scale.y(candle.low)} />
                <rect x={x - candleWidth / 2} y={middle - height / 2} width={candleWidth} height={height} />
                {edges.map(edge => <polygon key={edge} className="kairos-trade-picture__beyond" data-edge={edge} data-beyond={candle.beyond === edge ? edge : undefined}
                  points={edge === 'below' ? `${x - 3},${bottomEdge - 5} ${x + 3},${bottomEdge - 5} ${x},${bottomEdge - 1}` : `${x - 3},${pad.top + 5} ${x + 3},${pad.top + 5} ${x},${pad.top + 1}`} />)}
              </g>;
            })}
          </g>
          <Level price={planned('planned-entry')} scale={scale} pad={pad} kind="entry" labelled={!compact} />
          <Level price={planned('stop')} scale={scale} pad={pad} kind="stop" labelled={!compact} />
          <Level price={planned('target')} scale={scale} pad={pad} kind="target" labelled={!compact} />
          {model.markers.map((marker, index) => {
            const x = scale.x(marker.at), y = scale.y(marker.price);
            return marker.kind === 'entry'
              ? <polygon key={`e${index}`} className="kairos-trade-picture__marker kairos-trade-picture__marker--entry" data-marker="entry" points={`${x},${y - 7} ${x + 6},${y + 4} ${x - 6},${y + 4}`} />
              : <polygon key={`x${index}`} className="kairos-trade-picture__marker kairos-trade-picture__marker--exit" data-marker="exit" points={`${x},${y + 7} ${x + 6},${y - 4} ${x - 6},${y - 4}`} />;
          })}
          {compact ? null : <PriceMoveLines model={model} scale={scale} />}
          {compact ? null : <TimeAxis model={model} scale={scale} pad={pad} />}
          {model.riskBox ? <BoxLabel box={model.riskBox} scale={scale} kind="risk" /> : null}
          {model.rewardBox ? <BoxLabel box={model.rewardBox} scale={scale} kind="reward" /> : null}
        </> : null}
      </svg>
    </div>
    {/* Outside the image role, so screen readers hear what is missing (D213). */}
    {notes && model.planNote !== null ? <p className="kairos-trade-picture__note">{model.planNote}</p> : null}
    {/* Outside the image role, so screen readers reach the words and the slider. */}
    {moveWords !== null ? <p className="kairos-trade-picture__move">{moveWords}</p> : null}
    {lookable ? <div className="kairos-trade-picture__lookup">
      <label htmlFor={lookupId}>Look at a candle</label>
      <input id={lookupId} type="range" min={0} max={model.candles.length} step={1} value={pickedIndex === null ? 0 : pickedIndex + 1}
        aria-valuetext={picked === null ? 'No candle picked' : readout} onChange={event => { const value = Number(event.target.value); setPickedIndex(value === 0 ? null : value - 1); }} />
      {/* Not a live region: the slider already says each candle, and a drag would queue a sentence per candle. */}
      <p className="kairos-trade-picture__readout">{readout}</p>
    </div> : null}
    {/* Outside the image role, so screen readers hear why there are no candles. */}
    {notes && noCandles && candleFailure === null ? <p className="kairos-trade-picture__note">{!model.marketHasCandles ? model.noCandleSourceWords : candlesLoading ? 'Loading candles…' : candleNote ?? 'No candles for this time.'}</p> : null}
    {/* Outside the image role, so its words and button reach screen readers. The thumbnail sits inside a button:
        it shows the reason and retries quietly; the full picture has "Try again". */}
    {notes && noCandles && model.marketHasCandles && !candlesLoading && candleFailure !== null
      ? <UnavailableNotice live={false} message={candleFailure.message} retryLabel={compact ? null : candleFailure.retryLabel} onRetry={onRetryCandles} busy={candleRetrying} retryWhenOnline={candleFailure.retryWhenOnline} />
      : null}
    {notes && !noCandles && !compact && model.candleWords !== null ? <p className="kairos-trade-picture__candle-size">{model.candleWords}</p> : null}
    {notes && !noCandles && !compact && candleSource !== null ? <>
      <p className="kairos-trade-picture__source">{candleSource}</p>
      {candleNote !== null ? <p className="kairos-trade-picture__note">{candleNote}</p> : null}
    </> : null}
    </div>
    {compact ? null : <div className="kairos-trade-picture__info">
      <p className="kairos-trade-picture__title">{[rowText(model, 'market'), rowText(model, 'direction'), rowText(model, 'status')].filter(Boolean).join(' · ')}</p>
      <dl>
        {model.info.filter(row => !TITLE_ROWS.has(row.key)).map(row => <div key={row.key} data-info={row.key}>
          <dt><span>{row.label}</span>{INFO_GLOSSARY_TERMS[row.key] ? <GlossaryHint termId={INFO_GLOSSARY_TERMS[row.key]!} label={row.label} /> : null}</dt>
          <dd>{displayValue(model, row.key)}</dd>
        </div>)}
      </dl>
    </div>}
  </figure>;
}
