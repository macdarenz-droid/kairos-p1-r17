import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import type { JournalHistoryScope } from '../../application/journal';
import { loadTradePatterns, TRADE_PATTERN_PERIOD_DAYS, type TradePatternsQueryResult } from '../../application/patterns/loadTradePatterns';
import { describePatternGroupLabel, describePatternGroupListLink, describePatternLeftOut, describePatternSummary, describeTradePattern } from '../../application/patterns/patternWords';
import { PATTERN_BAR_STEPS, PATTERN_LEAST_TRADES, type PatternTradesSummary, type TradePattern, type TradePatternGroup, type TradePatternKind } from '../../application/patterns/tradePatterns';
import type { KairosDatabase } from '../../data/database';
import { Card, ErrorState, Skeleton } from '../../design-system/primitives';
import './patterns.css';

export interface PatternsPanelProps {
  readonly db: KairosDatabase;
  readonly scope: JournalHistoryScope;
  /** The current instant (UTC ISO); tests inject a fixed one. */
  readonly now?: () => string;
  /** The level of each pattern's heading: 2 on its own page, 3 inside a part with its own h2 (Analysis › Patterns). */
  readonly level?: 2 | 3;
  /** Where focus goes after "Try again" when what loaded has nothing to focus: the heading above the panel. */
  readonly headingId: string;
  /** Bumped by the host to read again (Analysis's refresh); the last patterns stay until the new ones arrive. */
  readonly refreshRevision?: number;
}

type ScreenState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'failed' }> | Readonly<{ kind: 'ready'; result: TradePatternsQueryResult }>;

const wallClock = (): string => new Date().toISOString();
export const PATTERNS_INTRO = {
  real: `Your patterns look back at the trades you closed in the last ${TRADE_PATTERN_PERIOD_DAYS} days and show what repeats. They describe your own past trades only: they never predict a price or tell you what to buy or sell. A trade is won when its result after fees is above zero. A group shows how it went only once it has ${PATTERN_LEAST_TRADES} trades with a result, so a few trades cannot mislead you. In the bars, grey means a trade with no result, or a group without enough trades yet.`,
  practice: `Your practice patterns look back at the practice trades you closed in the last ${TRADE_PATTERN_PERIOD_DAYS} days, replays included, and show what repeats. They describe your own past practice only: they never predict a price or tell you what to buy or sell. A group shows how it went only once it has ${PATTERN_LEAST_TRADES} trades with a result. In the bars, grey means a trade with no result, or a group without enough trades yet. Practice trades never count in your Journal.`,
} as const;
export const PATTERNS_SHORT_INTRO = {
  real: `Your patterns show what repeats in the trades you closed in the last ${TRADE_PATTERN_PERIOD_DAYS} days.`,
  practice: `Your practice patterns show what repeats in the practice trades you closed in the last ${TRADE_PATTERN_PERIOD_DAYS} days.`,
} as const;

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
export function PatternsLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
  return useInRouterContext() ? <Link to={to}>{children}</Link> : <a href={to}>{children}</a>;
}

/** Its length shows how many trades; the browser shares it by the owner's counts. Grey is a trade with no result, or a group without enough trades. */
function PatternBar({ summary, steps }: { readonly summary: PatternTradesSummary; readonly steps: number }) {
  return <span className="kairos-pattern-bar" data-steps={steps} data-enough={summary.enough ? 'true' : 'false'} aria-hidden="true">
    <span style={{ inlineSize: `${(steps / PATTERN_BAR_STEPS) * 100}%` }}>
      {summary.enough ? <>
        <span data-part="won" style={{ flexGrow: summary.won }} />
        <span data-part="even" style={{ flexGrow: summary.breakEven }} />
        <span data-part="lost" style={{ flexGrow: summary.lost }} />
        <span data-part="none" style={{ flexGrow: summary.noResult }} />
      </> : null}
    </span>
  </span>;
}

/** A group's link to the matching trades in the list (Long, Short or a strategy); none for a group the list cannot filter by. */
function GroupListLink({ kind, group, scope }: { readonly kind: TradePatternKind; readonly group: TradePatternGroup; readonly scope: JournalHistoryScope }) {
  const list = describePatternGroupListLink(kind, group, scope);
  return list ? <p><PatternsLink to={list.to}>{list.text}</PatternsLink></p> : null;
}

function PatternCard({ pattern, level, scope }: { readonly pattern: TradePattern; readonly level: 2 | 3; readonly scope: JournalHistoryScope }) {
  const words = describeTradePattern(pattern.kind);
  const titleId = useId();
  const left = describePatternLeftOut(pattern);
  const Heading = level === 2 ? 'h2' : 'h3';
  return <Card as="section" className="kairos-pattern" aria-labelledby={titleId} data-pattern={pattern.kind}>
    <Heading id={titleId}>{words.title}</Heading>
    <p>{words.intro}</p>
    {pattern.groups.length > 0 ? <ul className="kairos-pattern__groups">
      {pattern.groups.map(group => <li key={group.key} data-group={group.key}>
        <p className="kairos-pattern__label">{describePatternGroupLabel(pattern.kind, group)}</p>
        <PatternBar summary={group.summary} steps={group.barSteps} />
        {describePatternSummary(group.summary).map((line, index) => <p key={index}>{line}</p>)}
        <GroupListLink kind={pattern.kind} group={group} scope={scope} />
      </li>)}
    </ul> : null}
    {left ? <p className="kairos-pattern__left-out">{left}</p> : null}
  </Card>;
}

