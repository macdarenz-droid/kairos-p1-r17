import type { ReactElement } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import './kit.css';

export interface EmptyStateProps {
  readonly icon: IconName;
  readonly title: string;
  readonly message?: string;
  /** At most one thing to do next. */
  readonly action?: ReactElement;
  readonly headingLevel?: 2 | 3;
}

/** Nothing here yet: a picture, a heading, a sentence and one action. */
export function EmptyState({ icon, title, message, action, headingLevel = 2 }: EmptyStateProps) {
  const Heading = headingLevel === 3 ? 'h3' : 'h2';
  return <div className="kairos-empty-state">
    <span className="kairos-empty-state__picture" aria-hidden="true"><Icon name={icon} size={40} /></span>
    <Heading className="kairos-empty-state__title">{title}</Heading>
    {message !== undefined ? <p className="kairos-empty-state__message">{message}</p> : null}
    {action !== undefined ? <div className="kairos-empty-state__action">{action}</div> : null}
  </div>;
}
