import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import type { CoachNote } from '../../application/coach/coachNotes';
import { describeCoachNote, describeCoachTradeFacts } from '../../application/coach/coachWords';
import { loadCoachNotes, type CoachNotesQueryResult } from '../../application/coach/loadCoachNotes';
import { projectStrategyRuleBars, STRATEGY_RULE_BAR_STEPS } from '../../application/discipline/strategyCheck';
import type { JournalHistoryScope } from '../../application/journal';
import type { KairosDatabase } from '../../data/database';
import { Card } from '../../design-system/primitives';
import './disciplineScore.css';
import './tradeDisciplineControls.css';
import './coach.css';

export interface CoachScreenProps {
  readonly db: KairosDatabase;
  readonly scope: JournalHistoryScope;
  /** The host renders the link to one trade; the composition root passes ReviewTradeLink (features never import app). */
  readonly renderTradeLink: (tradeId: string) => ReactNode;
  /** The current instant (UTC ISO); tests inject a fixed one. */
  readonly now?: () => string;
}

type ScreenState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'failed' }> | Readonly<{ kind: 'ready'; result: CoachNotesQueryResult }>;

const wallClock = (): string => new Date().toISOString();
const INTRO = {
  real: 'Your coach reads your trades on this device: the ones you closed this month, and for your daily limit the ones you opened today. It points out where they went against your plan, your strategy, your goals or your reviews, with the trades and one next step for each. It never tells you what to buy or sell, and it never guesses: when a plan, a stop or a price is missing, it says nothing about that trade.',
  practice: 'Your practice coach reads the practice trades you closed this month on this device, replays included. It points out where they went against your plan, your strategy or your reviews, with one next step for each. It never tells you what to buy or sell. Practice trades never count in your Journal.',
} as const;

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function CoachLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

const barWidth = (steps: number) => ({ inlineSize: `${(steps / STRATEGY_RULE_BAR_STEPS) * 100}%` });
const closedOn = (closedAt: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(closedAt));

function SizeBars({ planned, traded }: { readonly planned: string; readonly traded: string }) {
  const bars = projectStrategyRuleBars(planned, traded);
  if (bars === null) return null;
  return <span className="kairos-strategy-bars" aria-hidden="true">
    <span>You planned</span>
    <span className="kairos-strategy-bar" data-bar="planned" data-steps={bars.firstSteps}><span style={barWidth(bars.firstSteps)} /></span>
    <span>You traded</span>
    <span className="kairos-strategy-bar" data-bar="traded" data-steps={bars.secondSteps}><span style={barWidth(bars.secondSteps)} /></span>
  </span>;
}

function CoachNoteCard({ note, renderTradeLink }: { readonly note: CoachNote; readonly renderTradeLink: (tradeId: string) => ReactNode }) {
  const words = describeCoachNote(note);
  const titleId = useId();
  return <Card as="article" className="kairos-coach-note" aria-labelledby={titleId} data-note={note.kind}>
    <p className="kairos-coach-note__topic">{words.topic}</p>
    <h2 id={titleId}>{words.title}</h2>
    {note.kind === 'reviews-missing' ? <span className="kairos-discipline-bar" data-percent={note.percent} aria-hidden="true"><span style={{ inlineSize: `${note.percent}%` }} /></span> : null}
    <p className="kairos-coach-note__step"><strong>Next step:</strong> {words.step}</p>
    {note.kind !== 'daily-limit' ? <ul className="kairos-coach-note__trades" aria-label="Trades behind this note">
      {note.trades.map((trade, index) => <li key={trade.tradeId}>
        <p><strong>{trade.symbol}</strong>{trade.closedAt ? ` · closed ${closedOn(trade.closedAt)}` : ''}</p>
        {note.kind === 'size-over-plan' ? <SizeBars planned={note.trades[index]!.planned} traded={note.trades[index]!.traded} /> : null}
        {describeCoachTradeFacts(note, index).map((line, lineIndex) => <p key={lineIndex}>{line}</p>)}
        {renderTradeLink(trade.tradeId)}
      </li>)}
    </ul> : null}
  </Card>;
}

/** P29 "Your coach": this month's notes for one scope, their trades and one next step each. It only reads. */
export function CoachScreen({ db, scope, renderTradeLink, now = wallClock }: CoachScreenProps) {
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  useEffect(() => {
    let ignore = false;
    setState({ kind: 'loading' });
    loadCoachNotes(db, { now: now(), scope }).then(
      result => { if (!ignore) setState({ kind: 'ready', result }); },
      () => { if (!ignore) setState({ kind: 'failed' }); },
    );
    return () => { ignore = true; };
  }, [db, scope, now]);

  const practice = scope === 'practice';
  const result = state.kind === 'ready' ? state.result : null;
  return <section className="kairos-route kairos-coach" aria-labelledby="kairos-coach-title">
    <p className="kairos-coach__eyebrow">{practice ? 'Practice' : 'Discipline'}</p>
    <h1 id="kairos-coach-title" tabIndex={-1}>{practice ? 'Your practice coach' : 'Your coach'}</h1>
    <p>{practice ? INTRO.practice : INTRO.real}</p>
    {state.kind === 'loading' ? <p>Loading your coach…</p> : null}
    {state.kind === 'failed' || result?.kind === 'unavailable' ? <p>Kairos could not load your coach. Your trades are not affected.</p> : null}
    {result?.kind === 'time-zone-unconfigured' ? <p>Your coach reads the trades you closed this month, so it needs your time zone first. <CoachLink to="/settings">Open Settings</CoachLink></p> : null}
    {result?.kind === 'ready' && result.notes.length === 0 ? <p>Nothing to point out this month. Your coach speaks up only when your own trades, plans or rules show something to work on.</p> : null}
    {result?.kind === 'ready' && result.notes.length > 0 ? <>
      <p className="kairos-coach__count">{result.notes.length === 1 ? '1 note this month' : `${result.notes.length} notes this month`}</p>
      <div className="kairos-coach__notes">
        {result.notes.map(note => <CoachNoteCard key={note.key} note={note} renderTradeLink={renderTradeLink} />)}
      </div>
    </> : null}
    {result?.kind === 'ready' ? <p className="kairos-coach__zone">Time zone: {result.timeZone}</p> : null}
    <p><CoachLink to={practice ? '/practice' : '/journal'}>{practice ? 'Back to Practice' : 'Back to your Journal'}</CoachLink></p>
  </section>;
}
