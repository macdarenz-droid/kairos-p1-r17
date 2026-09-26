import '@testing-library/jest-dom/vitest';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisualPnlStreak } from '../src/app/VisualPnlStreak';

describe('P13.14 Visual P&L streak presentation', () => {
  it('presents profit with text, mark and result-day count', () => {
    render(<VisualPnlStreak projection={{
      outcome: 'profit',
      length: 3,
      startDayKey: '2026-09-01',
      endDayKey: '2026-09-05',
    }} />);
    expect(screen.getByText('Profit streak')).toBeInTheDocument();
    expect(screen.getByText('3 result days')).toBeInTheDocument();
    expect(screen.getByText('▲')).toHaveAttribute('aria-hidden', 'true');
  });

  it('presents loss without relying on color alone', () => {
    render(<VisualPnlStreak projection={{
      outcome: 'loss',
      length: 1,
      startDayKey: '2026-09-05',
      endDayKey: '2026-09-05',
    }} />);
    expect(screen.getByText('Loss streak')).toBeInTheDocument();
    expect(screen.getByText('1 result day')).toBeInTheDocument();
    expect(screen.getByText('▼')).toHaveAttribute('aria-hidden', 'true');
  });

  it('presents break-even explicitly', () => {
    render(<VisualPnlStreak projection={{
      outcome: 'breakeven',
      length: 2,
      startDayKey: '2026-09-03',
      endDayKey: '2026-09-04',
    }} />);
    expect(screen.getByText('Break-even streak')).toBeInTheDocument();
  });

  it('presents an explicit empty state', () => {
    render(<VisualPnlStreak projection={{
      outcome: null,
      length: 0,
      startDayKey: null,
      endDayKey: null,
    }} />);
    expect(screen.getByText('No available streak')).toBeInTheDocument();
  });
});
