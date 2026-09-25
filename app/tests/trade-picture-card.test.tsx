import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { projectTradePicture, type TradePictureInput } from '../src/application/trade-visualizer';
import { parseDecimalString, type DecimalString, type TradeExecutionId, type TradeFeeId, type TradeFeeRecord, type TradeId, type TradePlanId, type TradeRecord } from '../src/domain/trades';
import { TradePictureCard, tradePictureCandleBodyWidth } from '../src/features/journal/TradePictureCard';

function dec(value: string): DecimalString { const parsed = parseDecimalString(value); if (!parsed.ok) throw new Error(value); return parsed.value; }
const tradeId = 'trade-1' as TradeId;
const opened = '2026-09-20T09:00:00.000Z', closed = '2026-09-20T12:00:00.000Z';
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed, createdAt: opened, updatedAt: closed };
const plan = (stop: string | null, target: string | null) => [{ id: 'p1' as TradePlanId, tradeId, plannedEntryPrice: dec('100'), plannedStopPrice: stop === null ? null : dec(stop), plannedTargetPrice: target === null ? null : dec(target), plannedQuantity: dec('2'), createdAt: opened, updatedAt: opened }];
const input: TradePictureInput = {
  trade,
  plans: plan('90', '130'),
  executions: [
    { id: 'e1' as TradeExecutionId, tradeId, type: 'entry', price: dec('100'), quantity: dec('2'), executedAt: opened, createdAt: opened },
    { id: 'x1' as TradeExecutionId, tradeId, type: 'exit', price: dec('120'), quantity: dec('2'), executedAt: closed, createdAt: closed },
  ],
  fees: [{ id: 'f1' as TradeFeeId, tradeId, executionId: null, amount: dec('1'), currency: 'USDT', createdAt: closed } as TradeFeeRecord],
  candles: [
    { openTime: '2026-09-20T08:00:00.000Z', closeTime: '2026-09-20T09:59:59.999Z', open: dec('98'), high: dec('105'), low: dec('95'), close: dec('104') },
    { openTime: '2026-09-20T10:00:00.000Z', closeTime: '2026-09-20T13:59:59.999Z', open: dec('104'), high: dec('125'), low: dec('103'), close: dec('121') },
  ],
  now: '2026-09-24T12:00:00.000Z',
};
const infoText = (model: ReturnType<typeof projectTradePicture>, key: string) => model.info.find(row => row.key === key)!.text!;

afterEach(() => { cleanup(); });

describe('T-027c trade picture card', () => {
  it('draws the risk and reward boxes, levels, candles, fill shapes and the info values', () => {
    const model = projectTradePicture(input);
    const { container } = render(<TradePictureCard model={model} />);
    expect(screen.getByText('Risk')).toBeInTheDocument();
    expect(screen.getByText('Reward')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-level]')).toHaveLength(3);
    expect(container.querySelectorAll('.kairos-trade-picture__candle')).toHaveLength(2);
    expect(container.querySelectorAll('[data-marker="entry"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-marker="exit"]')).toHaveLength(1);
    const info = container.querySelector('.kairos-trade-picture__info') as HTMLElement;
    expect(within(info).getByText(infoText(model, 'result'))).toBeInTheDocument();
    expect(within(info).getByText(infoText(model, 'planned-reward'))).toBeInTheDocument();
    expect(within(info).getByText(infoText(model, 'actual-r'))).toBeInTheDocument();
    expect(within(info).getByText('3 h')).toBeInTheDocument();
    expect(screen.queryByText('Candles need a connection.')).toBeNull();
    expect(screen.queryByText('Add a stop and target to see your risk box.')).toBeNull();
  });

  it('shows the connection note without candles, and still draws the boxes', () => {
    const { container } = render(<TradePictureCard model={projectTradePicture({ ...input, candles: null })} />);
    expect(screen.getByText('Candles need a connection.')).toBeInTheDocument();
    expect(container.querySelector('[data-box="risk"]')).not.toBeNull();
    expect(container.querySelectorAll('.kairos-trade-picture__candle')).toHaveLength(0);
  });

  it('asks for a stop and target when the plan has none', () => {
    const { container } = render(<TradePictureCard model={projectTradePicture({ ...input, plans: plan(null, null) })} />);
    expect(screen.getByText('Add a stop and target to see your risk box.')).toBeInTheDocument();
    expect(container.querySelector('[data-box]')).toBeNull();
  });

  it('decides up or down exactly: a candle 1e-19 lower at the close is drawn as down', () => {
    const tiny = { openTime: '2026-09-20T09:00:00.000Z', closeTime: '2026-09-20T09:59:59.999Z', open: dec('0.1000000000000000002'), high: dec('0.1000000000000000003'), low: dec('0.1000000000000000001'), close: dec('0.1000000000000000001') };
    const { container } = render(<TradePictureCard model={projectTradePicture({ ...input, candles: [tiny] })} />);
    const candle = container.querySelector('.kairos-trade-picture__candles g')!;
    expect(candle.getAttribute('data-direction')).toBe('down');
    expect(candle).toHaveClass('kairos-trade-picture__candle--down');
  });

  it('is one image whose label names the market, direction, result and R', () => {
    const model = projectTradePicture(input);
    render(<TradePictureCard model={model} />);
    const image = screen.getByRole('img');
    const label = image.getAttribute('aria-label')!;
    expect(label).toContain('BTCUSDT');
    expect(label).toContain('long');
    expect(label).toContain(infoText(model, 'result'));
    expect(label).toContain(infoText(model, 'actual-r'));
  });
});

