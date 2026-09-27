import { Icon, type IconName } from '../icons/Icon';
import './kit.css';

/** The fields of a result as its owner projects it (outcome, word, amount, currency); the design system imports no application type. */
export interface ResultTextProps {
  readonly outcome: 'profit' | 'loss' | 'breakeven' | 'unavailable';
  readonly label: string;
  readonly amount: string | null;
  readonly currency?: string | null;
  /** false keeps the word for screen readers only. */
  readonly showLabel?: boolean;
  readonly className?: string;
}

const OUTCOME_ICONS: Readonly<Record<ResultTextProps['outcome'], IconName>> = Object.freeze({ profit: 'result-up', loss: 'result-down', breakeven: 'result-flat', unavailable: 'result-unknown' });

/** A result with a word, a shape and a sign. It never computes: outcome, sign and digits come from the owner (golden rule 2). */
export function ResultText({ outcome, label, amount, currency, showLabel = true, className }: ResultTextProps) {
  const shown = outcome === 'unavailable' || amount === null
    ? null
    : `${outcome === 'profit' && !amount.startsWith('+') && !amount.startsWith('-') ? '+' : ''}${amount}${currency ? ` ${currency}` : ''}`;
  return <span className={['kairos-result', className].filter(Boolean).join(' ')} data-outcome={outcome}>
    <Icon name={OUTCOME_ICONS[outcome]} size={16} />
    <span className={showLabel ? 'kairos-result__label' : 'kairos-visually-hidden'}>{label}</span>
    {shown !== null ? <strong className="kairos-result__amount">{shown}</strong> : null}
  </span>;
}