/** P30 "Your patterns": what repeats in the closed trades of the last 90 days, bars before words. It only reads. Shown on
 * its own page and as Analysis › Patterns (D220). */
export function PatternsPanel({ db, scope, now = wallClock, level = 2, headingId, refreshRevision = 0 }: PatternsPanelProps) {
  const overallId = useId();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  // "Try again" after a failed load bumps this, which runs the load effect again.
  const [attempt, setAttempt] = useState(0);
  // "Try again" shows loading; a refresh keeps the last patterns until the new ones arrive (focus never falls to the page).
  const [lastAttempt, setLastAttempt] = useState(attempt);
  if (lastAttempt !== attempt) { setLastAttempt(attempt); setState({ kind: 'loading' }); }
  useEffect(() => {
    let ignore = false;
    loadTradePatterns(db, { now: now(), scope }).then(
      result => { if (!ignore) setState({ kind: 'ready', result }); },
      () => { if (!ignore) setState(current => (current.kind === 'ready' ? current : { kind: 'failed' })); },
    );
    return () => { ignore = true; };
  }, [db, scope, now, attempt, refreshRevision]);
  // "Try again" unmounts its own error box while loading, so focus would fall to the page (WCAG 2.4.3). When it had focus,
  // focus goes to the first link or button of what loaded above the pattern cards (the new "Try again" when it failed again),
  // else the heading above: the cards' group links (D262) sit far down the page, so focus never jumps there.
  // Holds the screen the tap was made on: React may run the effect for that screen after the tap, so only a newer one moves focus.
  const retryHadFocus = useRef<typeof state | null>(null);
  const loaded = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const tapped = retryHadFocus.current;
    if (state.kind === 'loading' || tapped === null || state === tapped) return;
    retryHadFocus.current = null;
    const first = Array.from(loaded.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []).find(item => item.closest('.kairos-patterns__cards') === null);
    (first ?? document.getElementById(headingId))?.focus();
  }, [state]);
  const retry = () => { retryHadFocus.current = document.activeElement?.closest('.kairos-error-state') != null ? state : null; setAttempt(current => current + 1); };

  const practice = scope === 'practice';
  const result = state.kind === 'ready' ? state.result : null;
  const projection = result?.kind === 'ready' ? result.projection : null;
  const homeWords = result?.kind === 'ready' ? describeTotalsInHomeCurrency(result.inHomeCurrency) : null;
  const Heading = level === 2 ? 'h2' : 'h3';
  return (
    <div ref={loaded} className="kairos-patterns__loaded">
    {homeWords ? <p className="kairos-patterns__currency">{homeWords.text} <PatternsLink to="/currency">{homeWords.link}</PatternsLink></p> : null}
    {state.kind === 'loading' ? <Skeleton label="Loading your patterns…" /> : null}
    {state.kind === 'failed' || result?.kind === 'unavailable'
      ? <ErrorState live={false} message="Kairos could not load your patterns. Your trades are not affected." onRetry={retry} /> : null}
    {result?.kind === 'time-zone-unconfigured' ? <p>Your patterns sort your trades by day and hour in your time zone, so they need your time zone first. <PatternsLink to="/settings">Open Settings</PatternsLink></p> : null}
    {projection && projection.overall.tradeCount === 0 ? <p>{practice
      ? `No closed practice trades in the last ${TRADE_PATTERN_PERIOD_DAYS} days yet. Your practice patterns appear here as you close practice trades.`
      : `No closed trades in the last ${TRADE_PATTERN_PERIOD_DAYS} days yet. Your patterns appear here as you close trades.`}</p> : null}
    {projection && projection.overall.tradeCount > 0 ? <div className="kairos-patterns__cards">
      <Card as="section" className="kairos-pattern" aria-labelledby={overallId} data-pattern="overall">
        <Heading id={overallId}>{practice ? 'All your practice trades' : 'All your trades'}</Heading>
        <PatternBar summary={projection.overall} steps={PATTERN_BAR_STEPS} />
        {describePatternSummary(projection.overall).map((line, index) => <p key={index}>{line}</p>)}
      </Card>
      {projection.patterns.map(pattern => <PatternCard key={pattern.kind} pattern={pattern} level={level} scope={scope} />)}
    </div> : null}
    {result?.kind === 'ready' ? <p className="kairos-patterns__zone">Time zone: {result.timeZone}</p> : null}
    </div>
  );
}
