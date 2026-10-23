import { describe, expect, it, vi } from 'vitest';
import type { TradeShareCard } from '../src/application/trade-visualizer';
import {
  layoutTradeShareCard, makeTradeShareImage, paintTradeShareCard, serializeTradeShareChart,
  TRADE_SHARE_CARD_PALETTE, TRADE_SHARE_CARD_SHAPES, type TradeShareContext, type TradeShareMeasure, type TradeShareShape,
} from '../src/features/journal/tradeShareCardImage';

/** Every letter is half its font size wide. */
const measure: TradeShareMeasure = (text, size) => text.length * size * 0.5;
const card = (overrides: Partial<TradeShareCard> = {}): TradeShareCard => ({
  symbol: 'BTCUSDT', side: 'Long', verdict: 'Won', headline: { text: '+39 USDT', outcome: 'profit' },
  facts: [
    { key: 'actual-r', label: '× what you risked', text: '+1.95× what you risked' }, { key: 'planned-reward', label: 'Planned reward', text: 'Reward is 3× the risk' },
    { key: 'duration', label: 'How long it lasted', text: '3 h' }, { key: 'strategy', label: 'Strategy', text: 'Breakout' },
    { key: 'money-at-risk', label: 'Money at risk', text: '20 USDT' }, { key: 'size', label: 'Size', text: '2' },
  ],
  candleWords: '15-minute candles', opened: '2026-09-20T09:00:00.000Z', closed: '2026-09-20T12:00:00.000Z', hideMoney: false, ...overrides,
});
const texts = (shape: TradeShareShape, value = card()) => layoutTradeShareCard(value, shape, measure, '20 Sept 2026').steps.flatMap(step => (step.kind === 'text' ? [step] : []));

function recorder() {
  const calls: string[] = [];
  const fills: string[] = [];
  const context = {
    fillStyle: '', font: '', textAlign: 'left', textBaseline: 'alphabetic',
    fillRect: vi.fn(() => { fills.push(String(context.fillStyle)); calls.push('rect'); }),
    fillText: vi.fn((text: string) => { fills.push(String(context.fillStyle)); calls.push(`text:${text}`); }),
    drawImage: vi.fn(() => { calls.push('chart'); }),
    measureText: vi.fn((text: string) => ({ width: measure(text, Number.parseInt(context.font.split(' ')[1] ?? '0', 10), 400) })),
  };
  return { context: context as unknown as TradeShareContext & typeof context, calls, fills };
}

describe('T-052c the share card image', () => {
  for (const shape of ['tall', 'square'] as const) {
    it(`a ${shape} card keeps every word and the picture inside ${TRADE_SHARE_CARD_SHAPES[shape].width}×${TRADE_SHARE_CARD_SHAPES[shape].height}`, () => {
      const layout = layoutTradeShareCard(card(), shape, measure, '20 Sept 2026');
      expect([layout.width, layout.height]).toEqual([TRADE_SHARE_CARD_SHAPES[shape].width, TRADE_SHARE_CARD_SHAPES[shape].height]);
      for (const step of layout.steps) {
        if (step.kind === 'text') {
          const width = measure(step.text, step.size, step.weight);
          const left = step.align === 'left' ? step.x : step.x - width;
          expect(left).toBeGreaterThanOrEqual(0);
          expect(left + width).toBeLessThanOrEqual(layout.width);
          expect(step.y - step.size).toBeGreaterThanOrEqual(0);
          expect(step.y).toBeLessThanOrEqual(layout.height);
        } else {
          expect(step.x).toBeGreaterThanOrEqual(0);
          expect(step.x + step.width).toBeLessThanOrEqual(layout.width);
          expect(step.y + step.height).toBeLessThanOrEqual(layout.height);
        }
      }
      const shown = texts(shape).map(step => step.text);
      expect(shown).toEqual(expect.arrayContaining(['BTCUSDT', 'Long · Won', '+39 USDT', '15-minute candles', '× what you risked', '+1.95× what you risked', 'Made with Kairos', '20 Sept 2026']));
      // A tall card has room for all six facts; a square one shows the first two.
      const facts = card().facts.map(fact => fact.text);
      expect(facts.filter(fact => shown.includes(fact))).toEqual(shape === 'tall' ? facts : facts.slice(0, 2));
      expect(layout.steps.filter(step => step.kind === 'chart')).toHaveLength(1);
    });
  }

  it('shrinks, then cuts, a symbol too long for the card', () => {
    const symbol = texts('tall', card({ symbol: 'A'.repeat(80) }))[0]!;
    expect(symbol.text.endsWith('…')).toBe(true);
    expect(symbol.size).toBeLessThan(64);
    expect(symbol.x + measure(symbol.text, symbol.size, 700)).toBeLessThanOrEqual(1080 - 72);
  });

  it('paints in the fixed Kairos Depth colours, the result in the profit colour', () => {
    const { context, fills, calls } = recorder();
    paintTradeShareCard(context, layoutTradeShareCard(card(), 'tall', measure, null), {} as CanvasImageSource);
    expect(fills[0]).toBe(TRADE_SHARE_CARD_PALETTE.page);
    expect(context.fillText).toHaveBeenCalledWith('+39 USDT', expect.any(Number), expect.any(Number));
    expect(fills[calls.indexOf('text:+39 USDT')]).toBe(TRADE_SHARE_CARD_PALETTE.profit);
    expect(calls).toContain('chart');
    expect(calls).not.toContain('text:20 Sept 2026');
  });

  it('makes the PNG from the canvas, and still paints when the font cannot be loaded', async () => {
    const { context, calls } = recorder();
    const png = new Blob(['png'], { type: 'image/png' });
    const makeCanvas = vi.fn(() => ({ context, toBlob: async () => png }));
    const loadSvg = vi.fn(async () => ({}) as CanvasImageSource);
    const chartSvg = vi.fn((width: number, height: number) => `<svg width="${width}" height="${height}"/>`);
    const made = await makeTradeShareImage(card(), 'square', chartSvg, null, { makeCanvas, loadSvg, loadFonts: () => Promise.reject(new Error('no font')) });
    expect(made).toBe(png);
    expect(makeCanvas).toHaveBeenCalledWith(1080, 1080);
    const [width, height] = chartSvg.mock.calls[0]!;
    expect(loadSvg).toHaveBeenCalledWith(`<svg width="${width}" height="${height}"/>`);
    expect(Math.round((width * 220) / 360)).toBe(height);
    expect(calls).toContain('text:BTCUSDT');
  });

  it('turns the picture into a drawing that carries its own CSS and colours, without the picked candle', () => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 360 220');
    svg.setAttribute('aria-hidden', 'true');
    svg.innerHTML = '<rect class="kairos-trade-picture__picked"/><g class="kairos-trade-picture__candle" data-picked=""><rect/></g>';
    const text = serializeTradeShareChart(svg, 936, 572);
    expect(text).toContain('width="936"');
    expect(text).toContain('height="572"');
    expect(text).toMatch(/<style>svg\{--kairos-[^}]*--kairos-chart-background:#080e17/);
    // The picture's own CSS follows the colours; Vitest reads a `?raw` CSS file as empty, so the real-app check covers it.
    expect(text).not.toContain('kairos-trade-picture__picked');
    expect(text).not.toContain('data-picked');
    expect(text).not.toContain('aria-hidden');
  });
});
