import { expect, it, vi } from 'vitest';
import { getChartTheme } from '../src/design-system/themes';
import { createAnalysisCandleRendererSession } from '../src/app/analysisCandleRendererSession';
import type { PresentedChartRenderer } from '../src/features/chart/lightweightChartsV5ProductionRenderer';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';
import type { DecimalString } from '../src/domain/trades';

const snapshot: MarketCandleHistorySnapshot = {
  source: 'market-reference',
  timeZone: 'UTC',
  request: {
    instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' },
    interval: '1m',
    limit: 500,
  },
  observedAt: '2026-09-13T10:00:30.000Z',
  candles: [{
    openTime: '2026-09-13T10:00:00.000Z',
    closeTime: '2026-09-13T10:00:59.999Z',
    open: '2300.10' as DecimalString,
    high: '2302.40' as DecimalString,
    low: '2299.80' as DecimalString,
    close: '2301.75' as DecimalString,
  }],
};

function fakeRenderer(): PresentedChartRenderer {
  return {
    render: vi.fn(),
    updateLatestCandle: vi.fn(),
    setTheme: vi.fn(),
    resetView: vi.fn(),
    showRecent: vi.fn(),
    zoom: vi.fn(),
    pan: vi.fn(),
    destroy: vi.fn(),
  };
}

it('renders the exact authoritative history and returns the same incremental renderer', () => {
  const container = document.createElement('div');
  const renderer = fakeRenderer();
  const factory = { create: vi.fn(() => renderer) };

  const returned = createAnalysisCandleRendererSession({ container, snapshot, themeId: 'ocean', factory });

  expect(returned).toBe(renderer);
  expect(factory.create).toHaveBeenCalledWith(container);
  expect(renderer.setTheme).toHaveBeenCalledWith(getChartTheme('ocean'));
  expect(renderer.render).toHaveBeenCalledWith({
    market: { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' },
    series: { kind: 'candles', candles: snapshot.candles },
    journalExecutions: [],
  });
  expect(renderer.showRecent).toHaveBeenCalledWith(80);

  returned.updateLatestCandle(snapshot.candles[0]);
  expect(renderer.updateLatestCandle).toHaveBeenCalledWith(snapshot.candles[0]);
  expect(renderer.destroy).not.toHaveBeenCalled();
});

it('destroys the partially created renderer and preserves the rendering failure', () => {
  const renderer = fakeRenderer();
  vi.mocked(renderer.render).mockImplementation(() => { throw new Error('authoritative-render-failed'); });

  expect(() => createAnalysisCandleRendererSession({
    container: document.createElement('div'),
    snapshot,
    themeId: 'kairos-depth',
    factory: { create: () => renderer },
  })).toThrow('authoritative-render-failed');

  expect(renderer.destroy).toHaveBeenCalledTimes(1);
  expect(renderer.showRecent).not.toHaveBeenCalled();
});
