import { useEffect, useId, useState, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import { describeTotalsInHomeCurrency } from '../../application/currency/currencyWords';
import type { JournalHistoryScope } from '../../application/journal';
import { loadTradePatterns, TRADE_PATTERN_PERIOD_DAYS, type TradePatternsQueryResult } from '../../application/patterns/loadTradePatterns';
import { describePatternGroupLabel, describePatternLeftOut, describePatternSummary, describeTradePattern } from '../../application/patterns/patternWords';
import { PATTERN_BAR_STEPS, PATTERN_LEAST_TRADES, type PatternTradesSummary, type TradePattern } from '../../application/patterns/tradePatterns';
import type { KairosDatabase } from '../../data/database';
import { Card } from '../../design-system/primitives';
import './patterns.css';

export interface PatternsScreenProps {
  readonly db: KairosDatabase;
  readonly scope: JournalHistoryScope;
  /** The current instant (UTC ISO); tests inject a fixed one. */
  readonly now?: () => string;
}

type ScreenState = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'failed' }> | Readonly<{ kind: 'ready'; result: TradePatternsQueryResult }>;

const wallClock = (): string => new Date().toISOString();
const INTRO = {
  real: `Your patterns look back at the trades you closed in the last ${TRADE_PATTERN_PERIOD_DAYS} days and show what repeats. They describe your own past trades only: they never predict a price or tell you what to buy or sell. A trade is won when its result after fees is above zero. A group shows how it went only once it has ${PATTERN_LEAST_TRADES} trades with a result, so a few trades cannot mislead you. In the bars, grey means a trade with no result, or a group without enough trades yet.`,
  practice: `Your practice patterns look back at the practice trades you closed in the last ${TRADE_PATTERN_PERIOD_DAYS} days, replays included, and show what repeats. They describe your own past practice only: they never predict a price or tell you what to buy or sell. A group shows how it went only once it has ${PATTERN_LEAST_TRADES} trades with a result. In the bars, grey means a trade with no result, or a group without enough trades yet. Practice trades never count in your Journal.`,
} as const;

/** SPA navigation inside the app, a plain link outside a router (features never import app). */
function PatternsLink({ to, children }: { readonly to: string; readonly children: ReactNode }) {
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

function PatternCard({ pattern }: { readonly pattern: TradePattern }) {
  const words = describeTradePattern(pattern.kind);
  const titleId = useId();
  const left = describePatternLeftOut(pattern);
  return <Card as="section" className="kairos-pattern" aria-labelledby={titleId} data-pattern={pattern.kind}>
    <h2 id={titleId}>{words.title}</h2>
    <p>{words.intro}</p>
    {pattern.groups.length > 0 ? <ul className="kairos-pattern__groups">
      {pattern.groups.map(group => <li key={group.key} data-group={group.key}>
        <p className="kairos-pattern__label">{describePatternGroupLabel(pattern.kind, group)}</p>
        <PatternBar summary={group.summary} steps={group.barSteps} />
        {describePatternSummary(group.summary).map((line, index) => <p key={index}>{line}</p>)}
      </li>)}
    </ul> : null}
    {left ? <p className="kairos-pattern__left-out">{left}</p> : null}
  </Card>;
}

/** P30 "Your patterns": what repeats in the closed trades of the last 90 days, bars before words. It only reads. */
export function PatternsScreen({ db, scope, now = wallClock }: PatternsScreenProps) {
  const overallId = useId();
  const [state, setState] = useState<ScreenState>({ kind: 'loading' });
  useEffect(() => {
    let ignore = false;
    setState({ kind: 'loading' });
    loadTradePatterns(db, { now: now(), scope }).then(
      result => { if (!ignore) setState({ kind: 'ready', result }); },
      () => { if (!ignore) setState({ kind: 'failed' }); },
    );
    return () => { ignore = true; };
  }, [db, scope, now]);

  const practice = scope === 'practice';
  const result = state.kind === 'ready' ? state.result : null;
  const projection = result?.kind === 'ready' ? result.projection : null;
  const homeWords = result?.kind === 'ready' ? describeTotalsInHomeCurrency(result.inHomeCurrency) : null;
  return <section className="kairos-route kairos-patterns" aria-labelledby="kairos-patterns-title">
    <p className="kairos-patterns__eyebrow">{practice ? 'Practice' : 'Your results'}</p>
    <h1 id="kairos-patterns-title" tabIndex={-1}>{practice ? 'Your practice patterns' : 'Your patterns'}</h1>
    <p>{practice ? INTRO.practice : INTRO.real}</p>
    {homeWords ? <p className="kairos-patterns__currency">{homeWords.text} <PatternsLink to="/currency">{homeWords.link}</PatternsLink></p> : null}
    {state.kind === 'loading' ? <p>Loading your patterns…</p> : null}
    {state.kind === 'failed' || result?.kind === 'unavailable' ? <p>Kairos could not load your patterns. Your trades are not affected.</p> : null}
    {result?.kind === 'time-zone-unconfigured' ? <p>Your patterns sort your trades by day and hour in your time zone, so they need your time zone first. <PatternsLink to="/settings">Open Settings</PatternsLink></p> : null}
    {projection && projection.overall.tradeCount === 0 ? <p>{practice
      ? `No closed practice trades in the last ${TRADE_PATTERN_PERIOD_DAYS} days yet. Your practice patterns appear here as you close practice trades.`
      : `No closed trades in the last ${TRADE_PATTERN_PERIOD_DAYS} days yet. Your patterns appear here as you close trades.`}</p> : null}
    {projection && projection.overall.tradeCount > 0 ? <div className="kairos-patterns__cards">
      <Card as="section" className="kairos-pattern" aria-labelledby={overallId} data-pattern="overall">
        <h2 id={overallId}>{practice ? 'All your practice trades' : 'All your trades'}</h2>
        <PatternBar summary={projection.overall} steps={PATTERN_BAR_STEPS} />
        {describePatternSummary(projection.overall).map((line, index) => <p key={index}>{line}</p>)}
      </Card>
      {projection.patterns.map(pattern => <PatternCard key={pattern.kind} pattern={pattern} />)}
    </div> : null}
    {result?.kind === 'ready' ? <p className="kairos-patterns__zone">Time zone: {result.timeZone}</p> : null}
    <p><PatternsLink to={practice ? '/practice' : '/journal'}>{practice ? 'Back to Practice' : 'Back to your Journal'}</PatternsLink></p>
  </section>;
}
