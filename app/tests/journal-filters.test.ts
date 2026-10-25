import { describe, expect, it } from 'vitest';
import {
  hasJournalFilters, journalListHref, journalSymbolKey, JOURNAL_FILTER_KEYS, NO_JOURNAL_FILTERS, readJournalFilters, writeJournalFilters,
  type JournalFilters,
} from '../src/application/journal';
import { journalDateBounds, matchesJournalDetails, matchesJournalTradeFields } from '../src/application/journal/journalFilters';
import type { TradeRecord } from '../src/domain/trades';

const read = (search: string, scope: 'real' | 'practice' = 'real'): JournalFilters => readJournalFilters(new URLSearchParams(search), scope);
const filters = (partial: Partial<JournalFilters>): JournalFilters => ({ ...NO_JOURNAL_FILTERS, ...partial });

describe('T-060e reading the filters from the address', () => {
  it('reads nothing from an empty address, in both scopes', () => {
    expect(read('')).toEqual(NO_JOURNAL_FILTERS);
    expect(read('', 'practice')).toEqual(NO_JOURNAL_FILTERS);
    expect(hasJournalFilters(read(''))).toBe(false);
  });

  it('reads every key when its value is valid', () => {
    const all = read('q=btc&status=closed&from=2026-04-01&to=2026-04-30&market=crypto&side=short&result=lost&strategy=breakout&mistake=moved-stop');
    expect(all).toEqual({ q: 'btc', status: 'closed', from: '2026-04-01', to: '2026-04-30', market: 'crypto', side: 'short', result: 'lost', strategy: 'breakout', mistake: 'moved-stop', source: null });
    expect(read('status=draft').status).toBe('draft');
    expect(read('status=open').status).toBe('open');
    expect(read('status=cancelled').status).toBe('cancelled');
    for (const market of ['stock', 'forex', 'crypto', 'futures', 'options', 'other']) expect(read(`market=${market}`).market).toBe(market);
    for (const side of ['long', 'short']) expect(read(`side=${side}`).side).toBe(side);
    for (const result of ['won', 'lost', 'even']) expect(read(`result=${result}`).result).toBe(result);
  });

  it('reads one key without touching the others', () => {
    for (const [search, key] of [['q=eth', 'q'], ['status=open', 'status'], ['from=2026-04-01', 'from'], ['to=2026-04-01', 'to'], ['market=forex', 'market'], ['side=long', 'side'], ['result=even', 'result'], ['strategy=breakout', 'strategy'], ['mistake=oversized', 'mistake']] as const) {
      const only = read(search);
      expect(only[key]).not.toBeNull();
      expect(JOURNAL_FILTER_KEYS.filter(other => other !== key).every(other => only[other] === null)).toBe(true);
      expect(hasJournalFilters(only)).toBe(true);
    }
  });

  it('drops a status, market, side or result Kairos does not know', () => {
    expect(read('status=pending&market=bonds&side=buy&result=draw')).toEqual(NO_JOURNAL_FILTERS);
    expect(read('status=&market=&side=&result=')).toEqual(NO_JOURNAL_FILTERS);
    // A bad value of one key never spoils a good value of another.
    expect(read('status=pending&market=crypto')).toEqual(filters({ market: 'crypto' }));
  });

  it('drops a date that is not a real day', () => {
    for (const bad of ['2026-02-30', '2026-02-29', '2026-13-01', '2026-00-10', '2026-04-31', '2026-4-1', '04/01/2026', '2026-04-01T00:00:00Z', 'yesterday', '']) {
      expect(read(`from=${encodeURIComponent(bad)}&to=${encodeURIComponent(bad)}`)).toEqual(NO_JOURNAL_FILTERS);
    }
    expect(read('from=2024-02-29').from).toBe('2024-02-29');
  });

  it('drops a strategy or mistake id that is not an id', () => {
    for (const bad of ['Strategy!', 'UPPER', '-leading-dash', 'has space', 'a'.repeat(65), '']) {
      const dropped = read(`strategy=${encodeURIComponent(bad)}&mistake=${encodeURIComponent(bad)}`);
      expect(dropped.strategy).toBeNull();
      expect(dropped.mistake).toBeNull();
    }
    expect(read(`strategy=${'a'.repeat(64)}`).strategy).toBe('a'.repeat(64));
    expect(read('mistake=0f3c9a52-7d41-4a4f-8c0e-6f2f4f3f9a11').mistake).toBe('0f3c9a52-7d41-4a4f-8c0e-6f2f4f3f9a11');
  });

  it('drops a search with no letters or digits, and keeps a real one as typed', () => {
    for (const empty of ['', '   ', '/', '/ ', ' / / ', '//  //']) expect(read(`q=${encodeURIComponent(empty)}`).q).toBeNull();
    expect(read('q=').q).toBeNull();
    expect(read(`q=${encodeURIComponent('  btc/ usdt ')}`).q).toBe('btc/ usdt');
    expect(read('q=ETH').q).toBe('ETH');
    const long = read(`q=${'a'.repeat(100)}`).q;
    expect(long).not.toBeNull();
    expect(long!.length).toBeLessThanOrEqual(40);
    expect('a'.repeat(100).startsWith(long!)).toBe(true);
  });

  it('keeps "How it was made" only in Practice, and only for a way Practice has', () => {
    expect(read('source=paper', 'real').source).toBeNull();
    expect(read('source=replay', 'real').source).toBeNull();
    expect(read('source=paper', 'practice').source).toBe('paper');
    expect(read('source=replay', 'practice').source).toBe('replay');
    expect(read('source=manual', 'practice').source).toBeNull();
    expect(read('source=import', 'practice').source).toBeNull();
    expect(read('source=live', 'practice').source).toBeNull();
    // The rest of a real address is read the same in both scopes.
    expect(read('market=crypto&source=paper', 'real')).toEqual(filters({ market: 'crypto' }));
    expect(read('market=crypto&source=paper', 'practice')).toEqual(filters({ market: 'crypto', source: 'paper' }));
  });
});

