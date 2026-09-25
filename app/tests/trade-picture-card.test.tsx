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

describe('T-039d labels, wick arrows and times', () => {
  const extra = [
    { openTime: '2026-09-20T07:00:00.000Z', closeTime: '2026-09-20T07:59:59.999Z', open: dec('150'), high: dec('200'), low: dec('150'), close: dec('190') },
    ...input.candles!,
    { openTime: '2026-09-20T14:00:00.000Z', closeTime: '2026-09-20T14:59:59.999Z', open: dec('121'), high: dec('122'), low: dec('40'), close: dec('45') },
    { openTime: '2026-09-20T15:00:00.000Z', closeTime: '2026-09-20T15:59:59.999Z', open: dec('45'), high: dec('50'), low: dec('38'), close: dec('41') },
  ];
  const lineY = (container: HTMLElement, kind: string) => Number(container.querySelector(`[data-level="${kind}"] line`)!.getAttribute('y1'));
  const labelBox = (container: HTMLElement, kind: string) => {
    const rect = container.querySelector(`[data-box-label="${kind}"] rect`)!;
    const top = Number(rect.getAttribute('y'));
    return { top, bottom: top + Number(rect.getAttribute('height')), x: Number(rect.getAttribute('x')) };
  };
  const between = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b);
  const middle = (box: { top: number; bottom: number }) => (box.top + box.bottom) / 2;

  function expectFarEdgeLabels(container: HTMLElement) {
    const entry = lineY(container, 'entry'), stop = lineY(container, 'stop'), target = lineY(container, 'target');
    const risk = labelBox(container, 'risk'), reward = labelBox(container, 'reward');
    for (const [box, edge] of [[risk, stop], [reward, target]] as const) {
      expect(between(box.top, entry, edge) && between(box.bottom, entry, edge)).toBe(true);
      expect(Math.abs(middle(box) - edge)).toBeLessThan(Math.abs(middle(box) - entry));
      expect(between(entry, box.top, box.bottom)).toBe(false);
    }
    expect(container.querySelector('[data-box-label="risk"] text')!.textContent).toBe('Risk');
    expect(container.querySelector('[data-box-label="reward"] text')!.textContent).toBe('Reward');
    const candlesGroup = container.querySelector('.kairos-trade-picture__candles')!;
    const markers = [...container.querySelectorAll('[data-marker]')];
    for (const label of container.querySelectorAll('[data-box-label]')) {
      for (const earlier of [candlesGroup, ...markers]) expect(earlier.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const entryMarker = container.querySelector('[data-marker="entry"]')!.getAttribute('points')!;
    const markerRight = Number(entryMarker.split(' ')[1]!.split(',')[0]);
    for (const box of [risk, reward]) expect(box.x).toBeGreaterThanOrEqual(markerRight);
  }

  it('puts Risk and Reward at the far edge of a long trade\'s boxes, drawn last', () => {
    const { container } = render(<TradePictureCard model={projectTradePicture(input)} />);
    expectFarEdgeLabels(container);
  });

  it('does the same for a short trade', () => {
    const short: TradePictureInput = {
      ...input,
      trade: { ...trade, side: 'short' },
      plans: [{ ...plan('110', '80')[0]! }],
      executions: [
        { id: 'e1' as TradeExecutionId, tradeId, type: 'entry', price: dec('100'), quantity: dec('2'), executedAt: opened, createdAt: opened },
        { id: 'x1' as TradeExecutionId, tradeId, type: 'exit', price: dec('85'), quantity: dec('2'), executedAt: closed, createdAt: closed },
      ],
    };
    const { container } = render(<TradePictureCard model={projectTradePicture(short)} />);
    expectFarEdgeLabels(container);
  });

  it('a thin box puts its label outside, past the stop', () => {
    const { container } = render(<TradePictureCard model={projectTradePicture({ ...input, plans: plan('99', '130') })} />);
    expect(labelBox(container, 'risk').top).toBeGreaterThan(lineY(container, 'stop'));
  });

  it('puts an arrow at every edge a candle runs past', () => {
    const both = { openTime: '2026-09-20T16:00:00.000Z', closeTime: '2026-09-20T16:59:59.999Z', open: dec('100'), high: dec('140'), low: dec('80'), close: dec('90') };
    const { container } = render(<TradePictureCard model={projectTradePicture({ ...input, candles: [...extra, both] })} />);
    const groups = [...container.querySelectorAll('.kairos-trade-picture__candles > g')];
    const [g07, g08, g10, g14, g15, g16] = groups;
    expect(g14!.querySelectorAll('[data-edge="below"]')).toHaveLength(1);
    expect(g14!.querySelector('[data-beyond]')).toBeNull();
    expect(g15!.querySelector('[data-edge="below"][data-beyond="below"]')).not.toBeNull();
    expect(g07!.querySelector('[data-edge="above"][data-beyond="above"]')).not.toBeNull();
    expect(g16!.querySelector('[data-edge="above"]')).not.toBeNull();
    expect(g16!.querySelector('[data-edge="below"]')).not.toBeNull();
    expect(g16!.querySelector('[data-beyond]')).toBeNull();
    expect(g08!.querySelector('[data-edge]')).toBeNull();
    expect(g10!.querySelector('[data-edge]')).toBeNull();
  });

  it('shows Opened and Closed like the card header', () => {
    const format = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    const { container } = render(<TradePictureCard model={projectTradePicture(input)} />);
    expect(container.querySelector('[data-info="opened"] dd')!.textContent).toBe(format(opened));
    expect(container.querySelector('[data-info="closed"] dd')!.textContent).toBe(format(closed));
    expect(container.querySelector('[data-info="opened"] dt')!.textContent).toBe('Opened');
    expect(container.querySelector('[data-info="closed"] dt')!.textContent).toBe('Closed');
    expect(container.querySelector('[data-info="date"]')).toBeNull();
    cleanup();
    const open = render(<TradePictureCard model={projectTradePicture({ ...input, trade: { ...trade, status: 'open', closedAt: null } })} />);
    expect(open.container.querySelector('[data-info="closed"] dd')!.textContent).toBe('Not available');
  });
});
