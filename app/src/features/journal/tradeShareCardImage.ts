import type { TradeShareCard, TradeShareOutcome } from '../../application/trade-visualizer';
import { themeRegistry } from '../../design-system/themes';
import pictureCss from './tradePictureCard.css?raw';

/** D214: the two card shapes, in image pixels. */
export const TRADE_SHARE_CARD_SHAPES = Object.freeze({
  tall: Object.freeze({ width: 1080, height: 1350 }),
  square: Object.freeze({ width: 1080, height: 1080 }),
});
export type TradeShareShape = keyof typeof TRADE_SHARE_CARD_SHAPES;

/** The card always wears Kairos Depth, so it looks the same from every phone and theme (D214). */
const TOKENS = themeRegistry['kairos-depth'].tokens;
const color = (name: string): string => TOKENS[name] ?? '#000000';
const PALETTE = Object.freeze({
  page: color('--kairos-background-base'),
  panel: color('--kairos-surface-card'),
  text: color('--kairos-text-primary'),
  quiet: color('--kairos-text-secondary'),
  accent: color('--kairos-accent-primary'),
  profit: color('--kairos-trade-profit'),
  loss: color('--kairos-trade-loss'),
  flat: color('--kairos-trade-flat'),
});
export const TRADE_SHARE_CARD_PALETTE = PALETTE;

const OUTCOME_COLOR: Readonly<Record<TradeShareOutcome, string>> = Object.freeze({ profit: PALETTE.profit, loss: PALETTE.loss, breakeven: PALETTE.flat, none: PALETTE.text });
const FONT_FAMILY = '"Inter Variable", Inter, ui-sans-serif, system-ui, sans-serif';
const SYSTEM_SANS = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';
export const tradeShareFont = (size: number, weight: number) => `${weight} ${size}px ${FONT_FAMILY}`;

export type TradeShareStep =
  | Readonly<{ kind: 'rect'; x: number; y: number; width: number; height: number; fill: string }>
  | Readonly<{ kind: 'text'; x: number; y: number; text: string; size: number; weight: number; color: string; align: 'left' | 'right' }>
  | Readonly<{ kind: 'chart'; x: number; y: number; width: number; height: number }>;

export interface TradeShareLayout {
  readonly width: number;
  readonly height: number;
  readonly steps: readonly TradeShareStep[];
}

/** Width of `text` in image pixels at this size and weight. */
export type TradeShareMeasure = (text: string, size: number, weight: number) => number;

/** The chart's own drawing is 360×220 (the picture's viewBox). */
const CHART_RATIO = 220 / 360;
const MARGIN = 72;
const SMALLEST_SHARE = 0.6;

/** Fits text to a width: the size shrinks to 60% at most, then the end is cut with "…". */
function fitted(text: string, size: number, weight: number, width: number, measure: TradeShareMeasure): { text: string; size: number } {
  let shown = size;
  while (shown > size * SMALLEST_SHARE && measure(text, shown, weight) > width) shown -= 2;
  if (measure(text, shown, weight) <= width) return { text, size: shown };
  let cut = text;
  while (cut.length > 1 && measure(`${cut}…`, shown, weight) > width) cut = cut.slice(0, -1);
  return { text: `${cut.trimEnd()}…`, size: shown };
}

/**
 * D214: where everything on the card goes, in image pixels: the market and verdict, the headline, the
 * picture, the facts, and the footer. Every text is fitted to its width, so nothing leaves the card.
 */
export function layoutTradeShareCard(card: TradeShareCard, shape: TradeShareShape, measure: TradeShareMeasure, dateText: string | null): TradeShareLayout {
  const { width, height } = TRADE_SHARE_CARD_SHAPES[shape];
  const steps: TradeShareStep[] = [{ kind: 'rect', x: 0, y: 0, width, height, fill: PALETTE.page }];
  const inner = width - 2 * MARGIN;
  const text = (value: string, x: number, y: number, size: number, weight: number, fill: string, room: number, align: 'left' | 'right' = 'left') => {
    const fit = fitted(value, size, weight, room, measure);
    steps.push({ kind: 'text', x, y, text: fit.text, size: fit.size, weight, color: fill, align });
  };
  const tall = shape === 'tall';
  const verdictColor = OUTCOME_COLOR[card.headline.outcome];
  const decided = card.verdict === 'Won' || card.verdict === 'Lost' || card.verdict === 'Break-even';

  text(card.symbol, MARGIN, tall ? 132 : 112, tall ? 64 : 56, 700, PALETTE.text, inner);
  // The verdict is said once: beside the direction, unless it is the headline itself.
  text(card.headline.text === card.verdict ? card.side : `${card.side} · ${card.verdict}`, MARGIN, tall ? 188 : 160, tall ? 38 : 34, 600, decided ? verdictColor : PALETTE.quiet, inner);
  text(card.headline.text, MARGIN, tall ? 288 : 240, tall ? 84 : 68, 700, verdictColor, inner);

  // The picture on a panel, then the candle size under it.
  const chartTop = tall ? 320 : 272;
  const chartWidth = tall ? inner : 900;
  const chartHeight = Math.round(chartWidth * CHART_RATIO);
  steps.push({ kind: 'rect', x: MARGIN - 12, y: chartTop - 12, width: chartWidth + 24, height: chartHeight + 24, fill: PALETTE.panel });
  steps.push({ kind: 'chart', x: MARGIN, y: chartTop, width: chartWidth, height: chartHeight });
  if (card.candleWords !== null) text(card.candleWords, MARGIN, chartTop + chartHeight + (tall ? 44 : 38), tall ? 26 : 24, 500, PALETTE.quiet, chartWidth);

  // The facts in two columns: all of them on a tall card, the first two on a square one.
  const factWidth = (inner - 48) / 2;
  const shown = tall ? card.facts : card.facts.slice(0, 2);
  shown.forEach((fact, index) => {
    const x = MARGIN + (index % 2) * (factWidth + 48);
    const y = tall ? chartTop + chartHeight + 100 + Math.floor(index / 2) * 96 : chartTop + chartHeight + 90;
    if (y + 46 > height - 110) return;
    text(fact.label, x, y, 26, 500, PALETTE.quiet, factWidth);
    text(fact.text, x, y + 44, tall ? 36 : 32, 600, PALETTE.text, factWidth);
  });

  // The footer: who made it, and when the trade was.
  const footer = height - (tall ? 64 : 44);
  text('Made with Kairos', MARGIN, footer, 28, 600, PALETTE.accent, inner / 2);
  if (dateText !== null) text(dateText, width - MARGIN, footer, 28, 500, PALETTE.quiet, inner / 2, 'right');
  return Object.freeze({ width, height, steps: Object.freeze(steps.map(step => Object.freeze(step))) });
}

