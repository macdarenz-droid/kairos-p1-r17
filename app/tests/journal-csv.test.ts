import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveTradeDiscipline } from '../src/application/discipline';
import { saveStrategy } from '../src/application/discipline/strategies';
import {
  buildJournalCsv, getJournalHistoryEntry, JOURNAL_CSV_COLUMNS, journalCsvFileName, loadJournalCsv, NO_JOURNAL_FILTERS, readJournalFilters,
  type JournalCsvOptions, type JournalHistoryEntry, type JournalHistoryScope,
} from '../src/application/journal';
import { projectTradeTimesRisked } from '../src/application/performance/tradeRisk';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade, saveTradeNote, tradeRevision, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { TradeDisciplineRecord } from '../src/domain/discipline';
import type { TradeId } from '../src/domain/trades';

const NOW = '2026-04-20T12:00:00.000Z';
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-journal-csv-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}

const BOM = '﻿';
/** The product contract: the spreadsheet's header line, exactly (D266). */
const HEADER = 'Opened,Closed,Time zone,Symbol,Market,Direction,Status,Made by,Quantity,Average entry,Average exit,Price currency,Planned stop,Planned target,Result before fees,Fees,Fees currency,Result after fees,Result currency,× what you risked,Strategy,Mistakes,Tags,Where you traded,Leverage,Why I\'m taking it,Note';

/** A small RFC 4180 reader: the BOM is stripped first; a quoted cell may hold commas, line breaks and doubled quotes. */
function parseCsv(file: string): string[][] {
  const text = file.startsWith(BOM) ? file.slice(1) : file;
  const rows: string[][] = [];
  let cells: string[] = [];
  let cell = '';
  let quoted = false;
  let started = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]!;
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === '') { quoted = true; started = true; }
    else if (char === ',') { cells.push(cell); cell = ''; started = true; }
    else if (char === '\r' && text[index + 1] === '\n') { cells.push(cell); rows.push(cells); cells = []; cell = ''; started = false; index += 1; }
    else { cell += char; started = true; }
  }
  if (started || cell !== '') { cells.push(cell); rows.push(cells); }
  return rows;
}

type Row = Readonly<Record<(typeof JOURNAL_CSV_COLUMNS)[number], string>>;
/** The data rows, each by column name. */
function table(file: string): Row[] {
  const [header, ...rows] = parseCsv(file);
  expect(header).toEqual([...JOURNAL_CSV_COLUMNS]);
  return rows.map(cells => {
    expect(cells).toHaveLength(JOURNAL_CSV_COLUMNS.length);
    return Object.fromEntries(JOURNAL_CSV_COLUMNS.map((column, index) => [column, cells[index]!])) as Row;
  });
}
const rowFor = (rows: readonly Row[], symbol: string): Row => {
  const found = rows.filter(row => row.Symbol === symbol);
  expect(found, `one row for ${symbol}`).toHaveLength(1);
  return found[0]!;
};

