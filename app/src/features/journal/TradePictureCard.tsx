import type { Ref } from 'react';
import type { TradePictureBox, TradePictureModel } from '../../application/trade-visualizer';
import './tradePictureCard.css';

/** Drawing area of the picture, in SVG units; the card scales it to its width. */
export const TRADE_PICTURE_WIDTH = 360;
export const TRADE_PICTURE_HEIGHT = 220;
const PAD = { left: 6, right: 58, top: 10, bottom: 18 } as const;

// Pixel geometry only: prices and times are mapped to screen positions here.
// The exact decimal values stay in the model and are shown as text, unrounded.
const toNumber = (value: string) => Number(value);
const toMs = (iso: string) => Date.parse(iso);

interface Scale {
  x(iso: string): number;
  y(price: string): number;
}

function makeScale(model: TradePictureModel): Scale | null {
  if (model.priceRange === null || model.timeRange === null) return null;
  const low = toNumber(model.priceRange.low), high = toNumber(model.priceRange.high);
  const from = toMs(model.timeRange.from), to = toMs(model.timeRange.to);
  if (![low, high, from, to].every(Number.isFinite) || high <= low) return null;
  const width = TRADE_PICTURE_WIDTH - PAD.left - PAD.right, height = TRADE_PICTURE_HEIGHT - PAD.top - PAD.bottom;
  const span = Math.max(to - from, 1);
  return {
    x: iso => PAD.left + ((toMs(iso) - from) / span) * width,
    y: price => PAD.top + ((high - toNumber(price)) / (high - low)) * height,
  };
}

function Box({ box, scale, kind }: { readonly box: TradePictureBox; readonly scale: Scale; readonly kind: 'risk' | 'reward' }) {
  const x1 = scale.x(box.startAt), x2 = Math.max(scale.x(box.endAt), x1 + 2);
  const y1 = scale.y(box.top), y2 = scale.y(box.bottom);
  return <g className={`kairos-trade-picture__box kairos-trade-picture__box--${kind}`} data-box={kind}>
    <rect x={x1} y={y1} width={x2 - x1} height={Math.max(y2 - y1, 1)} />
    <text x={x1 + 4} y={kind === 'risk' ? y2 - 4 : y1 + 12}>{kind === 'risk' ? 'Risk' : 'Reward'}</text>
  </g>;
}

function Level({ price, scale, kind, labelled }: { readonly price: string | null; readonly scale: Scale; readonly kind: 'entry' | 'stop' | 'target'; readonly labelled: boolean }) {
  if (price === null) return null;
  const y = scale.y(price);
  return <g className={`kairos-trade-picture__level kairos-trade-picture__level--${kind}`} data-level={kind}>
    <line x1={PAD.left} x2={TRADE_PICTURE_WIDTH - PAD.right} y1={y} y2={y} />
    {labelled ? <text x={TRADE_PICTURE_WIDTH - PAD.right + 4} y={y + 4}>{price}</text> : null}
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
  if (key === 'date' && row.value !== null) {
    const date = new Date(row.value);
    return Number.isNaN(date.getTime()) ? row.value : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }
  return row.text;
}

/**
 * The trade picture: candles with the planned risk and reward boxes, the
 * planned levels and every fill, beside a plain-word info panel. It draws the
 * T-027a model only; every number shown comes from that model.
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
  const scale = makeScale(model);
  const noCandles = model.candles.length === 0;
  const noPlan = model.riskBox === null || model.rewardBox === null;
  const candleWidth = scale && model.candles.length > 0
    ? Math.max(1, Math.min(8, ((TRADE_PICTURE_WIDTH - PAD.left - PAD.right) / model.candles.length) * 0.6))
    : 0;
  const planned = (key: 'planned-entry' | 'stop' | 'target') => model.info.find(row => row.key === key)?.value ?? null;

  return <figure className="kairos-trade-picture" role="img" aria-label={describeTradePicture(model)} data-trade-picture={model.symbol}>
    <div className="kairos-trade-picture__chart">
      <svg ref={svgRef} viewBox={`0 0 ${TRADE_PICTURE_WIDTH} ${TRADE_PICTURE_HEIGHT}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false">
        <rect className="kairos-trade-picture__background" x="0" y="0" width={TRADE_PICTURE_WIDTH} height={TRADE_PICTURE_HEIGHT} rx="8" />
        {scale ? <>
          {model.riskBox ? <Box box={model.riskBox} scale={scale} kind="risk" /> : null}
          {model.rewardBox ? <Box box={model.rewardBox} scale={scale} kind="reward" /> : null}
          <g className="kairos-trade-picture__candles">
            {model.candles.map(candle => {
              const x = scale.x(candle.time);
              const up = toNumber(candle.close) >= toNumber(candle.open);
              const top = scale.y(up ? candle.close : candle.open), bottom = scale.y(up ? candle.open : candle.close);
              return <g key={candle.time} className={`kairos-trade-picture__candle kairos-trade-picture__candle--${up ? 'up' : 'down'}`}>
                <line x1={x} x2={x} y1={scale.y(candle.high)} y2={scale.y(candle.low)} />
                <rect x={x - candleWidth / 2} y={top} width={candleWidth} height={Math.max(bottom - top, 1)} />
              </g>;
            })}
          </g>
          <Level price={planned('planned-entry')} scale={scale} kind="entry" labelled={!compact} />
          <Level price={planned('stop')} scale={scale} kind="stop" labelled={!compact} />
          <Level price={planned('target')} scale={scale} kind="target" labelled={!compact} />
          {model.markers.map((marker, index) => {
            const x = scale.x(marker.at), y = scale.y(marker.price);
            return marker.kind === 'entry'
              ? <polygon key={`e${index}`} className="kairos-trade-picture__marker kairos-trade-picture__marker--entry" data-marker="entry" points={`${x},${y - 7} ${x + 6},${y + 4} ${x - 6},${y + 4}`} />
              : <polygon key={`x${index}`} className="kairos-trade-picture__marker kairos-trade-picture__marker--exit" data-marker="exit" points={`${x},${y + 7} ${x + 6},${y - 4} ${x - 6},${y - 4}`} />;
          })}
        </> : null}
      </svg>
      {noCandles ? <p className="kairos-trade-picture__note">{candlesLoading ? 'Loading candles…' : 'Candles need a connection.'}</p> : null}
      {noPlan ? <p className="kairos-trade-picture__note">Add a stop and target to see your risk box.</p> : null}
    </div>
    {compact ? null : <div className="kairos-trade-picture__info">
      <p className="kairos-trade-picture__title">{[rowText(model, 'market'), rowText(model, 'direction'), rowText(model, 'status')].filter(Boolean).join(' · ')}</p>
      <dl>
        {model.info.filter(row => !TITLE_ROWS.has(row.key)).map(row => <div key={row.key} data-info={row.key}>
          <dt>{row.label}</dt>
          <dd>{displayValue(model, row.key)}</dd>
        </div>)}
      </dl>
    </div>}
  </figure>;
}
