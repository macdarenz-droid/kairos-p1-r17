import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisualPnlPerformanceSummary } from '../src/app/VisualPnlPerformanceSummary';

describe('P13.16 Visual P&L performance summary presentation', () => {
  it('presents semantic result-day counts without percentages', () => {
    render(<VisualPnlPerformanceSummary summary={{
      availableResultDays: 5, profitDays: 3, lossDays: 1, breakEvenDays: 1,
      unavailableResultDays: 0, totalResultDays: 5,
    }} />);
    expect(screen.getByText('▲ Profit')).toBeInTheDocument();
    expect(screen.getByText('▼ Loss')).toBeInTheDocument();
    expect(screen.getByText('— Break-even')).toBeInTheDocument();
    expect(screen.getByText('Available')).toBeInTheDocument();
  });

  it('surfaces unavailable result days separately', () => {
    render(<VisualPnlPerformanceSummary summary={{
      availableResultDays: 2, profitDays: 1, lossDays: 1, breakEvenDays: 0,
      unavailableResultDays: 2, totalResultDays: 4,
    }} />);
    expect(screen.getByText('· Unavailable')).toBeInTheDocument();
  });

  it('presents an explicit empty state', () => {
    render(<VisualPnlPerformanceSummary summary={{
      availableResultDays: 0, profitDays: 0, lossDays: 0, breakEvenDays: 0,
      unavailableResultDays: 0, totalResultDays: 0,
    }} />);
    expect(screen.getByText('No result days yet')).toBeInTheDocument();
  });
});
