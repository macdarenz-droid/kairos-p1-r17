import type { VisualPnlDailyPerformanceSummary } from '../application/visual-pnl';
import { StatTile } from '../design-system/primitives';

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
      <dl className="kairos-stat-grid">
        <StatTile label="Profit days" mark="up" value={summary.profitDays} />
        <StatTile label="Loss days" mark="down" value={summary.lossDays} />
        <StatTile label="Break-even days" mark="flat" value={summary.breakEvenDays} />
        <StatTile label="Days with a result" value={summary.availableResultDays} />
        {summary.unavailableResultDays > 0 ? <StatTile label="Days not available" mark="unknown" value={summary.unavailableResultDays} /> : null}
      </dl>
    </section>
  );
}
