/**
 * P34: Kairos's own fixed list of how big each official release is. Official schedules give a name and a time, never a size, so the
 * size of fetched news is Kairos's rating, always labelled; the trader sizes typed news. Unlisted releases are not saved. The size is
 * read here, never stored.
 */
import type { EconomicEventImpact, EconomicEventRecord } from './economicEvent';
import type { NewsCalendarSourceId } from './newsSources';

interface ReleaseRule {
  readonly source: NewsCalendarSourceId;
  readonly title: RegExp;
  readonly size: EconomicEventImpact;
  readonly plainName: string;
}

const rule = (source: NewsCalendarSourceId, title: RegExp, size: EconomicEventImpact, plainName: string): ReleaseRule =>
  Object.freeze({ source, title, size, plainName });

/** Tested in this order on the source's own title; the first match of that source wins. */
const RULES: readonly ReleaseRule[] = Object.freeze([
  rule('fed', /^FOMC meeting$/i, 'high', 'US interest rate decision'),
  rule('fed', /^FOMC Press Conference$/i, 'high', 'US Fed press conference'),
  rule('fed', /^FOMC Minutes$/i, 'medium', 'US Fed meeting notes (minutes)'),
  rule('fed', /^(Speech|Discussion|Testimony) - Chair(man)? /, 'medium', 'US Fed Chair speaks'),
  rule('fed', /^Beige Book$/, 'medium', 'US Fed economy report (Beige Book)'),
  rule('bls', /^Employment Situation$/, 'high', 'US jobs report'),
  rule('bls', /^Consumer Price Index$/, 'high', 'US inflation (CPI)'),
  rule('bls', /^Producer Price Index$/, 'medium', 'US producer prices (PPI)'),
  rule('bls', /^Job Openings and Labor Turnover Survey$/, 'medium', 'US job openings'),
  rule('bls', /^Employment Cost Index$/, 'medium', 'US wage costs'),
  rule('bea', /^(GDP|Gross Domestic Product)\b.*\(Advance Estimate\)/, 'high', 'US growth (GDP), first estimate'),
  rule('bea', /^Personal Income and Outlays\b/, 'high', 'US spending and PCE inflation'),
  rule('bea', /^(GDP|Gross Domestic Product)\b.*\((Second|Third) Estimate\)/, 'medium', 'US growth (GDP), update'),
  rule('bea', /^U\.S\. International Trade in Goods and Services\b/, 'medium', 'US trade balance'),
  rule('census', /^Advance Monthly Sales for Retail and Food Services$/, 'high', 'US retail sales'),
  rule('census', /^Advance Report on Durable Goods\b/, 'medium', 'US durable goods orders'),
  rule('census', /^New Residential Construction\b/, 'medium', 'US housing starts'),
  rule('ecb', /^Governing Council of the ECB: monetary policy meeting\b.*\(Day 2\)/, 'high', 'Euro interest rate decision'),
  rule('eurostat', /^Flash estimate inflation euro area$/, 'high', 'Euro area inflation, first estimate'),
  rule('eurostat', /^Preliminary flash estimate GDP - EU and euro area$/, 'medium', 'Euro area growth (GDP), first estimate'),
  rule('eurostat', /^Unemployment$/, 'medium', 'Euro area unemployment'),
  rule('eurostat', /^Inflation \(HICP\)$/, 'low', 'Euro area inflation, final'),
  rule('eurostat', /^Retail trade$/, 'low', 'Euro area retail sales'),
  rule('ons', /^Consumer price inflation, UK: [A-Z][a-z]+ \d{4}$/, 'high', 'UK inflation (CPI)'),
  rule('ons', /^UK Labour Market: [A-Z][a-z]+ \d{4}$/, 'high', 'UK jobs report'),
  rule('ons', /^GDP first quarterly estimate, UK: [A-Za-z ]+ \d{4}$/, 'medium', 'UK growth (GDP), first estimate'),
  rule('ons', /^GDP monthly estimate, UK: [A-Z][a-z]+ \d{4}$/, 'medium', 'UK growth (GDP), monthly'),
  rule('ons', /^Retail sales, Great Britain: [A-Z][a-z]+ \d{4}$/, 'medium', 'UK retail sales'),
  rule('boc', /^Interest Rate Announcement\b/, 'high', 'Canada interest rate decision'),
  rule('boc', /^Publication: Summary of Deliberations$/, 'low', 'Bank of Canada meeting notes'),
  rule('rba', /^Monetary Policy Board$/, 'high', 'Australia interest rate decision'),
]);

/** Kairos's size and plain name for one official release; null when the release is not on the list. */
export function rateOfficialRelease(
  source: NewsCalendarSourceId,
  title: string,
): Readonly<{ size: EconomicEventImpact; plainName: string }> | null {
  const found = RULES.find((candidate) => candidate.source === source && candidate.title.test(title));
  return found === undefined ? null : Object.freeze({ size: found.size, plainName: found.plainName });
}

/** How big a saved event is, and who said so: the trader for typed news, Kairos's list for fetched news. */
export function economicEventSize(
  event: EconomicEventRecord,
): Readonly<{ size: EconomicEventImpact | null; ratedBy: 'you' | 'kairos' }> {
  if (event.source === 'typed') return Object.freeze({ size: event.impact, ratedBy: 'you' as const });
  return Object.freeze({ size: rateOfficialRelease(event.source, event.title)?.size ?? null, ratedBy: 'kairos' as const });
}

/** The name shown: the trader's own for typed news; Kairos's plain name for a listed release, else the source's title. */
export function economicEventName(event: EconomicEventRecord): string {
  if (event.source === 'typed') return event.title;
  return rateOfficialRelease(event.source, event.title)?.plainName ?? event.title;
}