describe('T-039b trade picture at card size', () => {
  const extra = [
    { openTime: '2026-09-20T07:00:00.000Z', closeTime: '2026-09-20T07:59:59.999Z', open: dec('150'), high: dec('200'), low: dec('150'), close: dec('190') },
    ...input.candles!,
    { openTime: '2026-09-20T14:00:00.000Z', closeTime: '2026-09-20T14:59:59.999Z', open: dec('121'), high: dec('122'), low: dec('40'), close: dec('45') },
    { openTime: '2026-09-20T15:00:00.000Z', closeTime: '2026-09-20T15:59:59.999Z', open: dec('45'), high: dec('50'), low: dec('38'), close: dec('41') },
  ];
  const candleGroups = (container: HTMLElement) => [...container.querySelectorAll('.kairos-trade-picture__candles > g')];
  const bodyWidths = (container: HTMLElement) => candleGroups(container).map(g => Number(g.querySelector('rect')!.getAttribute('width')));

  it.each([false, true])('clips the candles to the plot height (compact %s)', compact => {
    const { container } = render(<TradePictureCard model={projectTradePicture(input)} compact={compact} />);
    const clip = container.querySelector('clipPath')!;
    const rect = clip.querySelector('rect')!;
    expect([rect.getAttribute('x'), rect.getAttribute('y'), rect.getAttribute('width'), rect.getAttribute('height')]).toEqual(['0', '10', '360', '192']);
    expect(container.querySelector('.kairos-trade-picture__candles')!.getAttribute('clip-path')).toBe(`url(#${clip.id})`);
    if (compact) for (const line of container.querySelectorAll('[data-level] line')) expect(line.getAttribute('x2')).toBe('354');
  });

  it('cuts candles past the range at the edge instead of rescaling', () => {
    const plain = render(<TradePictureCard model={projectTradePicture(input)} />);
    const stopY = plain.container.querySelector('[data-level="stop"] line')!.getAttribute('y1');
    cleanup();
    const { container } = render(<TradePictureCard model={projectTradePicture({ ...input, candles: extra })} />);
    const groups = candleGroups(container);
    expect(groups).toHaveLength(5);
    expect(Number(groups[3]!.querySelector('line')!.getAttribute('y2'))).toBeGreaterThan(202);
    expect(groups[4]!.querySelector('[data-beyond="below"]')).not.toBeNull();
    expect(groups[0]!.querySelector('[data-beyond="above"]')).not.toBeNull();
    expect(groups[3]!.querySelector('[data-beyond]')).toBeNull();
    expect(container.querySelector('[data-level="stop"] line')!.getAttribute('y1')).toBe(stopY);
  });

  function fiveMinute(count: number) {
    const start = Date.parse('2026-09-20T09:00:00.000Z');
    return Array.from({ length: count }, (_, index) => ({
      openTime: new Date(start + index * 300_000).toISOString(), closeTime: new Date(start + (index + 1) * 300_000 - 1).toISOString(),
      open: dec('100'), high: dec('101'), low: dec('99'), close: dec('100.5'),
    }));
  }

  it('sizes bodies from their slot, within 2 and 8 and never wider than the slot', () => {
    const full = render(<TradePictureCard model={projectTradePicture({ ...input, candles: fiveMinute(67) })} />);
    for (const width of bodyWidths(full.container)) expect(width).toBeCloseTo((296 / 67) * 0.7, 6);
    cleanup();
    const compact = render(<TradePictureCard model={projectTradePicture({ ...input, candles: fiveMinute(67) })} compact />);
    for (const width of bodyWidths(compact.container)) expect(width).toBeCloseTo((348 / 67) * 0.7, 6);
    cleanup();
    const many = render(<TradePictureCard model={projectTradePicture({ ...input, candles: fiveMinute(210) })} />);
    for (const width of bodyWidths(many.container)) expect(width).toBeCloseTo(296 / 210, 6);
    cleanup();
    const two = render(<TradePictureCard model={projectTradePicture(input)} />);
    expect(bodyWidths(two.container)).toEqual([8, 8]);
    expect(tradePictureCandleBodyWidth(0, 296)).toBe(0);
  });

  it('draws a candle that did not move as a 2-unit bar', () => {
    const flat = { openTime: '2026-09-20T09:00:00.000Z', closeTime: '2026-09-20T09:59:59.999Z', open: dec('100'), high: dec('101'), low: dec('99'), close: dec('100') };
    const { container } = render(<TradePictureCard model={projectTradePicture({ ...input, candles: [flat] })} />);
    expect(candleGroups(container)[0]!.querySelector('rect')!.getAttribute('height')).toBe('2');
  });
});

describe('T-039c rounded ratios in the picture', () => {
  it('the image name reads the owner\'s result to 2 places', () => {
    const owner: TradePictureInput = {
      ...input,
      plans: [{ ...plan('85300', '86900')[0]!, plannedEntryPrice: dec('85854.34'), plannedQuantity: dec('0.1') }],
      executions: [
        { id: 'e1' as TradeExecutionId, tradeId, type: 'entry', price: dec('85854.34'), quantity: dec('0.1'), executedAt: opened, createdAt: opened },
        { id: 'x1' as TradeExecutionId, tradeId, type: 'exit', price: dec('85792.01'), quantity: dec('0.1'), executedAt: closed, createdAt: closed },
      ],
      fees: [],
      candles: null,
    };
    render(<TradePictureCard model={projectTradePicture(owner)} />);
    const label = screen.getByRole('img').getAttribute('aria-label')!;
    expect(label).toContain('-0.11× what you risked');
    expect(label).not.toContain('0.1124');
  });
});
