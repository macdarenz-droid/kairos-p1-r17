import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { projectTradePicture, type TradePictureInput } from '../src/application/trade-visualizer';
import { parseDecimalString, type DecimalString, type TradeExecutionId, type TradeFeeId, type TradeFeeRecord, type TradeId, type TradePlanId, type TradeRecord } from '../src/domain/trades';
import { TradePictureCard } from '../src/features/journal/TradePictureCard';

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
