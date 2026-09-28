import { useId } from 'react';
import { describeHeadlineFailures, describeHeadlineMeta, describeHeadlinesUnavailable } from '../../application/economic-calendar/calendarWords';
import type { SavedNewsHeadline, SavedNewsHeadlines } from '../../application/economic-calendar/newsHeadlines';
import type { KairosApiFailure } from '../../application/online/onlineWords';
import { isAllowedNewsLink } from '../../domain/economic-calendar/newsSources';
import { Card } from '../../design-system/primitives';

export interface NewsHeadlinesCardProps {
  readonly headlines: SavedNewsHeadlines;
  readonly timeZone: string;
  /** The failure of the last headline refresh that got none; null otherwise. */
  readonly failure: KairosApiFailure | null;
}

const MAX_SHOWN = 10;
const newest = (items: readonly SavedNewsHeadline[]) => [...items].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, MAX_SHOWN);

function HeadlineList({ items, timeZone, labelledBy }: { readonly items: readonly SavedNewsHeadline[]; readonly timeZone: string; readonly labelledBy: string }) {
  return <ul className="kairos-news-headlines__list" aria-labelledby={labelledBy}>
    {items.map((item) => <li key={`${item.source}:${item.url}`}>
      {isAllowedNewsLink(item.source, item.url)
        ? <a href={item.url} target="_blank" rel="noopener noreferrer">{item.title}</a>
        : <span>{item.title}</span>}
      <p>{describeHeadlineMeta(item, timeZone)}</p>
    </li>)}
  </ul>;
}

/** P34: "Latest news": official press releases and Yahoo Finance's headlines, as plain text with a link; kept on this device only. */
export function NewsHeadlinesCard({ headlines, timeZone, failure }: NewsHeadlinesCardProps) {
  const headingId = useId();
  const officialId = useId();
  const yahooId = useId();
  const official = newest(headlines.items.filter((item) => item.source !== 'yahoo'));
  const yahoo = newest(headlines.items.filter((item) => item.source === 'yahoo'));
  return <Card as="section" className="kairos-news-calendar-card kairos-news-headlines" aria-labelledby={headingId}>
    <h2 id={headingId}>Latest news</h2>
    {official.length === 0 && yahoo.length === 0 ? <p>No headlines saved yet.</p> : <>
      {official.length === 0 ? null : <>
        <h3 id={officialId}>From central banks and statistics offices</h3>
        <HeadlineList items={official} timeZone={timeZone} labelledBy={officialId} />
      </>}
      {yahoo.length === 0 ? null : <>
        <h3 id={yahooId}>From Yahoo Finance</h3>
        <HeadlineList items={yahoo} timeZone={timeZone} labelledBy={yahooId} />
        <p>Headlines from <a href="https://finance.yahoo.com/" target="_blank" rel="noopener noreferrer">Yahoo Finance</a>, shown as Yahoo sends them.</p>
      </>}
    </>}
    {failure !== null
      ? <p>{describeHeadlinesUnavailable(failure)}</p>
      : headlines.failedSources.length > 0 ? <p>{describeHeadlineFailures(headlines.failedSources)}</p> : null}
  </Card>;
}