describe('T-060e writing the filters to the address', () => {
  const full: JournalFilters = { q: 'btc/usdt', status: 'closed', from: '2026-04-01', to: '2026-04-30', market: 'crypto', side: 'long', result: 'won', strategy: 'breakout', mistake: 'moved-stop', source: 'replay' };

  it('writes the keys in one fixed order, whatever order they were given in', () => {
    const shuffled = { source: 'replay', mistake: 'moved-stop', strategy: 'breakout', result: 'won', side: 'long', market: 'crypto', to: '2026-04-30', from: '2026-04-01', status: 'closed', q: 'btc/usdt' } as const;
    const written = writeJournalFilters(shuffled);
    expect([...written.keys()]).toEqual(['q', 'status', 'from', 'to', 'market', 'side', 'result', 'strategy', 'mistake', 'source']);
    expect(written.toString()).toBe(writeJournalFilters(full).toString());
  });

  it('leaves out what is not set', () => {
    expect(writeJournalFilters(NO_JOURNAL_FILTERS).toString()).toBe('');
    expect(writeJournalFilters({}).toString()).toBe('');
    expect(writeJournalFilters({ q: '', status: undefined, market: 'stock', side: null }).toString()).toBe('market=stock');
  });

  it('keeps what else the address held, such as the results period, and replaces its old filters', () => {
    const keep = new URLSearchParams('period=month&q=old&mistake=old-one&status=open');
    const written = writeJournalFilters({ status: 'closed' }, keep);
    expect(written.get('period')).toBe('month');
    expect(written.get('status')).toBe('closed');
    expect(written.get('q')).toBeNull();
    expect(written.get('mistake')).toBeNull();
    // The address it was given is not changed.
    expect(keep.toString()).toBe('period=month&q=old&mistake=old-one&status=open');
    // Clearing every filter keeps only the period.
    expect(writeJournalFilters(NO_JOURNAL_FILTERS, keep).toString()).toBe('period=month');
  });

  it('reads back what it wrote', () => {
    expect(readJournalFilters(writeJournalFilters(full), 'practice')).toEqual(full);
    expect(readJournalFilters(new URLSearchParams(writeJournalFilters(full).toString()), 'practice')).toEqual(full);
    expect(readJournalFilters(writeJournalFilters(NO_JOURNAL_FILTERS), 'real')).toEqual(NO_JOURNAL_FILTERS);
    const real = { ...full, source: null };
    expect(readJournalFilters(writeJournalFilters(real), 'real')).toEqual(real);
    // Each key alone, with characters an address has to escape.
    for (const key of JOURNAL_FILTER_KEYS) {
      const one: JournalFilters = { ...NO_JOURNAL_FILTERS, [key]: full[key] };
      expect(readJournalFilters(writeJournalFilters(one), 'practice')).toEqual(one);
    }
    const escaped = filters({ q: 'a&b=c d/é' });
    expect(readJournalFilters(new URLSearchParams(writeJournalFilters(escaped).toString()), 'real')).toEqual(escaped);
  });

  it('a read value written again gives the same address', () => {
    const address = new URLSearchParams('status=closed&q=btc&market=crypto');
    const once = readJournalFilters(address, 'real');
    expect(readJournalFilters(writeJournalFilters(once), 'real')).toEqual(once);
  });
});

