import type { ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import './kit.css';

export interface StatTileProps {
  readonly label: string;
  /** Shown as given: the number's owner formats it (golden rule 2). */
  readonly value: ReactNode;
  readonly hint?: string;
  readonly mark?: 'up' | 'down' | 'flat' | 'unknown';
  readonly emphasis?: 'main' | 'insight';
}

const MARK_ICONS: Readonly<Record<NonNullable<StatTileProps['mark']>, IconName>> = Object.freeze({ up: 'result-up', down: 'result-down', flat: 'result-flat', unknown: 'result-unknown' });

/** One number with its name, placed by the caller in `<dl className="kairos-stat-grid">`. */
export function StatTile({ label, value, hint, mark, emphasis }: StatTileProps) {
  return <div className="kairos-stat" data-kairos-emphasis={emphasis} data-mark={mark}>
    <dt className="kairos-stat__label">{mark !== undefined ? <Icon name={MARK_ICONS[mark]} size={16} /> : null}{label}</dt>
    <dd className="kairos-stat__value">{value}</dd>
    {hint ? <dd className="kairos-stat__hint">{hint}</dd> : null}
  </div>;
}
