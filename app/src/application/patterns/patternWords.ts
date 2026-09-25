/**
 * P30: the plain words of the patterns. Every number is shown exactly as its owner gives it; nothing is worked out here except which sentence to use. The words describe past trades and never predict or advise.
 */

import { PATTERN_LEAST_TRADES, type PatternTradesSummary, type TradePattern, type TradePatternGroup, type TradePatternKind } from './tradePatterns';

const trades = (count: number) => (count === 1 ? '1 trade' : `${count} trades`);

const PATTERN_WORDS: Readonly<Record<TradePatternKind, Readonly<{ title: string; intro: string }>>> = Object.freeze({
  plan: Object.freeze({ title: 'Keeping your plan', intro: "Trades where you kept your stop, your planned size and your strategy's rules, next to trades where you did not." }),
  'after-result': Object.freeze({ title: 'After a win or a loss', intro: 'How your next trade went after a win or a loss. Kairos looks at the last trade you closed before you opened each one.' }),
  strategy: Object.freeze({ title: 'By strategy', intro: 'Your trades by the strategy you named on them.' }),
  weekday: Object.freeze({ title: 'By day of the week', intro: 'By the day you opened each trade, in your time zone.' }),
  'time-of-day': Object.freeze({ title: 'By time of day', intro: 'By the hour you opened each trade, in your time zone.' }),
  direction: Object.freeze({ title: 'Long or short', intro: 'Trades where you bought first, next to trades where you sold first.' }),
});

export function describeTradePattern(kind: TradePatternKind): Readonly<{ title: string; intro: string }> {
  return PATTERN_WORDS[kind];
}

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'] as const;
const HOUR_BLOCKS = ['Night (00:00 to 03:59)', 'Early morning (04:00 to 07:59)', 'Morning (08:00 to 11:59)', 'Afternoon (12:00 to 15:59)', 'Evening (16:00 to 19:59)', 'Late evening (20:00 to 23:59)'] as const;
const FIXED_LABELS: Readonly<Record<string, string>> = Object.freeze({
  kept: 'You kept your plan',
  broken: 'You went against your plan',
  'after-win': 'After a win',
  'after-loss': 'After a loss',
  'no-strategy': 'No strategy named',
  long: 'Long (you bought first)',
  short: 'Short (you sold first)',
});

export function describePatternGroupLabel(_kind: TradePatternKind, group: TradePatternGroup): string {
  const { key } = group;
  if (key.startsWith('strategy:')) return group.name ?? 'A strategy';
  const fixed = Object.hasOwn(FIXED_LABELS, key) ? FIXED_LABELS[key] : undefined;
  if (fixed !== undefined) return fixed;
  const weekday = /^weekday:(\d)$/.exec(key);
  if (weekday) return WEEKDAYS[Number.parseInt(weekday[1]!, 10)] ?? key;
  const hours = /^hours:(\d)$/.exec(key);
  if (hours) return HOUR_BLOCKS[Number.parseInt(hours[1]!, 10)] ?? key;
  return key;
}

const WHY_NOT_SHOWN: Readonly<Record<string, string>> = Object.freeze({
  'mixed-currencies': 'the trades are in different currencies',
  'missing-currency-evidence': 'a trade has no currency',
  'unavailable-trade-outcome': 'a trade has no result yet',
});

export function describePatternSummary(summary: PatternTradesSummary): readonly string[] {
  if (summary.tradeCount === 0) return Object.freeze(['No trades.']);
  const first = summary.noResult > 0 ? `${trades(summary.tradeCount)}, ${summary.noResult} with no result.` : `${trades(summary.tradeCount)}.`;
  if (!summary.enough) return Object.freeze([first, `Not enough trades with a result yet (${summary.resultCount} of ${PATTERN_LEAST_TRADES}).`]);
  const counts = `Won ${summary.won}, lost ${summary.lost}${summary.breakEven > 0 ? `, break-even ${summary.breakEven}` : ''}: ${summary.wonPercent}% won.`;
  const total = summary.total;
  const totalLine = total?.available
    ? `Result after fees: ${total.total} ${total.currency}.`
    : `Result after fees: not shown, because ${(total ? WHY_NOT_SHOWN[total.reason] : undefined) ?? 'it could not be worked out'}.`;
  return Object.freeze([first, counts, totalLine]);
}

export function describePatternLeftOut(pattern: TradePattern): string | null {
  const n = pattern.unplaced;
  if (n === 0) return null;
  switch (pattern.kind) {
    case 'plan': return `Left out: ${trades(n)} with nothing planned to compare.`;
    case 'after-result': return `Left out: ${trades(n)} with no trade before it in these 90 days, or whose trade before broke even or has no result.`;
    case 'weekday':
    case 'time-of-day': return `Left out: ${trades(n)} with no clear opening time.`;
    default: return null;
  }
}
