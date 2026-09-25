import { useId, type Ref } from 'react';
import type { TradePictureBox, TradePictureInfoKey, TradePictureModel } from '../../application/trade-visualizer';
import { decimalSubtract } from '../../domain/calculations';
import { projectChartDecimal } from '../chart';
import { GlossaryHint } from '../learn/GlossaryHint';
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
  result: 'result-after-fees', 'planned-reward': 'reward-to-risk', 'actual-r': 'times-what-you-risked', stop: 'stop', target: 'target', size: 'position-size',
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
  const result = rowText(model, 'result');
  const r = rowText(model, 'actual-r');
  return [
    `${model.symbol} ${model.side === 'long' ? 'long' : 'short'} trade, ${rowText(model, 'status')?.toLowerCase() ?? 'status unknown'}.`,
    result === null ? 'Result not available yet.' : `Result after fees ${result}.`,
    r === null ? null : `${r}.`,
  ].filter(Boolean).join(' ');
}

function displayValue(model: TradePictureModel, key: string): string {
  const row = model.info.find(item => item.key === key);
  if (!row || row.text === null) return 'Not available';
  if ((key === 'opened' || key === 'closed') && row.value !== null) {
    // Same format and time zone (the device's) as the card header and View trade.
    const date = new Date(row.value);
    return Number.isNaN(date.getTime()) ? row.value : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
  return row.text;
}

/**
 * The trade picture: candles with the planned risk and reward boxes, the
 * planned levels and every fill, beside a plain-word info panel. It draws the
 * T-027a model only; every number shown comes from that model.
 * Box labels sit at the far edge and are drawn last; every edge a candle runs past gets an arrow (T-039d).
 */
export function TradePictureCard({ model, candlesLoading = false, svgRef, compact = false }: {
  readonly model: TradePictureModel;
  /** Candles are still on their way: say so instead of the connection note. */
  readonly candlesLoading?: boolean;
  /** The drawn SVG, for "Save image". */
  readonly svgRef?: Ref<SVGSVGElement>;
  /** Thumbnail: the picture only, without price labels or the info panel. */
  readonly compact?: boolean;
}) {
  const pad = compact ? COMPACT_PAD : PAD;
  const clipId = `kairos-trade-picture-clip${useId()}`;
  const scale = makeScale(model, pad);
  const noCandles = model.candles.length === 0;
  const noPlan = model.riskBox === null || model.rewardBox === null;
  const plotHeight = TRADE_PICTURE_HEIGHT - pad.top - pad.bottom;
  const candleWidth = scale ? tradePictureCandleBodyWidth(model.candles.length, TRADE_PICTURE_WIDTH - pad.left - pad.right) : 0;
  const planned = (key: 'planned-entry' | 'stop' | 'target') => model.info.find(row => row.key === key)?.value ?? null;

  // The image role sits on the chart only: children of role="img" are hidden from screen readers, and the info panel holds buttons.
  return <figure className="kairos-trade-picture" data-trade-picture={model.symbol}>
    <div className="kairos-trade-picture__chart" role="img" aria-label={describeTradePicture(model)}>
      <svg ref={svgRef} viewBox={`0 0 ${TRADE_PICTURE_WIDTH} ${TRADE_PICTURE_HEIGHT}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <defs><clipPath id={clipId}><rect x="0" y={pad.top} width={TRADE_PICTURE_WIDTH} height={plotHeight} /></clipPath></defs>
        <rect className="kairos-trade-picture__background" x="0" y="0" width={TRADE_PICTURE_WIDTH} height={TRADE_PICTURE_HEIGHT} rx="8" />
        {scale ? <>
          {model.riskBox ? <Box box={model.riskBox} scale={scale} kind="risk" /> : null}
          {model.rewardBox ? <Box box={model.rewardBox} scale={scale} kind="reward" /> : null}
          <g className="kairos-trade-picture__candles" clipPath={`url(#${clipId})`}>
            {model.candles.map(candle => {
              const x = scale.x(candle.time);
              const direction = candleDirection(candle.open, candle.close);
              const up = direction !== 'down';
              const top = scale.y(up ? candle.close : candle.open), bottom = scale.y(up ? candle.open : candle.close);
              const height = Math.max(bottom - top, TRADE_PICTURE_CANDLE_MIN_HEIGHT);
              const middle = (top + bottom) / 2;
              const bottomEdge = pad.top + plotHeight;
              const edges: readonly ('above' | 'below')[] = candle.cut === 'both' ? ['above', 'below'] : candle.cut === null ? [] : [candle.cut];
              return <g key={candle.time} className={`kairos-trade-picture__candle${direction === 'flat' ? '' : ` kairos-trade-picture__candle--${direction}`}`} data-direction={direction}>
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
          {model.riskBox ? <BoxLabel box={model.riskBox} scale={scale} kind="risk" /> : null}
          {model.rewardBox ? <BoxLabel box={model.rewardBox} scale={scale} kind="reward" /> : null}
        </> : null}
      </svg>
      {noCandles ? <p className="kairos-trade-picture__note">{candlesLoading ? 'Loading candles…' : 'Candles need a connection.'}</p> : null}
      {noPlan ? <p className="kairos-trade-picture__note">Add a stop and target to see your risk box.</p> : null}
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
