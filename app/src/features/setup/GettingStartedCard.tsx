import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { loadGettingStarted, type GettingStarted, type GettingStartedStep } from '../../application/setup/gettingStarted';
import { hideGettingStarted } from '../../application/setup/setupState';
import type { KairosDatabase } from '../../data/database';
import { Icon } from '../../design-system/icons/Icon';
import { Button, Card } from '../../design-system/primitives';
import './setup.css';

/** The address that opens the Journal's trade form (D225). */
export const LOG_TRADE_ADDRESS = '/journal?log=1';

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function CardLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

const whereToDo = (step: GettingStartedStep) => (step.setupStep === null ? LOG_TRADE_ADDRESS : `/setup?step=${step.setupStep}`);

/**
 * T-053e (D224): Home's "Getting started", until every step is done or the trader hides it. Each open step links to
 * where it is done; "Hide" is saved, and the host moves focus on (`onHidden`).
 */
export function GettingStartedCard({ db, now, onHidden }: { readonly db: KairosDatabase; readonly now?: () => string; readonly onHidden: () => void }) {
  const titleId = useId();
  const [state, setState] = useState<GettingStarted | null>(null);
  const [hiding, setHiding] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let ignore = false;
    loadGettingStarted(db).then(result => { if (!ignore) setState(result); }, () => undefined);
    return () => { ignore = true; };
  }, [db]);

  async function hide(): Promise<void> {
    if (hiding) return;
    setHiding(true);
    const result = await hideGettingStarted(db, { now });
    setHiding(false);
    if (!result.ok) { setFailed(true); return; }
    setState(current => (current === null ? current : { ...current, hidden: true }));
    onHidden();
  }

  if (state === null || state.hidden || state.allDone) return null;
  const total = state.steps.length;
  return <Card as="section" className="kairos-getting-started" aria-labelledby={titleId}>
    <div className="kairos-getting-started__heading">
      <h2 id={titleId}>Getting started</h2>
      <Button variant="ghost" size="sm" onClick={() => { void hide(); }} aria-disabled={hiding || undefined}>Hide</Button>
    </div>
    <p className="kairos-getting-started__count">{state.doneCount} of {total} done</p>
    <span className="kairos-getting-started__bar" aria-hidden="true"><span style={{ inlineSize: `${(state.doneCount / total) * 100}%` }} /></span>
    <ol className="kairos-getting-started__steps">
      {state.steps.map(step => <li key={step.key} data-done={step.done ? 'true' : 'false'}>
        {step.done ? <Icon name="check" size={20} className="kairos-getting-started__tick" /> : <span className="kairos-getting-started__circle" aria-hidden="true" />}
        {step.done ? <span>{step.label}<span className="kairos-visually-hidden"> (done)</span></span> : <CardLink to={whereToDo(step)}>{step.label}</CardLink>}
      </li>)}
    </ol>
    {failed ? <p role="alert">Kairos could not hide this card. Nothing was changed.</p> : null}
  </Card>;
}