/** The part of a 2D canvas the card paints with. */
export type TradeShareContext = Pick<CanvasRenderingContext2D, 'fillStyle' | 'font' | 'textAlign' | 'textBaseline' | 'fillRect' | 'fillText' | 'measureText' | 'drawImage'>;

export function paintTradeShareCard(context: TradeShareContext, layout: TradeShareLayout, chart: CanvasImageSource | null): void {
  context.textBaseline = 'alphabetic';
  for (const step of layout.steps) {
    if (step.kind === 'rect') { context.fillStyle = step.fill; context.fillRect(step.x, step.y, step.width, step.height); continue; }
    if (step.kind === 'chart') { if (chart !== null) context.drawImage(chart, step.x, step.y, step.width, step.height); continue; }
    context.font = tradeShareFont(step.size, step.weight);
    context.fillStyle = step.color;
    context.textAlign = step.align;
    context.fillText(step.text, step.x, step.y);
  }
}

/**
 * The picture's SVG as a standalone drawing in Kairos Depth: its own CSS and the theme's colours travel
 * inside it, so it reads the same as the screen without the page. Drawn at `width`×`height` pixels.
 */
export function serializeTradeShareChart(svg: SVGSVGElement, width: number, height: number): string {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.removeAttribute('aria-hidden');
  // A candle picked on screen is not part of the shared picture.
  clone.querySelectorAll('.kairos-trade-picture__picked').forEach(element => element.remove());
  clone.querySelectorAll('[data-picked]').forEach(element => element.removeAttribute('data-picked'));
  const tokens = Object.entries(TOKENS).filter(([name]) => name.startsWith('--kairos-')).map(([name, value]) => `${name}:${value}`).join(';');
  const style = svg.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'style');
  // An image cannot use the page's fonts, so its words take the system's sans-serif.
  style.textContent = `svg{${tokens};--kairos-font-mono:${SYSTEM_SANS};font-family:${SYSTEM_SANS}}\n${pictureCss}`;
  clone.insertBefore(style, clone.firstChild);
  return new XMLSerializer().serializeToString(clone);
}

export interface TradeShareImagePorts {
  /** A canvas of this size, with its 2D context and a way to read it out as a PNG. */
  makeCanvas(width: number, height: number): { readonly context: TradeShareContext; toBlob(): Promise<Blob> };
  /** SVG text → something the canvas can draw. */
  loadSvg(svgText: string): Promise<CanvasImageSource>;
  /** Waits for the card's font; a failure only means the system font is used. */
  loadFonts(): Promise<void>;
}

/** The card as a PNG of its shape's size. The chart is drawn when `chartSvg` gives one; without it the card still says it all in words. */
export async function makeTradeShareImage(
  card: TradeShareCard, shape: TradeShareShape, chartSvg: ((width: number, height: number) => string) | null, dateText: string | null, ports: TradeShareImagePorts,
): Promise<Blob> {
  await ports.loadFonts().catch(() => undefined);
  const { width, height } = TRADE_SHARE_CARD_SHAPES[shape];
  const canvas = ports.makeCanvas(width, height);
  const measure: TradeShareMeasure = (text, size, weight) => { canvas.context.font = tradeShareFont(size, weight); return canvas.context.measureText(text).width; };
  const layout = layoutTradeShareCard(card, shape, measure, dateText);
  const box = layout.steps.find(step => step.kind === 'chart');
  const chart = chartSvg !== null && box !== undefined && box.kind === 'chart' ? await ports.loadSvg(chartSvg(box.width, box.height)) : null;
  paintTradeShareCard(canvas.context, layout, chart);
  return canvas.toBlob();
}

export function browserTradeShareImagePorts(): TradeShareImagePorts {
  return {
    makeCanvas: (width, height) => {
      const element = document.createElement('canvas');
      element.width = width;
      element.height = height;
      const context = element.getContext('2d');
      if (!context) throw new Error('canvas-unavailable');
      return { context, toBlob: () => new Promise((resolve, reject) => element.toBlob(blob => (blob ? resolve(blob) : reject(new Error('png-unavailable'))), 'image/png')) };
    },
    loadSvg: svgText => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('svg-unreadable'));
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
    }),
    loadFonts: async () => { await document.fonts?.load(tradeShareFont(64, 700)); },
  };
}
