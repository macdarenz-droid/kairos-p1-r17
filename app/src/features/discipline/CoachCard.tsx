import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import type { CoachNotesQueryResult } from '../../application/coach/loadCoachNotes';
import { describeCoachNote } from '../../application/coach/coachWords';
import type { JournalHistoryScope } from '../../application/journal';
import type { KairosDatabase } from '../../data/database';
import { Card } from '../../design-system/primitives';
import './coach.css';

export interface CoachCardProps {
  readonly db: KairosDatabase;
  readonly scope: JournalHistoryScope;
  readonly now: () => string;
  /** Bumped by the host when trades change. */
  readonly refreshRevision: number;
  /** Bumped by the host when a checklist, review or strategy is saved on a card. */
  readonly disciplineRevision: number;
}

type CardState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'error' }> | Readonly<{ kind: 'ready'; result: CoachNotesQueryResult }>;

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function CoachLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

/** P29: the coach under "Your discipline": how many notes this month, the first one and its step, and the page. Its rules load on demand. */
export function CoachCard({ db, scope, now, refreshRevision, disciplineRevision }: CoachCardProps) {
  const titleId = useId();
  const [state, setState] = useState<CardState>({ kind: 'loading' });

  useEffect(() => {
    let ignore = false;
    // Only the first load shows "loading"; a reload keeps the last card until the new result arrives.
    import('../../application/coach/loadCoachNotes')
      .then(module => module.loadCoachNotes(db, { now: now(), scope }))
      .then(result => { if (!ignore) setState({ kind: 'ready', result }); }, () => { if (!ignore) setState({ kind: 'error' }); });
    return () => { ignore = true; };
  }, [db, now, scope, refreshRevision, disciplineRevision]);

  const page = scope === 'practice' ? '/practice/coach' : '/coach';
  const result = state.kind === 'ready' ? state.result : null;
  const notes = result?.kind === 'ready' ? result.notes : null;
  const first = notes && notes.length > 0 ? describeCoachNote(notes[0]!) : null;
  return <Card as="section" className="kairos-coach-card" aria-labelledby={titleId}>
    <div className="kairos-coach-card__heading">
      <h3 id={titleId}>{scope === 'practice' ? 'Your practice coach' : 'Your coach'}</h3>
      <p>This month</p>
    </div>
    {state.kind === 'loading' ? <p>Loading your coach…</p> : null}
    {state.kind === 'error' || result?.kind === 'unavailable' ? <p>Kairos could not load your coach. Your trades are not affected.</p> : null}
    {result?.kind === 'time-zone-unconfigured' ? <p>Your coach needs your time zone. <CoachLink to="/settings">Open Settings</CoachLink></p> : null}
    {notes && notes.length === 0 ? <>
      <p>Nothing to point out this month. Your coach speaks up only when your own trades, plans or rules show something to work on.</p>
      <p><CoachLink to={page}>Open your coach</CoachLink></p>
    </> : null}
    {notes && first ? <>
      <p className="kairos-coach-card__count">{notes.length === 1 ? '1 note' : `${notes.length} notes`}</p>
      <p className="kairos-coach-card__title">{first.title}</p>
      <p>{first.step}</p>
      <p><CoachLink to={page}>See all your coach notes</CoachLink></p>
    </> : null}
  </Card>;
}
