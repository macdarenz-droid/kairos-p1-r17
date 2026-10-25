import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { saveTradeDiscipline } from '../src/application/discipline';
import { describeJournalTotals, loadJournalTotals, NO_JOURNAL_FILTERS, type JournalFilters, type JournalTotals } from '../src/application/journal';
import { savePracticeTrade } from '../src/application/practice';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import { createTradeDomainId, type DecimalString, type MarketType, type TradeId, type TradeRecord } from '../src/domain/trades';

const NOW = '2026-04-20T12:00:00.000Z';
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-journal-totals-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}

const only = (partial: Partial<JournalFilters>): JournalFilters => ({ ...NO_JOURNAL_FILTERS, ...partial });
const hourAfter = (iso: string) => new Date(Date.parse(iso) + 3_600_000).toISOString();
/** A closed trade of one unit: it made (exit - entry) for a long, (entry - exit) for a short. */
function closed(symbol: string, openedAt: string, entry: string, exit: string, currency: string | null = 'USDT', options: { side?: 'long' | 'short'; marketType?: MarketType; fee?: string } = {}): SaveManualTradeInput {
  const closedAt = hourAfter(openedAt);
  return {
    symbol, marketType: options.marketType ?? 'crypto', side: options.side ?? 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    executions: [{ type: 'entry', price: entry, quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
    fees: options.fee === undefined ? [] : [{ amount: options.fee, currency: currency ?? 'USDT' }],
  } as SaveManualTradeInput;
}
async function save(db: KairosDatabase, input: SaveManualTradeInput): Promise<TradeId> {
  const saved = await saveManualTrade(db, input, { now: () => NOW });
  if (!saved.ok) throw new Error(`fixture ${input.symbol}: ${JSON.stringify(saved)}`);
  return saved.tradeId as TradeId;
}
const totals = (db: KairosDatabase, filters: Partial<JournalFilters> = {}, scope: 'real' | 'practice' = 'real', timeZone = 'UTC'): Promise<JournalTotals> =>
  loadJournalTotals(db, scope, only(filters), timeZone);
const bank = (to: string, rate: string, day: string): ExchangeRateRecord => ({ id: exchangeRateId('ecb', 'EUR', to, day), source: 'ecb', from: 'EUR', to, day, rateDay: day, rate: rate as DecimalString, savedAt: NOW });

describe('T-060e the Journal totals', () => {
  it('counts every matching trade, not only the first page', async () => {
    const db = await database();
    const start = Date.parse('2026-02-01T00:00:00.000Z');
    const at = (index: number) => new Date(start + index * 3_600_000 * 2).toISOString();
    // 130 BTCUSDT trades: 105 won 2 each, 20 lost 1 each, 5 even. Then 1 open BTCUSDT and 10 ETHUSDT that each lost 3.
    for (let index = 0; index < 130; index += 1) {
      const outcome = index < 105 ? ['100', '102'] : index < 125 ? ['100', '99'] : ['100', '100'];
      await save(db, closed('BTCUSDT', at(index), outcome[0]!, outcome[1]!));
    }
    await save(db, { symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'open', openedAt: at(130), grossPnlCurrency: 'USDT', executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: at(130) }] } as SaveManualTradeInput);
    for (let index = 0; index < 10; index += 1) await save(db, closed('ETHUSDT', at(131 + index), '100', '97'));

    const btc = await totals(db, { q: 'btc' });
    expect(btc).toMatchObject({ trades: 131, won: 105, lost: 20 });
    expect(btc.result).toMatchObject({ available: true, currency: 'USDT', total: '190' });
    expect(describeJournalTotals(btc)).toBe('131 trades · won 105 · lost 20 · result after fees +190 USDT');

    const all = await totals(db);
    expect(all).toMatchObject({ trades: 141, won: 105, lost: 30 });
    expect(all.result).toMatchObject({ available: true, total: '160' });
    expect(describeJournalTotals(all)).toBe('141 trades · won 105 · lost 30 · result after fees +160 USDT');

    expect(describeJournalTotals(await totals(db, { q: 'eth' }))).toBe('10 trades · won 0 · lost 10 · result after fees -30 USDT');
    expect(describeJournalTotals(await totals(db, { result: 'won' }))).toBe('105 trades · won 105 · lost 0 · result after fees +210 USDT');
  });

  it('adds the results after fees in the trade currency when there is no home currency', async () => {
    const db = await database();
    await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '150', 'USDT', { fee: '5' }));
    await save(db, closed('ETHUSDT', '2026-04-03T09:00:00.000Z', '100', '80', 'USDT', { fee: '1' }));
    await save(db, closed('SOLUSDT', '2026-04-04T09:00:00.000Z', '120', '104', 'USDT', { side: 'short' }));
    const found = await totals(db);
    // 50 - 5 = +45, -20 - 1 = -21, +16: the fees are in the sum.
    expect(found).toMatchObject({ trades: 3, won: 2, lost: 1 });
    expect(found.result).toMatchObject({ available: true, currency: 'USDT', total: '40', tradeCount: 3 });
    expect(found.inHome).toEqual({ homeCurrency: null, convertedTrades: 0, tradesMissingRate: 0, missing: [] });
    expect(describeJournalTotals(found)).toBe('3 trades · won 2 · lost 1 · result after fees +40 USDT');
  });

  it('adds the results in the home currency when every rate is there', async () => {
    const db = await database();
    await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '130', 'USDT'));
    await save(db, closed('BTCEUR', '2026-04-02T11:00:00.000Z', '100', '110', 'EUR'));
    await save(db, closed('ETHEUR', '2026-04-02T13:00:00.000Z', '100', '96', 'EUR'));
    await db.exchangeRates.bulkPut([bank('USD', '1.1', '2026-04-02')]);
    expect((await saveHomeCurrency(db, { currency: 'USD', usdStablecoins: ['USDT'] }, { now: () => NOW })).ok).toBe(true);
    const found = await totals(db);
    // +30 USDT counted as dollars, +10 EUR = +11 USD, -4 EUR = -4.4 USD.
    expect(found).toMatchObject({ trades: 3, won: 2, lost: 1 });
    expect(found.result).toMatchObject({ available: true, currency: 'USD', total: '36.6' });
    expect(found.inHome).toMatchObject({ homeCurrency: 'USD', convertedTrades: 3, tradesMissingRate: 0, missing: [] });
    expect(describeJournalTotals(found)).toBe('3 trades · won 2 · lost 1 · result after fees +36.6 USD');
  });

  it('refuses the sum, and says so, when a result has no rate to be converted with', async () => {
    const db = await database();
    await save(db, closed('AAPL', '2026-04-02T09:00:00.000Z', '100', '120', 'USD', { marketType: 'stock' }));
    await save(db, closed('BTCEUR', '2026-04-02T11:00:00.000Z', '100', '95', 'EUR'));
    expect((await saveHomeCurrency(db, { currency: 'USD', usdStablecoins: [] }, { now: () => NOW })).ok).toBe(true);
    const found = await totals(db);
    expect(found).toMatchObject({ trades: 2, won: 1, lost: 1 });
    expect(found.result).toMatchObject({ available: false, reason: 'mixed-currencies', total: null, currency: null });
    expect(found.inHome).toMatchObject({ homeCurrency: 'USD', convertedTrades: 0, tradesMissingRate: 1 });
    expect(found.inHome.missing).toEqual([{ from: 'EUR', to: 'USD', day: '2026-04-02', trades: 1 }]);
    const words = describeJournalTotals(found);
    expect(words).toBe('2 trades · won 1 · lost 1 · result after fees: Not available: 1 trade still needs an exchange rate to count in USD.');
    expect(words).toContain('Not available');
    expect(words).not.toContain(' 0 ');
    expect(words).not.toMatch(/result after fees:? [-+]?0\b/);

    // Saving the missing rate makes the same trades add up.
    await db.exchangeRates.bulkPut([bank('USD', '1.1', '2026-04-02')]);
    const fixed = await totals(db);
    expect(fixed.result).toMatchObject({ available: true, currency: 'USD', total: '14.5' });
    expect(fixed.inHome.tradesMissingRate).toBe(0);
    expect(describeJournalTotals(fixed)).toBe('2 trades · won 1 · lost 1 · result after fees +14.5 USD');
  });

  it('refuses a sum of different currencies when no home currency is chosen, and says how to fix it', async () => {
    const db = await database();
    await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '110', 'USDT'));
    await save(db, closed('BTCEUR', '2026-04-02T11:00:00.000Z', '100', '90', 'EUR'));
    const found = await totals(db);
    expect(found).toMatchObject({ trades: 2, won: 1, lost: 1 });
    expect(found.result).toMatchObject({ available: false, reason: 'mixed-currencies' });
    expect(found.inHome).toMatchObject({ homeCurrency: null, tradesMissingRate: 0 });
    expect(describeJournalTotals(found)).toContain('Choose a home currency');
    // One currency at a time still adds up.
    expect(describeJournalTotals(await totals(db, { q: 'usdt' }))).toBe('1 trade · won 1 · lost 0 · result after fees +10 USDT');
    expect(describeJournalTotals(await totals(db, { q: 'eur' }))).toBe('1 trade · won 0 · lost 1 · result after fees -10 EUR');
  });

  it('shows a real total of zero as 0, and a missing result as unavailable, never as 0', async () => {
    const db = await database();
    await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '105'));
    await save(db, closed('ETHUSDT', '2026-04-02T11:00:00.000Z', '100', '95'));
    const zero = await totals(db);
    expect(zero.result).toMatchObject({ available: true, total: '0', currency: 'USDT', outcome: 'breakeven' });
    expect(describeJournalTotals(zero)).toBe('2 trades · won 1 · lost 1 · result after fees 0 USDT');

    // A closed trade with no fills has no result: the total is refused, not added as 0, and it is neither won nor lost.
    const noFills = createTradeDomainId<TradeId>();
    await db.trades.put({
      id: noFills, symbol: 'NODATA', marketType: 'other', side: 'long', status: 'closed', source: 'manual',
      openedAt: '2026-04-05T10:00:00.000Z', closedAt: '2026-04-05T11:00:00.000Z', createdAt: '2026-04-05T10:00:00.000Z', updatedAt: '2026-04-05T11:00:00.000Z',
    } as TradeRecord);
    const unknown = await totals(db);
    expect(unknown).toMatchObject({ trades: 3, won: 1, lost: 1 });
    expect(unknown.result).toMatchObject({ available: false, reason: 'unavailable-trade-outcome' });
    expect(describeJournalTotals(unknown)).toBe('3 trades · won 1 · lost 1 · result after fees: Not available: a trade has no result yet.');
    expect(describeJournalTotals(await totals(db, { q: 'nodata' }))).toContain('Not available');
  });

  it('says no trade has a result yet when only open or planned trades match, or none match', async () => {
    const db = await database();
    expect(describeJournalTotals(await totals(db))).toBe('0 trades · won 0 · lost 0 · result after fees: No trade with a result yet');
    await save(db, { symbol: 'AAPL', marketType: 'stock', side: 'long', status: 'open', openedAt: '2026-04-02T09:00:00.000Z', grossPnlCurrency: 'USD', executions: [{ type: 'entry', price: '190', quantity: '1', executedAt: '2026-04-02T09:00:00.000Z' }] } as SaveManualTradeInput);
    const found = await totals(db);
    expect(found).toMatchObject({ trades: 1, won: 0, lost: 0 });
    expect(found.result).toMatchObject({ available: false, reason: 'no-trades' });
    expect(describeJournalTotals(found)).toBe('1 trade · won 0 · lost 0 · result after fees: No trade with a result yet');
  });

  it('adds up only the trades the filters match', async () => {
    const db = await database();
    const wide = await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '110'));
    const oversized = await save(db, closed('ETHUSDT', '2026-04-03T09:00:00.000Z', '100', '90'));
    await save(db, closed('SOLUSDT', '2026-04-04T09:00:00.000Z', '100', '104', 'USDT', { marketType: 'other' }));
    await save(db, closed('XRPUSDT', '2026-04-05T09:00:00.000Z', '10', '6', 'USDT', { side: 'short' }));
    for (const [tradeId, mistakeIds] of [[wide, ['moved-stop']], [oversized, ['moved-stop', 'oversized']]] as const) {
      const reviewed = await saveTradeDiscipline(db, { tradeId, scope: 'real', half: 'review', answers: [], mistakeIds: [...mistakeIds], note: '' });
      expect(reviewed.ok).toBe(true);
    }
    expect(describeJournalTotals(await totals(db))).toBe('4 trades · won 3 · lost 1 · result after fees +8 USDT');
    expect(describeJournalTotals(await totals(db, { mistake: 'moved-stop' }))).toBe('2 trades · won 1 · lost 1 · result after fees 0 USDT');
    expect(describeJournalTotals(await totals(db, { mistake: 'oversized' }))).toBe('1 trade · won 0 · lost 1 · result after fees -10 USDT');
    expect(describeJournalTotals(await totals(db, { result: 'won', market: 'crypto' }))).toBe('2 trades · won 2 · lost 0 · result after fees +14 USDT');
    expect(describeJournalTotals(await totals(db, { side: 'short' }))).toBe('1 trade · won 1 · lost 0 · result after fees +4 USDT');
    expect(describeJournalTotals(await totals(db, { from: '2026-04-03', to: '2026-04-04' }))).toBe('2 trades · won 1 · lost 1 · result after fees -6 USDT');
    expect(describeJournalTotals(await totals(db, { q: 'doge' }))).toBe('0 trades · won 0 · lost 0 · result after fees: No trade with a result yet');
  });

  it('counts the dates in the trader\'s time zone', async () => {
    const db = await database();
    await save(db, closed('BTCUSDT', '2026-03-31T23:30:00.000Z', '100', '110')); // 1 April in Manila
    await save(db, closed('ETHUSDT', '2026-04-01T16:30:00.000Z', '100', '95')); // 1 April in UTC, 2 April in Manila
    const april1 = { from: '2026-04-01', to: '2026-04-01' };
    expect(describeJournalTotals(await totals(db, april1, 'real', 'UTC'))).toBe('1 trade · won 0 · lost 1 · result after fees -5 USDT');
    expect(describeJournalTotals(await totals(db, april1, 'real', 'Asia/Manila'))).toBe('1 trade · won 1 · lost 0 · result after fees +10 USDT');
  });

  it('counts a scope on its own: Practice totals hold only practice trades', async () => {
    const db = await database();
    await save(db, closed('BTCUSDT', '2026-04-02T09:00:00.000Z', '100', '150'));
    const paper = await savePracticeTrade(db, closed('BTCUSDT', '2026-04-03T09:00:00.000Z', '100', '105'), { now: () => NOW });
    const replay = await savePracticeTrade(db, { ...closed('ETHUSDT', '2026-04-04T09:00:00.000Z', '100', '98'), source: 'replay' }, { now: () => NOW });
    expect(paper.ok && replay.ok).toBe(true);
    expect(describeJournalTotals(await totals(db, {}, 'practice'))).toBe('2 trades · won 1 · lost 1 · result after fees +3 USDT');
    expect(describeJournalTotals(await totals(db, { source: 'replay' }, 'practice'))).toBe('1 trade · won 0 · lost 1 · result after fees -2 USDT');
    expect(describeJournalTotals(await totals(db, { source: 'paper', q: 'btc' }, 'practice'))).toBe('1 trade · won 1 · lost 0 · result after fees +5 USDT');
    expect(describeJournalTotals(await totals(db, {}, 'real'))).toBe('1 trade · won 1 · lost 0 · result after fees +50 USDT');
  });
});