describe('T-060e links to a filtered list', () => {
  it('links the coach and Patterns to the Journal or Practice with the filter set', () => {
    expect(journalListHref('practice', { mistake: 'late-entry' })).toBe('/practice?mistake=late-entry');
    expect(journalListHref('real', { mistake: 'late-entry' })).toBe('/journal?mistake=late-entry');
    expect(journalListHref('real', { strategy: 'breakout', status: 'closed' })).toBe('/journal?status=closed&strategy=breakout');
    expect(journalListHref('real', {})).toBe('/journal');
    expect(journalListHref('practice', NO_JOURNAL_FILTERS)).toBe('/practice');
  });

  it('a link reads back as the filter it was made from', () => {
    const href = journalListHref('practice', { mistake: 'late-entry', source: 'paper' });
    const search = href.slice(href.indexOf('?') + 1);
    expect(read(search, 'practice')).toEqual(filters({ mistake: 'late-entry', source: 'paper' }));
  });
});

describe('T-060e knowing whether a filter is set', () => {
  const setValue = { q: 'btc', status: 'open', from: '2026-04-01', to: '2026-04-01', market: 'stock', side: 'long', result: 'won', strategy: 's', mistake: 'm', source: 'paper' } as const;

  it('is false with nothing set, and true when any one key is set', () => {
    expect(hasJournalFilters(NO_JOURNAL_FILTERS)).toBe(false);
    for (const key of JOURNAL_FILTER_KEYS) expect(hasJournalFilters({ ...NO_JOURNAL_FILTERS, [key]: setValue[key] })).toBe(true);
  });
});

describe('T-060e the symbol search text', () => {
  it('ignores capitals, spaces and slashes', () => {
    expect(journalSymbolKey('btc/ usdt')).toBe('BTCUSDT');
    expect(journalSymbolKey(' Btc / UsDt ')).toBe('BTCUSDT');
    expect(journalSymbolKey('BTCUSDT')).toBe('BTCUSDT');
    expect(journalSymbolKey('/ ')).toBe('');
  });
});

const baseTrade = (patch: Partial<TradeRecord>): TradeRecord => ({
  id: 'trade-1', symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual',
  openedAt: '2026-03-31T23:30:00.000Z', closedAt: '2026-04-01T01:00:00.000Z', createdAt: '2026-03-31T22:00:00.000Z', updatedAt: '2026-04-01T01:00:00.000Z', ...patch,
} as TradeRecord);