type TradeInput = SaveManualTradeInput;
async function save(db: KairosDatabase, input: TradeInput, scope: JournalHistoryScope = 'real', source: 'paper' | 'replay' = 'paper'): Promise<TradeId> {
  const saved = scope === 'practice' ? await savePracticeTrade(db, { ...input, source }, { now: () => NOW }) : await saveManualTrade(db, input, { now: () => NOW });
  if (!saved.ok) throw new Error(`fixture ${input.symbol}: ${JSON.stringify(saved)}`);
  return saved.tradeId as TradeId;
}
const hourAfter = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString();
/** A closed one-unit trade: it made (exit - entry) for a long. */
function closed(symbol: string, openedAt: string, entry: string, exit: string, extra: Partial<TradeInput> = {}): TradeInput {
  const closedAt = hourAfter(openedAt);
  return {
    symbol, marketType: 'crypto', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: 'USDT',
    executions: [{ type: 'entry', price: entry, quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
    ...extra,
  };
}
async function entryOf(db: KairosDatabase, id: TradeId): Promise<JournalHistoryEntry> {
  const entry = await getJournalHistoryEntry(db, id);
  if (entry === null) throw new Error('fixture: trade missing');
  return entry;
}
async function note(db: KairosDatabase, id: TradeId, text: string, scope: JournalHistoryScope = 'real'): Promise<void> {
  const saved = await saveTradeNote(db, { tradeId: id, expectedRevision: tradeRevision(await entryOf(db, id)), note: text, scope }, { now: () => NOW });
  if (!saved.ok) throw new Error(`fixture note: ${JSON.stringify(saved)}`);
}
async function options(db: KairosDatabase, ids: readonly TradeId[], over: Partial<JournalCsvOptions> = {}): Promise<JournalCsvOptions> {
  const records = await db.tradeDiscipline.toArray() as TradeDisciplineRecord[];
  const wanted = new Set<string>(ids);
  return { timeZone: 'UTC', scope: 'real', discipline: new Map(records.filter(record => wanted.has(record.tradeId)).map(record => [record.tradeId as string, record])), strategyNames: new Map(), mistakeNames: new Map(), ...over };
}
async function csv(db: KairosDatabase, ids: readonly TradeId[], over: Partial<JournalCsvOptions> = {}): Promise<string> {
  const entries = await Promise.all(ids.map(id => entryOf(db, id)));
  return buildJournalCsv(entries, await options(db, ids, over));
}

describe('U15 the Journal spreadsheet (D266)', () => {
  it('starts with the byte-order mark and the exact header, and ends every line with CRLF', async () => {
    const db = await database();
    const id = await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '110'));
    const file = await csv(db, [id]);
    expect(file.startsWith(`${BOM}${HEADER}\r\n`)).toBe(true);
    expect(JOURNAL_CSV_COLUMNS.join(',')).toBe(HEADER);
    expect(JOURNAL_CSV_COLUMNS).toHaveLength(27);
    expect(file.endsWith('\r\n')).toBe(true);
    // Every line break is CRLF: no bare LF or CR outside a quoted cell (this trade has no quoted cell).
    expect(file.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
    expect(file.split('\r\n')).toHaveLength(3); // header, one trade, and the empty rest after the last CRLF
    expect(parseCsv(file)).toHaveLength(2);
    // A list with no trade is the header alone, still ended by CRLF.
    expect(buildJournalCsv([], await options(db, []))).toBe(`${BOM}${HEADER}\r\n`);
  });

  it('writes a closed trade with every column from the stored text, nothing rounded and no separators', async () => {
    const db = await database();
    const id = await save(db, {
      symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT',
      openedAt: '2026-04-02T09:15:00.000Z', closedAt: '2026-04-02T10:45:00.000Z',
      plan: { plannedEntryPrice: '64000.5', plannedStopPrice: '63500.5', plannedTargetPrice: '65000.75', plannedQuantity: '0.12345678', reason: 'Retest of the breakout' },
      executions: [
        { type: 'entry', price: '64000.5', quantity: '0.12345678', executedAt: '2026-04-02T09:15:00.000Z' },
        { type: 'exit', price: '64100.25', quantity: '0.12345678', executedAt: '2026-04-02T10:45:00.000Z' },
      ],
      fees: [{ amount: '0.5', currency: 'USDT' }],
      tags: ['Breakout', 'A setup'], exchange: 'Binance', leverage: '10',
    });
    await note(db, id, 'Waited for the close.');
    const strategy = await saveStrategy(db, { id: null, name: 'Breakout', rules: [{ id: 'stop', kind: 'stop-planned' }] });
    if (!strategy.ok) throw new Error('fixture strategy');
    expect((await saveTradeDiscipline(db, { tradeId: id, scope: 'real', half: 'strategy', strategyId: strategy.strategy.id, answers: [] })).ok).toBe(true);
    expect((await saveTradeDiscipline(db, { tradeId: id, scope: 'real', half: 'review', answers: [], mistakeIds: ['moved-stop', 'oversized'], note: '' })).ok).toBe(true);

    const timesRisked = projectTradeTimesRisked(await entryOf(db, id));
    if (!timesRisked.available) throw new Error('fixture: the risk needs a plan stop');
    const file = await csv(db, [id], { strategyNames: new Map([[strategy.strategy.id, 'Breakout']]), mistakeNames: new Map([['moved-stop', 'Moved my stop'], ['oversized', 'Trade was too big']]) });
    const [row] = table(file);
    expect(row).toEqual({
      Opened: '2026-04-02 09:15', Closed: '2026-04-02 10:45', 'Time zone': 'UTC',
      Symbol: 'BTCUSDT', Market: 'Crypto', Direction: 'Long', Status: 'Closed', 'Made by': 'By hand',
      Quantity: '0.12345678', 'Average entry': '64000.5', 'Average exit': '64100.25', 'Price currency': 'USDT',
      'Planned stop': '63500.5', 'Planned target': '65000.75',
      // (64100.25 - 64000.5) x 0.12345678 = 12.314813805; less the fee of 0.5.
      'Result before fees': '12.314813805', Fees: '0.5', 'Fees currency': 'USDT', 'Result after fees': '11.814813805', 'Result currency': 'USDT',
      '× what you risked': timesRisked.value,
      Strategy: 'Breakout', Mistakes: 'Moved my stop; Trade was too big', Tags: 'Breakout, A setup', 'Where you traded': 'Binance', Leverage: '10',
      "Why I'm taking it": 'Retest of the breakout', Note: 'Waited for the close.',
    });
    // Money is the stored text: no thousands separators anywhere in the numbers.
    for (const column of ['Quantity', 'Average entry', 'Average exit', 'Planned stop', 'Planned target', 'Result before fees', 'Fees', 'Result after fees', 'Leverage'] as const) {
      expect(row![column], column).toMatch(/^-?\d+(\.\d+)?$/);
    }
    // The times-risked cell is the performance owner's number (11.814813805 over a risk of 0.12345678 x 500), a plain number too.
    expect(row!['× what you risked']).toMatch(/^0\.19\d*$/);
    // The tags cell holds a comma, so the raw text quotes it.
    expect(file).toContain(',"Breakout, A setup",');
  });

  it('writes an open trade and a planned trade with blanks, never 0, where nothing is known', async () => {
    const db = await database();
    const open = await save(db, {
      symbol: 'ETHUSDT', marketType: 'crypto', side: 'short', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-04-02T09:00:00.000Z',
      executions: [{ type: 'entry', price: '3000.5', quantity: '2', executedAt: '2026-04-02T09:00:00.000Z' }],
    });
    const planned = await save(db, {
      symbol: 'SOLUSDT', marketType: 'crypto', side: 'long', status: 'draft', grossPnlCurrency: 'USDT',
      plan: { plannedEntryPrice: '150.25', plannedStopPrice: '140', plannedTargetPrice: '180.5', plannedQuantity: '3' },
    });
    const rows = table(await csv(db, [open, planned]));
    expect(rows).toHaveLength(2);

    // No fee recorded: Fees and its currency are blank, never 0.
    expect(rowFor(rows, 'ETHUSDT')).toEqual({
      Opened: '2026-04-02 09:00', Closed: '', 'Time zone': 'UTC',
      Symbol: 'ETHUSDT', Market: 'Crypto', Direction: 'Short', Status: 'Open', 'Made by': 'By hand',
      Quantity: '2', 'Average entry': '3000.5', 'Average exit': '', 'Price currency': 'USDT',
      'Planned stop': '', 'Planned target': '',
      'Result before fees': '', Fees: '', 'Fees currency': '', 'Result after fees': '', 'Result currency': '', '× what you risked': '',
      Strategy: '', Mistakes: '', Tags: '', 'Where you traded': '', Leverage: '', "Why I'm taking it": '', Note: '',
    });

    expect(rowFor(rows, 'SOLUSDT')).toEqual({
      Opened: '', Closed: '', 'Time zone': 'UTC',
      Symbol: 'SOLUSDT', Market: 'Crypto', Direction: 'Long', Status: 'Planned', 'Made by': 'By hand',
      Quantity: '', 'Average entry': '', 'Average exit': '', 'Price currency': 'USDT',
      'Planned stop': '140', 'Planned target': '180.5',
      'Result before fees': '', Fees: '', 'Fees currency': '', 'Result after fees': '', 'Result currency': '', '× what you risked': '',
      Strategy: '', Mistakes: '', Tags: '', 'Where you traded': '', Leverage: '', "Why I'm taking it": '', Note: '',
    });
    // A trade nobody has filled has no quantity, price or result: none of them is written as 0.
    for (const symbol of ['ETHUSDT', 'SOLUSDT']) {
      const row = rowFor(rows, symbol);
      for (const column of ['Average exit', 'Result before fees', 'Result after fees', 'Result currency', '× what you risked'] as const) expect(row[column], `${symbol} ${column}`).toBe('');
    }
    expect(rowFor(rows, 'SOLUSDT').Quantity).toBe('');
    expect(rowFor(rows, 'SOLUSDT')['Average entry']).toBe('');
  });

  it('shows the times in the trader\'s time zone and names the zone in its own column', async () => {
    const db = await database();
    const id = await save(db, closed('BTCUSDT', '2026-03-31T23:30:00.000Z', '100', '110', { closedAt: '2026-04-01T01:15:00.000Z' }));
    const manila = table(await csv(db, [id], { timeZone: 'Asia/Manila' }))[0]!;
    expect(manila.Opened).toBe('2026-04-01 07:30');
    expect(manila.Closed).toBe('2026-04-01 09:15');
    expect(manila['Time zone']).toBe('Asia/Manila');
    const utc = table(await csv(db, [id], { timeZone: 'UTC' }))[0]!;
    expect(utc.Opened).toBe('2026-03-31 23:30');
    expect(utc.Closed).toBe('2026-04-01 01:15');
    expect(utc['Time zone']).toBe('UTC');
    // Midnight is 00:00, not 24:00.
    const midnight = await save(db, closed('ETHUSDT', '2026-04-01T16:00:00.000Z', '100', '90'));
    expect(table(await csv(db, [midnight], { timeZone: 'Asia/Manila' }))[0]!.Opened).toBe('2026-04-02 00:00');
  });

  it('quotes a cell with a comma, a quote or a line break, doubling the quotes, and reads back whole', async () => {
    const db = await database();
    const id = await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '110'));
    const text = 'Entered early, said "wait" and\nthen did not.';
    await note(db, id, text);
    const file = await csv(db, [id]);
    expect(file).toContain('"Entered early, said ""wait"" and\nthen did not."');
    // The reader sees one row of 27 cells, with the note whole.
    const parsed = parseCsv(file);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toHaveLength(27);
    expect(parsed[1]![26]).toBe(text);
    // The line break inside the note did not become a row end: the file's own line ends are the only CRLFs.
    expect(file.split('\r\n')).toHaveLength(3);
    // A carriage return and line feed inside a cell are quoted as well.
    const [entry] = await Promise.all([entryOf(db, id)]);
    const crlf = buildJournalCsv([{ ...entry!, trade: { ...entry!.trade, note: 'one\r\ntwo' } }], await options(db, [id]));
    expect(parseCsv(crlf)[1]![26]).toBe('one\r\ntwo');
    expect(crlf).toContain('"one\r\ntwo"');
  });

  it('puts a leading apostrophe before a text a spreadsheet would run as a formula, never before a number', async () => {
    const db = await database();
    const formulas = await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '110', { tags: ['-fade'], exchange: '+Binance' }));
    await note(db, formulas, '=SUM(A1)');
    const at = await save(db, closed('ETHUSDT', '2026-04-03T09:00:00.000Z', '100', '110', { tags: ['@desk'], exchange: '@desk' }));
    const lost = await save(db, closed('SOLUSDT', '2026-04-04T09:00:00.000Z', '100', '90', { fees: [{ amount: '1', currency: 'USDT' }] }));
    const file = await csv(db, [formulas, at, lost]);
    const rows = table(file);

    const first = rowFor(rows, 'BTCUSDT');
    expect(first.Note).toBe("'=SUM(A1)");
    expect(first.Tags).toBe("'-fade");
    expect(first['Where you traded']).toBe("'+Binance");
    expect(rowFor(rows, 'ETHUSDT').Tags).toBe("'@desk");
    expect(rowFor(rows, 'ETHUSDT')['Where you traded']).toBe("'@desk");

    // A losing trade: the numbers keep their minus sign and get no apostrophe.
    const loss = rowFor(rows, 'SOLUSDT');
    expect(loss['Result before fees']).toBe('-10');
    expect(loss['Result after fees']).toBe('-11');
    expect(file).toContain(',-10,1,USDT,-11,USDT,');
    expect(file).not.toContain("'-10");
    expect(file).not.toContain("'-11");

    // A tab or a carriage return first, and the other text starts: all are made safe. (A saved note is trimmed, so these go in directly.)
    const [entry] = [await entryOf(db, formulas)];
    for (const [value, expected] of [['\tindented', "'\tindented"], ['\rreturn', "'\rreturn"], ['+1 more', "'+1 more"], ['-5%', "'-5%"], ['@here', "'@here"], ['=1+1', "'=1+1"]] as const) {
      const built = buildJournalCsv([{ ...entry!, trade: { ...entry!.trade, note: value } }], await options(db, [formulas]));
      expect(parseCsv(built)[1]![26], JSON.stringify(value)).toBe(expected);
    }
    // A text that only holds one of those characters later on is left alone.
    const plain = buildJournalCsv([{ ...entry!, trade: { ...entry!.trade, note: 'a=b, c+d - e@f' } }], await options(db, [formulas]));
    expect(parseCsv(plain)[1]![26]).toBe('a=b, c+d - e@f');
  });

  it('takes the strategy and mistake names from today\'s lists, else from the copy the record holds', async () => {
    const db = await database();
    const id = await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '110'));
    const strategy = await saveStrategy(db, { id: null, name: 'Breakout', rules: [{ id: 'stop', kind: 'stop-planned' }] });
    if (!strategy.ok) throw new Error('fixture strategy');
    await saveTradeDiscipline(db, { tradeId: id, scope: 'real', half: 'strategy', strategyId: strategy.strategy.id, answers: [] });
    await saveTradeDiscipline(db, { tradeId: id, scope: 'real', half: 'review', answers: [], mistakeIds: ['moved-stop', 'oversized'], note: '' });

    const renamed = table(await csv(db, [id], {
      strategyNames: new Map([[strategy.strategy.id as string, 'Breakout (new name)']]),
      mistakeNames: new Map([['moved-stop', 'Moved the stop']]),
    }))[0]!;
    expect(renamed.Strategy).toBe('Breakout (new name)');
    // One mistake renamed; the other is not in the list any more, so the record's own label is used.
    expect(renamed.Mistakes).toBe('Moved the stop; Trade was too big');

    const gone = table(await csv(db, [id]))[0]!;
    expect(gone.Strategy).toBe('Breakout');
    expect(gone.Mistakes).toBe('Moved my stop; Trade was too big');

    // A trade with no strategy or review has blank cells.
    const bare = await save(db, closed('ETHUSDT', '2026-04-03T09:00:00.000Z', '100', '110'));
    const none = table(await csv(db, [bare]))[0]!;
    expect(none.Strategy).toBe('');
    expect(none.Mistakes).toBe('');
  });

  it('says who made the trade: by hand for manual and paper, Replay for a replay', async () => {
    const db = await database();
    const manual = await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '110'));
    const paper = await save(db, closed('ETHUSDT', '2026-04-03T09:00:00.000Z', '100', '110'), 'practice', 'paper');
    const replay = await save(db, closed('SOLUSDT', '2026-04-04T09:00:00.000Z', '100', '110'), 'practice', 'replay');
    const rows = table(await csv(db, [manual, paper, replay], { scope: 'practice' }));
    expect(rowFor(rows, 'BTCUSDT')['Made by']).toBe('By hand');
    expect(rowFor(rows, 'ETHUSDT')['Made by']).toBe('By hand');
    expect(rowFor(rows, 'SOLUSDT')['Made by']).toBe('Replay');
  });

  it('names the file kairos-journal for the Journal and kairos-practice for Practice, with the day', () => {
    expect(journalCsvFileName('real', '2026-04-20')).toBe('kairos-journal-2026-04-20.csv');
    expect(journalCsvFileName('practice', '2026-04-20')).toBe('kairos-practice-2026-04-20.csv');
  });

  it('loads only the trades the filters match, in the file for the right scope and today\'s day in the trader\'s zone', async () => {
    const db = await database();
    await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '110'));
    await save(db, closed('ETHUSDT', '2026-04-03T09:00:00.000Z', '100', '90'));
    await save(db, closed('SOLUSDT', '2026-04-04T09:00:00.000Z', '100', '95'));
    await save(db, { symbol: 'XRPUSDT', marketType: 'crypto', side: 'long', status: 'open', grossPnlCurrency: 'USDT', openedAt: '2026-04-05T09:00:00.000Z', executions: [{ type: 'entry', price: '1', quantity: '1', executedAt: '2026-04-05T09:00:00.000Z' }] });
    await save(db, closed('DOGEUSDT', '2026-04-06T09:00:00.000Z', '100', '99'), 'practice');

    const all = await loadJournalCsv(db, { scope: 'real', filters: NO_JOURNAL_FILTERS, timeZone: 'UTC', now: NOW });
    expect(all.trades).toBe(4);
    expect(table(all.text).map(row => row.Symbol)).toEqual(['XRPUSDT', 'SOLUSDT', 'ETHUSDT', 'BTCUSDT']); // the Journal's order, latest first
    expect(all.fileName).toBe('kairos-journal-2026-04-20.csv');
    expect(all.text.startsWith(`${BOM}${HEADER}\r\n`)).toBe(true);

    const lost = await loadJournalCsv(db, { scope: 'real', filters: readJournalFilters(new URLSearchParams('result=lost'), 'real'), timeZone: 'UTC', now: NOW });
    expect(lost.trades).toBe(2);
    expect(table(lost.text).map(row => row.Symbol).sort()).toEqual(['ETHUSDT', 'SOLUSDT']);

    const named = await loadJournalCsv(db, { scope: 'real', filters: readJournalFilters(new URLSearchParams('q=btc&status=closed'), 'real'), timeZone: 'UTC', now: NOW });
    expect(table(named.text).map(row => row.Symbol)).toEqual(['BTCUSDT']);

    // Nothing matches: the header alone, and a count of 0.
    const none = await loadJournalCsv(db, { scope: 'real', filters: readJournalFilters(new URLSearchParams('q=nothing'), 'real'), timeZone: 'UTC', now: NOW });
    expect(none.trades).toBe(0);
    expect(none.text).toBe(`${BOM}${HEADER}\r\n`);

    // Practice holds only practice trades, and its file is named for it.
    const practice = await loadJournalCsv(db, { scope: 'practice', filters: NO_JOURNAL_FILTERS, timeZone: 'UTC', now: NOW });
    expect(practice.fileName).toBe('kairos-practice-2026-04-20.csv');
    expect(table(practice.text).map(row => row.Symbol)).toEqual(['DOGEUSDT']);

    // Today is the day in the trader's zone: late on 20 April in UTC is already 21 April in Manila.
    const late = '2026-04-20T20:00:00.000Z';
    expect((await loadJournalCsv(db, { scope: 'real', filters: NO_JOURNAL_FILTERS, timeZone: 'UTC', now: late })).fileName).toBe('kairos-journal-2026-04-20.csv');
    const manila = await loadJournalCsv(db, { scope: 'real', filters: NO_JOURNAL_FILTERS, timeZone: 'Asia/Manila', now: late });
    expect(manila.fileName).toBe('kairos-journal-2026-04-21.csv');
    expect(table(manila.text)[0]!['Time zone']).toBe('Asia/Manila');
  });

  it('carries a trade\'s strategy, mistakes and note into the loaded file with today\'s names', async () => {
    const db = await database();
    const id = await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '90'));
    await note(db, id, 'Too big, again');
    const strategy = await saveStrategy(db, { id: null, name: 'Breakout', rules: [{ id: 'stop', kind: 'stop-planned' }] });
    if (!strategy.ok) throw new Error('fixture strategy');
    await saveTradeDiscipline(db, { tradeId: id, scope: 'real', half: 'strategy', strategyId: strategy.strategy.id, answers: [] });
    await saveTradeDiscipline(db, { tradeId: id, scope: 'real', half: 'review', answers: [], mistakeIds: ['oversized'], note: '' });
    // Renamed after the trade was reviewed: the file shows today's name.
    expect((await saveStrategy(db, { id: strategy.strategy.id, name: 'Range break', rules: [{ id: 'stop', kind: 'stop-planned' }] })).ok).toBe(true);

    const file = await loadJournalCsv(db, { scope: 'real', filters: readJournalFilters(new URLSearchParams(`strategy=${strategy.strategy.id}&mistake=oversized`), 'real'), timeZone: 'UTC', now: NOW });
    expect(file.trades).toBe(1);
    const [row] = table(file.text);
    expect(row).toMatchObject({ Symbol: 'BTCUSDT', Strategy: 'Range break', Mistakes: 'Trade was too big', Note: 'Too big, again', 'Result before fees': '-10', 'Result after fees': '-10' });
    expect(file.text).toContain('"Too big, again"');
  });

  it('review r1: a damaged checklist record is left out (the one discipline read), never a failed file', async () => {
    const db = await database();
    const id = await save(db, closed('BTCUSDT', '2026-04-01T09:00:00.000Z', '100', '90'));
    await db.tradeDiscipline.put({ id: 'damaged-record', tradeId: id, strategy: null } as never);
    const file = await loadJournalCsv(db, { scope: 'real', filters: NO_JOURNAL_FILTERS, timeZone: 'UTC', now: NOW });
    expect(rowFor(table(file.text), 'BTCUSDT')).toMatchObject({ Strategy: '', Mistakes: '', 'Result after fees': '-10' });
  });
});
