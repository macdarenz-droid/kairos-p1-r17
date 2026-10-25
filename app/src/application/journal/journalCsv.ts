import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import type { TradeDisciplineRecord } from '../../domain/discipline';
import type { MarketType, TradeSource, TradeStatus } from '../../domain/trades';
import { readDisciplineLists } from '../discipline/disciplineListsPreference';
import { loadTradeDiscipline } from '../discipline/tradeDiscipline';
import { readStrategies } from '../discipline/strategies';
import { projectTradeTimesRisked } from '../performance/tradeRisk';
import { latestTradePlan } from '../trade-visualizer/tradeVisualizerFacts';
import { projectVisualPnlClockTime, projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import { listAllJournalMatches, type JournalHistoryEntry, type JournalHistoryScope } from './historyQuery';
import type { JournalFilters } from './journalFilters';

/** U15 (D266): the spreadsheet's columns, in order. */
export const JOURNAL_CSV_COLUMNS = Object.freeze([
  'Opened', 'Closed', 'Time zone',
  'Symbol', 'Market', 'Direction', 'Status', 'Made by',
  'Quantity', 'Average entry', 'Average exit', 'Price currency',
  'Planned stop', 'Planned target',
  'Result before fees', 'Fees', 'Fees currency', 'Result after fees', 'Result currency', '× what you risked',
  'Strategy', 'Mistakes', 'Tags', 'Where you traded', 'Leverage', "Why I'm taking it", 'Note',
] as const);

const MARKET: Readonly<Record<MarketType, string>> = { stock: 'Stocks', forex: 'Forex', crypto: 'Crypto', futures: 'Futures', options: 'Options', other: 'Other' };
const STATUS: Readonly<Record<TradeStatus, string>> = { draft: 'Planned', open: 'Open', closed: 'Closed', cancelled: 'Cancelled' };
const MADE_BY: Readonly<Record<TradeSource, string>> = { manual: 'By hand', paper: 'By hand', replay: 'Replay', import: 'Import', 'broker-import': 'Import' };

/** A cell: a number is the stored decimal text, never changed; text is checked for formulas. Null is blank. */
type Cell = Readonly<{ number: string | null }> | Readonly<{ text: string | null }>;
const number = (value: string | null | undefined): Cell => ({ number: value ?? null });
const text = (value: string | null | undefined): Cell => ({ text: value === undefined || value === null || value === '' ? null : value });

/** A text a spreadsheet would run as a formula starts with one of these: it gets a leading ' (D266). */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One cell as RFC 4180 writes it: quoted when it holds a comma, a quote or a line break; quotes doubled. */
function writeCell(cell: Cell): string {
  const raw = 'number' in cell ? cell.number ?? '' : cell.text === null ? '' : FORMULA_START.test(cell.text) ? `'${cell.text}` : cell.text;
  return /[",\r\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

/** A stored time as "YYYY-MM-DD HH:mm" in the time zone; blank when there is none, the stored text when unreadable. */
function timeIn(value: string | null, timeZone: string): string | null {
  if (value === null) return null;
  const day = projectVisualPnlDayKey(value, timeZone);
  const clock = projectVisualPnlClockTime(value, timeZone);
  return day.available && clock !== null ? `${day.dayKey} ${clock}` : value;
}

export interface JournalCsvOptions {
  readonly timeZone: string;
  readonly scope: JournalHistoryScope;
  /** Each trade's checklist and review record, by trade id. */
  readonly discipline: ReadonlyMap<string, TradeDisciplineRecord>;
  /** Today's names of the strategies and mistakes, by id; a record's own copy is used when one is gone. */
  readonly strategyNames: ReadonlyMap<string, string>;
  readonly mistakeNames: ReadonlyMap<string, string>;
}

function row(entry: JournalHistoryEntry, options: JournalCsvOptions): readonly Cell[] {
  const { trade, metrics, visualPnl } = entry;
  const plan = latestTradePlan(entry.plans);
  const record = options.discipline.get(trade.id) ?? null;
  const entered = entry.executions.some(execution => execution.type === 'entry');
  const times = projectTradeTimesRisked(entry);
  const strategy = record?.strategy === undefined ? null : options.strategyNames.get(record.strategy.strategyId) ?? record.strategy.name;
  const mistakes = (record?.mistakes ?? []).map(mark => options.mistakeNames.get(mark.itemId) ?? mark.label);
  return [
    text(timeIn(trade.openedAt, options.timeZone)), text(timeIn(trade.closedAt, options.timeZone)), text(options.timeZone),
    text(trade.symbol), text(MARKET[trade.marketType]), text(trade.side === 'long' ? 'Long' : 'Short'), text(STATUS[trade.status]), text(MADE_BY[trade.source]),
    // No entry yet: no quantity, never 0.
    number(entered ? metrics?.totalEnteredQuantity : null), number(metrics?.averageEntryPrice), number(metrics?.averageExitPrice), text(trade.grossPnlCurrency),
    number(plan?.plannedStopPrice), number(plan?.plannedTargetPrice),
    // No fee written down is blank, never 0.
    number(metrics?.grossPnl), number(entry.fees.length === 0 ? null : metrics?.totalFees), text(entry.fees.length === 0 ? null : metrics?.totalFeesCurrency), number(visualPnl.outcome === 'unavailable' ? null : visualPnl.amount), text(visualPnl.outcome === 'unavailable' ? null : visualPnl.currency),
    number(times.available ? times.value : null),
    text(strategy), text(mistakes.join('; ')), text((trade.tags ?? []).join(', ')), text(trade.exchange), number(trade.leverage), text(plan?.reason), text(trade.note),
  ];
}

/**
 * U15 (D266): the list as a spreadsheet: one row per trade, the D266 columns. Missing is blank, never 0; numbers are the
 * stored text (no separators, never rounded); times are "YYYY-MM-DD HH:mm" in the trader's time zone, named in its own
 * column. A text cell a spreadsheet would run as a formula gets a leading '; numbers never do. RFC 4180 quoting, UTF-8
 * with a byte-order mark for Excel, CRLF line ends.
 */
export function buildJournalCsv(entries: readonly JournalHistoryEntry[], options: JournalCsvOptions): string {
  const lines = [JOURNAL_CSV_COLUMNS.map(column => writeCell(text(column))).join(','), ...entries.map(entry => row(entry, options).map(writeCell).join(','))];
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** `kairos-journal-YYYY-MM-DD.csv`, or `kairos-practice-…` for Practice; `today` is the day in the trader's time zone. */
export function journalCsvFileName(scope: JournalHistoryScope, today: string): string {
  return `kairos-${scope === 'practice' ? 'practice' : 'journal'}-${today}.csv`;
}

export interface JournalCsvFile { readonly fileName: string; readonly text: string; readonly trades: number }

/**
 * Every trade matching the filters (the list's query, no page limit), with their checklist and review records and
 * today's strategy and mistake names, as the spreadsheet file. A storage failure rejects.
 */
export async function loadJournalCsv(
  db: KairosDatabase, options: Readonly<{ scope: JournalHistoryScope; filters: JournalFilters; timeZone: string; now: string }>,
): Promise<JournalCsvFile> {
  const entries = await listAllJournalMatches(db, { scope: options.scope, filters: options.filters, timeZone: options.timeZone });
  const repositories = createKairosRepositories(db);
  // The one checklist-and-review read (D8): a damaged record is left out, never a failed file.
  const [discipline, strategies, lists] = await Promise.all([
    loadTradeDiscipline(db, entries.map(entry => entry.trade.id)),
    readStrategies(repositories.metadata),
    readDisciplineLists(repositories.metadata),
  ]);
  if (!discipline.ok) throw new Error('The trades\' checklists and reviews could not be read.');
  const today = projectVisualPnlDayKey(options.now, options.timeZone);
  return Object.freeze({
    fileName: journalCsvFileName(options.scope, today.available ? today.dayKey : options.now.slice(0, 10)),
    text: buildJournalCsv(entries, {
      timeZone: options.timeZone,
      scope: options.scope,
      discipline: new Map([...discipline.records].map(([id, record]) => [id as string, record])),
      strategyNames: new Map(strategies.map(strategy => [strategy.id, strategy.name])),
      mistakeNames: new Map(lists.mistakes.map(item => [item.id as string, item.label])),
    }),
    trades: entries.length,
  });
}
