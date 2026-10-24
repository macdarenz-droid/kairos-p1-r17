import type { VisualPnlDailyStreakProjection } from '../../application/visual-pnl';
import { Icon, type IconName } from '../../design-system/icons/Icon';

interface VisualPnlStreakProps {
  readonly projection: VisualPnlDailyStreakProjection;
}

function streakLabel(outcome: NonNullable<VisualPnlDailyStreakProjection['outcome']>): string {
  if (outcome === 'profit') return 'Profit streak';
  if (outcome === 'loss') return 'Loss streak';
  return 'Break-even streak';
}

function streakIcon(outcome: NonNullable<VisualPnlDailyStreakProjection['outcome']>): IconName {
  if (outcome === 'profit') return 'result-up';
  if (outcome === 'loss') return 'result-down';
  return 'result-flat';
}

/**
 * Accessible presentation of the authoritative P13.13 streak projection.
 * No streak calculation, financial arithmetic, FX, dates, or storage are owned here.
 */
export function VisualPnlStreak({ projection }: VisualPnlStreakProps) {
  if (projection.outcome === null) {
    return (
      <section className="kairos-pnl-streak kairos-pnl-streak--empty" aria-label="Current result streak">
        <span className="kairos-pnl-streak__label">Current streak</span>
        <strong>No available streak</strong>
        <small>A streak appears after an available daily result.</small>
      </section>
    );
  }

  return (
    <section
      className={`kairos-pnl-streak kairos-pnl-streak--${projection.outcome}`}
      data-streak-outcome={projection.outcome}
      aria-label="Current result streak"
    >
      <span className="kairos-pnl-streak__label">Current streak</span>
      <strong>
        <Icon name={streakIcon(projection.outcome)} size={16} />{' '}
        {streakLabel(projection.outcome)}
      </strong>
      <span>{projection.length} {projection.length === 1 ? 'result day' : 'result days'}</span>
    </section>
  );
}
