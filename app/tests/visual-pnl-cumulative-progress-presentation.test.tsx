import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisualPnlCumulativeProgress } from '../src/app/VisualPnlCumulativeProgress';
import { parseDecimalString } from '../src/domain/trades';

function dec(value: string) {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error('bad fixture');
  return parsed.value;
}

describe('P13.19 cumulative realized P&L presentation', () => {
  it('renders exact cumulative values and labels them as realized rather than equity', () => {
    render(<VisualPnlCumulativeProgress projection={{
      available: true,
      currency: 'USD',
      points: [
        { dayKey: '2026-09-01', dailyAmount: dec('100'), cumulativeAmount: dec('100') },
        { dayKey: '2026-09-02', dailyAmount: dec('-30'), cumulativeAmount: dec('70') },
      ],
    }} />);
    expect(screen.getByRole('heading', { name: 'Cumulative realized P&L' })).toBeInTheDocument();
    expect(screen.getAllByText('70 USD').length).toBeGreaterThan(0);
    expect(screen.getByText('Realized results only. This is not account equity.')).toBeInTheDocument();
  });

  it('states mixed-currency unavailability explicitly', () => {
    render(<VisualPnlCumulativeProgress projection={{ available: false, currency: null, points: [], reason: 'mixed-currencies' }} />);
    expect(screen.getByText('Cumulative progress is unavailable for mixed currencies.')).toBeInTheDocument();
  });
});
