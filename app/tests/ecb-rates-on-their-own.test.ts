import { describe, expect, it } from 'vitest';
import { describeRatesFetchedOnTheirOwn } from '../src/application/currency/currencyWords';
import { ecbRatesToFetchOnItsOwn, missingRateKey } from '../src/application/currency/ecbRates';
import type { MissingExchangeRate } from '../src/application/currency/resultsInHomeCurrency';

const USD: MissingExchangeRate = { from: 'USD', to: 'EUR', day: '2026-09-18', trades: 2 };
const NGN: MissingExchangeRate = { from: 'NGN', to: 'EUR', day: '2026-09-18', trades: 1 };

describe('T-051b which missing rates Kairos fetches on its own', () => {
  it('asks only for rates the bank publishes, once per visit', () => {
    expect(ecbRatesToFetchOnItsOwn([USD, NGN], new Set())).toEqual([USD]);
    expect(ecbRatesToFetchOnItsOwn([USD, NGN], new Set([missingRateKey(USD)]))).toEqual([]);
  });

  it('keys a missing rate the same way every time', () => {
    expect(missingRateKey(USD)).toBe('USD>EUR@2026-09-18');
    const moreTrades: MissingExchangeRate = { ...USD, trades: 9 };
    expect(missingRateKey(moreTrades)).toBe(missingRateKey(USD));
  });

  it('says what fetching on its own did', () => {
    expect(describeRatesFetchedOnTheirOwn({ ok: true, saved: 1, notPublishedYet: [] })).toEqual({ tone: 'status', text: 'Got 1 exchange rate from the European Central Bank.' });
    expect(describeRatesFetchedOnTheirOwn({ ok: true, saved: 3, notPublishedYet: [{ currency: 'USD', day: '2026-09-19' }] })).toEqual({ tone: 'status', text: 'Got 3 exchange rates from the European Central Bank.' });
    expect(describeRatesFetchedOnTheirOwn({ ok: true, saved: 0, notPublishedYet: [{ currency: 'USD', day: '2026-09-19' }, { currency: 'GBP', day: '2026-09-20' }, { currency: 'USD', day: '2026-09-18' }] }))
      .toEqual({ tone: 'status', text: 'The European Central Bank has no rate for 20 September 2026 yet. Kairos will ask again next time you open your results.' });
    expect(describeRatesFetchedOnTheirOwn({ ok: false, reason: 'unavailable' })).toEqual({ tone: 'unavailable', text: 'The missing exchange rates could not be fetched. Check your connection, then try again.' });
    expect(describeRatesFetchedOnTheirOwn({ ok: false, reason: 'storage-error' })).toEqual({ tone: 'error', text: 'Kairos could not save the exchange rates. Nothing was changed.' });
    expect(describeRatesFetchedOnTheirOwn({ ok: false, reason: 'nothing-to-fetch' })).toBeNull();
  });
});
