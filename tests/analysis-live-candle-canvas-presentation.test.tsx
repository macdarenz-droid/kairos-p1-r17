import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { ThemeProvider } from '../src/design-system/themes';
import type { AnalysisLiveCandleReactBindingOptions, AnalysisLiveCandleReactBindingResult } from '../src/app/useAnalysisLiveCandleRouteSession';
import { AnalysisLiveCandleCanvas } from '../src/app/AnalysisLiveCandleCanvas';

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;

function binding(overrides: Partial<AnalysisLiveCandleReactBindingResult> = {}): AnalysisLiveCandleReactBindingResult {
  return {
    availability: 'available',
    activation: { ok: false, reason: 'superseded' },
    connection: null,
    disposition: null,
    backfillRequest: null,
    backfillRecovery: null,
    lastError: null,
    pan: vi.fn(),
    zoom: vi.fn(),
    resetView: vi.fn(),
    ...overrides,
  };
}

function renderCanvas(result: AnalysisLiveCandleReactBindingResult, revision = 0) {
  const useBinding = vi.fn((_options: AnalysisLiveCandleReactBindingOptions) => result);
  const rendered = render(<ThemeProvider><AnalysisLiveCandleCanvas instrument={instrument} interval="1m" revision={revision} useBinding={useBinding} /></ThemeProvider>);
  return { ...rendered, useBinding };
}

it('binds the exact selected scope to the real chart container without mounting the Analysis route', () => {
  const h = renderCanvas(binding(), 7);
  const canvas = screen.getByRole('group', { name: 'ETHUSDT 1m live candlestick chart' });
  expect(h.useBinding).toHaveBeenCalledWith(expect.objectContaining({
    container: canvas,
    instrument,
    interval: '1m',
    revision: 7,
  }));
  expect(screen.getByRole('status')).toHaveTextContent('ETHUSDT · 1m · Loading candles');
});

it('renders the released exact-live projection and never substitutes generic raw error copy', () => {
  const secret = new Error('private transport detail');
  const live = binding({
    activation: { ok: true, snapshot: {} as never },
    connection: 'live',
    lastError: null,
  });
  const view = renderCanvas(live);
  expect(screen.getByRole('status')).toHaveAttribute('data-live-candle-status', 'live');
  expect(screen.getByText(/Live candles connected/)).toBeInTheDocument();

  view.unmount();
  renderCanvas(binding({
    activation: { ok: true, snapshot: {} as never },
    connection: 'error',
    lastError: secret,
  }));
  expect(screen.getByRole('alert')).toHaveTextContent('Live candle connection error');
  expect(screen.getByRole('alert')).not.toHaveTextContent('private transport detail');
});

it('delegates buttons and keyboard commands to the released viewport controls', () => {
  const result = binding();
  renderCanvas(result);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  fireEvent.click(screen.getByRole('button', { name: 'Fit candles' }));
  const canvas = screen.getByRole('group', { name: 'ETHUSDT 1m live candlestick chart' });
  fireEvent.keyDown(canvas, { key: 'ArrowLeft' });
  fireEvent.keyDown(canvas, { key: 'ArrowRight' });
  fireEvent.keyDown(canvas, { key: '+' });
  fireEvent.keyDown(canvas, { key: '-' });
  fireEvent.keyDown(canvas, { key: 'Home' });
  expect(result.pan).toHaveBeenNthCalledWith(1, -.2);
  expect(result.pan).toHaveBeenNthCalledWith(2, .2);
  expect(result.zoom).toHaveBeenNthCalledWith(1, 1.25);
  expect(result.zoom).toHaveBeenNthCalledWith(2, .8);
  expect(result.zoom).toHaveBeenNthCalledWith(3, .8);
  expect(result.zoom).toHaveBeenNthCalledWith(4, 1.25);
  expect(result.resetView).toHaveBeenCalledTimes(2);
});

it('keeps unsupported keys inert and removes controls with the presentation', () => {
  const result = binding();
  const view = renderCanvas(result);
  const canvas = screen.getByRole('group', { name: 'ETHUSDT 1m live candlestick chart' });
  expect(fireEvent.keyDown(canvas, { key: 'Enter' })).toBe(true);
  expect(result.pan).not.toHaveBeenCalled();
  expect(result.zoom).not.toHaveBeenCalled();
  expect(result.resetView).not.toHaveBeenCalled();
  view.unmount();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
