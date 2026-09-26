import type { VisualPnlDailyPerformanceSummary } from '../application/visual-pnl';

interface VisualPnlPerformanceSummaryProps {
  readonly summary: VisualPnlDailyPerformanceSummary;
}

/**
 * Presentation-only view of P13.15 semantic result-day counts.
 * It does not calculate rates, percentages, money, FX, or account equity.
 */
export function VisualPnlPerformanceSummary({ summary }: VisualPnlPerformanceSummaryProps) {
  if (summary.totalResultDays === 0) {
    return (
      <section className="kairos-pnl-performance-summary" aria-label="Result day summary">
        <span className="kairos-pnl-performance-summary__label">Result days</span>
        <strong>No result days yet</strong>
      </section>
    );
  }

  return (
    <section className="kairos-pnl-performance-summary" aria-label="Result day summary">
      <span className="kairos-pnl-performance-summary__label">Result days</span>
      <div className="kairos-pnl-performance-summary__grid">
        <span><strong>{summary.profitDays}</strong> ▲ Profit</span>
        <span><strong>{summary.lossDays}</strong> ▼ Loss</span>
        <span><strong>{summary.breakEvenDays}</strong> — Break-even</span>
        <span><strong>{summary.availableResultDays}</strong> Available</span>
        {summary.unavailableResultDays > 0 ? (
          <span><strong>{summary.unavailableResultDays}</strong> · Unavailable</span>
        ) : null}
      </div>
    </section>
  );
}
