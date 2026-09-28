import { useState, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { Button } from './Button';
import { Sheet } from './Sheet';
import './kit.css';

export interface PageHeaderProps {
  readonly title: string;
  /** The id the screen's section names in aria-labelledby. */
  readonly titleId: string;
  readonly eyebrow?: string;
  /** One plain sentence. */
  readonly intro?: string;
  /** The longer explanation, shown in a sheet behind "How this works". */
  readonly howItWorks?: ReactNode;
  readonly tone?: 'default' | 'insight';
  /** One badge or button beside the title. */
  readonly action?: ReactNode;
}

/** A screen's header: its one h1 (focusable for the shell's focus move, D179), a short intro and "How this works". */
export function PageHeader({ title, titleId, eyebrow, intro, howItWorks, tone = 'default', action }: PageHeaderProps) {
  const [open, setOpen] = useState(false);
  return <header className="kairos-page-header" data-tone={tone}>
    {eyebrow !== undefined ? <p className="kairos-page-header__eyebrow">{eyebrow}</p> : null}
    <div className="kairos-page-header__row">
      <h1 id={titleId} tabIndex={-1} className="kairos-page-header__title">{title}</h1>
      {action !== undefined ? <div className="kairos-page-header__action">{action}</div> : null}
    </div>
    {tone === 'insight' ? <span className="kairos-page-header__bar" aria-hidden="true" /> : null}
    {intro !== undefined ? <p className="kairos-page-header__intro">{intro}</p> : null}
    {howItWorks !== undefined ? <>
      <Button variant="ghost" size="sm" className="kairos-page-header__how" onClick={() => setOpen(true)}><Icon name="info" size={16} />How this works</Button>
      <Sheet open={open} title="How this works" onClose={() => setOpen(false)}>{howItWorks}</Sheet>
    </> : null}
  </header>;
}