describe('T-060e which trades match on their own fields', () => {
  it('matches the symbol search without capitals, spaces or slashes', () => {
    const btc = baseTrade({});
    expect(matchesJournalTradeFields(btc, filters({ q: 'btc/ usdt' }), 'UTC')).toBe(true);
    expect(matchesJournalTradeFields(btc, filters({ q: 'tcu' }), 'UTC')).toBe(true);
    expect(matchesJournalTradeFields(btc, filters({ q: 'eth' }), 'UTC')).toBe(false);
  });

  it('matches status, market, side and how it was made exactly', () => {
    const btc = baseTrade({});
    expect(matchesJournalTradeFields(btc, filters({ status: 'closed', market: 'crypto', side: 'long' }), 'UTC')).toBe(true);
    expect(matchesJournalTradeFields(btc, filters({ status: 'open' }), 'UTC')).toBe(false);
    expect(matchesJournalTradeFields(btc, filters({ market: 'stock' }), 'UTC')).toBe(false);
    expect(matchesJournalTradeFields(btc, filters({ side: 'short' }), 'UTC')).toBe(false);
    expect(matchesJournalTradeFields(btc, filters({ source: 'paper' }), 'UTC')).toBe(false);
    expect(matchesJournalTradeFields(baseTrade({ source: 'paper' }), filters({ source: 'paper' }), 'UTC')).toBe(true);
  });

  it('puts the Journal date on the day of the trader\'s time zone', () => {
    const trade = baseTrade({}); // opened 2026-03-31 23:30 UTC = 2026-04-01 07:30 in Manila
    expect(matchesJournalTradeFields(trade, filters({ from: '2026-04-01', to: '2026-04-01' }), 'Asia/Manila')).toBe(true);
    expect(matchesJournalTradeFields(trade, filters({ from: '2026-04-01', to: '2026-04-01' }), 'UTC')).toBe(false);
    expect(matchesJournalTradeFields(trade, filters({ from: '2026-03-31', to: '2026-03-31' }), 'UTC')).toBe(true);
    expect(matchesJournalTradeFields(trade, filters({ from: '2026-03-31', to: '2026-03-31' }), 'Asia/Manila')).toBe(false);
    expect(matchesJournalTradeFields(trade, filters({ from: '2026-04-02' }), 'Asia/Manila')).toBe(false);
    expect(matchesJournalTradeFields(trade, filters({ to: '2026-03-31' }), 'Asia/Manila')).toBe(false);
  });

  it('uses the day it was planned for a trade that was never opened', () => {
    const planned = baseTrade({ status: 'draft', openedAt: null, closedAt: null, createdAt: '2026-04-05T10:00:00.000Z' });
    expect(matchesJournalTradeFields(planned, filters({ from: '2026-04-05', to: '2026-04-05' }), 'UTC')).toBe(true);
    expect(matchesJournalTradeFields(planned, filters({ from: '2026-04-06' }), 'UTC')).toBe(false);
  });

  it('widens the stored-date range to hold the day in any time zone', () => {
    const bounds = journalDateBounds({ from: '2026-04-01', to: '2026-04-01' });
    // 1 Apr 00:00 in UTC+14 is 31 Mar 10:00 UTC; 1 Apr 23:59 in UTC-12 is 2 Apr 11:59 UTC.
    expect(bounds.from! <= '2026-03-31T10:00:00.000Z').toBe(true);
    expect(bounds.to! >= '2026-04-02T11:59:59.999Z').toBe(true);
    expect(journalDateBounds({ from: null, to: null })).toEqual({ from: null, to: null });
  });
});

describe('T-060e which trades match on what they were worth and how they were judged', () => {
  const record = { strategy: { strategyId: 'breakout' }, mistakes: [{ itemId: 'moved-stop' }, { itemId: 'oversized' }] };

  it('matches won, lost and even from the result, and never an unknown result', () => {
    expect(matchesJournalDetails('profit', null, filters({ result: 'won' }))).toBe(true);
    expect(matchesJournalDetails('loss', null, filters({ result: 'won' }))).toBe(false);
    expect(matchesJournalDetails('loss', null, filters({ result: 'lost' }))).toBe(true);
    expect(matchesJournalDetails('breakeven', null, filters({ result: 'even' }))).toBe(true);
    expect(matchesJournalDetails('breakeven', null, filters({ result: 'won' }))).toBe(false);
    for (const result of ['won', 'lost', 'even'] as const) expect(matchesJournalDetails('unavailable', null, filters({ result }))).toBe(false);
    expect(matchesJournalDetails('unavailable', null, NO_JOURNAL_FILTERS)).toBe(true);
  });

  it('matches a strategy and a mistake from the checklist and review record', () => {
    expect(matchesJournalDetails('profit', record, filters({ strategy: 'breakout' }))).toBe(true);
    expect(matchesJournalDetails('profit', record, filters({ strategy: 'pullback' }))).toBe(false);
    expect(matchesJournalDetails('profit', record, filters({ mistake: 'oversized' }))).toBe(true);
    expect(matchesJournalDetails('profit', record, filters({ mistake: 'late-exit' }))).toBe(false);
    expect(matchesJournalDetails('profit', record, filters({ strategy: 'breakout', mistake: 'moved-stop', result: 'won' }))).toBe(true);
    expect(matchesJournalDetails('profit', record, filters({ strategy: 'breakout', mistake: 'late-exit' }))).toBe(false);
  });

  it('a trade with no record matches no strategy and no mistake', () => {
    expect(matchesJournalDetails('profit', null, filters({ strategy: 'breakout' }))).toBe(false);
    expect(matchesJournalDetails('profit', null, filters({ mistake: 'moved-stop' }))).toBe(false);
    expect(matchesJournalDetails('profit', { mistakes: [] }, filters({ strategy: 'breakout' }))).toBe(false);
    expect(matchesJournalDetails('profit', null, NO_JOURNAL_FILTERS)).toBe(true);
  });
});
