import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AnalysisSavedTradeMarkerEvidencePresentation } from '../src/app/AnalysisSavedTradeMarkerEvidencePresentation';
import type { AnalysisSavedTradeMarkerPresentationResult } from '../src/app/analysisSavedTradeMarkerPresentationSession';

afterEach(cleanup);

const ready = {
  reference: { kind: 'reference-ready' },
  window: { kind: 'window-ready' },
  markers: {
    kind: 'markers-ready',
    historyObservedAt: '2026-09-14T05:00:00.000Z',
    historyInterval: '5m',
    markers: [{
      markerId: 'journal-execution:entry-1',
      role: 'entry',
      executionId: 'entry-1',
      executedAt: '2026-09-14T04:52:03.000Z',
      price: '2412.125',
      quantity: '0.75',
      candleAnchorTime: '2026-09-14T04:50:00.000Z',
      candleCloseTime: '2026-09-14T04:54:59.999Z',
      candleIndex: 7,
    }],
    unplacedExecutions: [{
      executionId: 'exit-1',
      role: 'exit',
      executedAt: '2026-09-14T05:11:00.000Z',
      price: '2440.80',
      quantity: '0.75',
      reason: 'after-history',
    }],
  },
  presentation: {},
} as unknown as AnalysisSavedTradeMarkerPresentationResult;

it('announces preparation without claiming any marker placement', () => {
  render(<AnalysisSavedTradeMarkerEvidencePresentation presentation={null} lastError={null} quoteAsset="USDT" />);
  expect(screen.getByRole('status')).toHaveTextContent('Preparing saved trade marker details');
  expect(screen.queryByText(/shown on chart/i)).toBeNull();
});

it('presents exact placed and unplaced execution evidence accessibly', () => {
  render(<AnalysisSavedTradeMarkerEvidencePresentation presentation={ready} lastError={null} quoteAsset="USDT" />);
  expect(screen.getByRole('status')).toHaveTextContent('1 shown · 1 not shown');
  expect(screen.getByText(/received 2026-09-14T05:00:00.000Z/)).toBeVisible();
  fireEvent.click(screen.getByText('Saved execution details'));
  expect(screen.getByRole('region', { name: 'Saved execution marker evidence table' })).toBeVisible();
  expect(screen.getByText('2412.125')).toBeVisible();
  expect(screen.getAllByText('0.75')).toHaveLength(2);
  expect(screen.getByText('2026-09-14T04:50:00.000Z')).toBeVisible();
  expect(screen.getByText('Not shown · after available candle history')).toBeVisible();
  expect(screen.getByText(/prices in USDT · times in UTC/i)).toBeVisible();
});

it('explains exact fail-closed reference eligibility without inventing marker facts', () => {
  const unavailable = {
    reference: { kind: 'unavailable', reason: 'symbol-mismatch' },
    window: { kind: 'unavailable' },
    markers: { kind: 'unavailable', reason: 'reference-unavailable' },
    presentation: {},
  } as unknown as AnalysisSavedTradeMarkerPresentationResult;
  render(<AnalysisSavedTradeMarkerEvidencePresentation presentation={unavailable} lastError={null} quoteAsset="USDT" />);
  expect(screen.getByRole('status')).toHaveTextContent('Saved trade markers unavailable');
  expect(screen.getByText('Choose the saved trade’s exact symbol to show its executions.')).toBeVisible();
  expect(screen.queryByRole('table')).toBeNull();
});

it('retains complete evidence and never exposes a lower-owner error', () => {
  render(<AnalysisSavedTradeMarkerEvidencePresentation presentation={ready} lastError={new Error('private transport detail')} quoteAsset="USDT" />);
  expect(screen.getByRole('alert')).toHaveTextContent('last complete details remain unchanged');
  expect(screen.queryByText(/private transport detail/i)).toBeNull();
  expect(screen.getByRole('status')).toHaveTextContent('1 shown · 1 not shown');
});
