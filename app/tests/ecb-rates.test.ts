import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ecbCanProvideRate, ecbRateNeeds, fetchMissingEcbRates, planEcbRequest, selectEcbRates, type EcbReferenceRatesPort } from '../src/application/currency/ecbRates';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { isExchangeRateRecordShape } from '../src/domain/calculations/currencyConversion';
import type { DecimalString } from '../src/domain/trades';
import {
  ECB_REQUEST_TIMEOUT_MS,
  createEcbReferenceRatesPort,
  decodeEcbReferenceRatesCsv,
  ecbReferenceRatesUrl,
  type EcbReferenceRate,
} from '../src/services/exchange-rates/ecbReferenceRates';

const HEADER = 'KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD,OBS_VALUE';
const LINES = [
  'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-09-18,0.8588',
  'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-09-21,0.8578',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-09-17,1.1481',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-09-18,1.146',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-09-21,1.149',
  'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-09-25,1.1403',
];
const csv = [HEADER, ...LINES].join('\n');
const line = (currency: string, day: string, value: string) => `EXR.D.${currency}.EUR.SP00.A,D,${currency},EUR,SP00,A,${day},${value}`;

function decoded(body = csv): readonly EcbReferenceRate[] {
  const result = decodeEcbReferenceRatesCsv(body);
  if (!result.ok) throw new Error(result.reason);
  return result.rates;
}
const rate = (currency: string, day: string, value: string): EcbReferenceRate => ({ currency, day, rate: value as DecimalString });
const savedAt = '2026-09-26T10:00:00.000Z';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { vi.restoreAllMocks(); vi.useRealTimers(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const name = `kairos-ecb-${label}-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}

describe('T-045d the bank adapter', () => {
  it('builds the data API address', () => {
    expect(ecbReferenceRatesUrl({ currencies: ['GBP', 'USD'], fromDay: '2026-09-14', toDay: '2026-09-25' }))
      .toBe('https://data-api.ecb.europa.eu/service/data/EXR/D.GBP+USD.EUR.SP00.A?startPeriod=2026-09-14&endPeriod=2026-09-25&format=csvdata&detail=dataonly');
  });

  it('decodes the bank CSV as exact text', () => {
    const rates = decoded();
    expect(rates).toHaveLength(6);
    expect(rates[0]).toEqual({ currency: 'GBP', day: '2026-09-18', rate: '0.8588' });
    expect(decoded([HEADER, ...LINES].join('\r\n'))).toEqual(rates);
    expect(decoded('')).toEqual([]);
    expect(decoded(HEADER)).toEqual([]);
    expect(decoded([HEADER, line('USD', '2026-09-18', '1.1460')].join('\n'))).toEqual([rate('USD', '2026-09-18', '1.146')]);
    expect(decoded([HEADER, line('USD', '2026-09-18', 'NaN'), line('USD', '2026-09-19', ''), line('USD', '2026-09-21', '1.149')].join('\n'))).toEqual([rate('USD', '2026-09-21', '1.149')]);
  });

  it('refuses a CSV it cannot trust', () => {
    const invalid = { ok: false, reason: 'invalid-response' };
    expect(decodeEcbReferenceRatesCsv(['KEY,FREQ,CURRENCY,CURRENCY_DENOM,EXR_TYPE,EXR_SUFFIX,TIME_PERIOD', 'EXR.D.USD.EUR.SP00.A,D,USD,EUR,SP00,A,2026-09-18'].join('\n'))).toEqual(invalid);
    expect(decodeEcbReferenceRatesCsv([HEADER, 'EXR.D.GBP.USD.SP00.A,D,GBP,USD,SP00,A,2026-09-18,0.8588'].join('\n'))).toEqual(invalid);
    expect(decodeEcbReferenceRatesCsv([HEADER, 'EXR.D.GBP.EUR.SP00.A,D,GBP,EUR,SP00,A,2026-09-18'].join('\n'))).toEqual(invalid);
  });

  it('asks once, with no credentials, redirects or cache', async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(csv, { status: 200 }));
    const request = { currencies: ['GBP', 'USD'], fromDay: '2026-09-14', toDay: '2026-09-25' };
    expect(await createEcbReferenceRatesPort(fetchImpl).acquireRates(request)).toEqual({ ok: true, rates: decoded() });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl).toHaveBeenCalledWith(ecbReferenceRatesUrl(request), expect.objectContaining({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' }));
  });

  it('says what failed', async () => {
    const request = { currencies: ['USD'], fromDay: '2026-09-14', toDay: '2026-09-25' };
    const notFound = vi.fn<typeof fetch>().mockResolvedValue(new Response('no', { status: 404 }));
    expect(await createEcbReferenceRatesPort(notFound).acquireRates(request)).toEqual({ ok: false, reason: 'http-error', status: 404 });
    const offline = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('offline'));
    expect(await createEcbReferenceRatesPort(offline).acquireRates(request)).toEqual({ ok: false, reason: 'transport-failed' });
  });

  it('gives up on a request still running after the time limit', async () => {
    vi.useFakeTimers();
    const hanging = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }));
    let settled: unknown = 'pending';
    const pending = createEcbReferenceRatesPort(hanging).acquireRates({ currencies: ['USD'], fromDay: '2026-09-14', toDay: '2026-09-25' }).then((result) => { settled = result; });
    await vi.advanceTimersByTimeAsync(ECB_REQUEST_TIMEOUT_MS - 1);
    expect(settled).toBe('pending');
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(settled).toEqual({ ok: false, reason: 'transport-failed' });
  });
});

describe('T-045d which rates to ask for', () => {
  it('knows which pairs the bank can give', () => {
    expect(ecbCanProvideRate('GBP', 'EUR')).toBe(true);
    expect(ecbCanProvideRate('USDT', 'EUR')).toBe(false);
    expect(ecbCanProvideRate('BTC', 'USD')).toBe(false);
    expect(ecbCanProvideRate('EUR', 'EUR')).toBe(false);
  });

  it('turns missing pairs into bank rows and one request', () => {
    const needs = ecbRateNeeds([{ from: 'GBP', to: 'USD', day: '2026-09-18' }, { from: 'EUR', to: 'USD', day: '2026-09-19' }, { from: 'USDT', to: 'USD', day: '2026-09-18' }]);
    expect(needs).toEqual([{ currency: 'GBP', day: '2026-09-18' }, { currency: 'USD', day: '2026-09-18' }, { currency: 'USD', day: '2026-09-19' }]);
    expect(Object.isFrozen(needs)).toBe(true);
    expect(planEcbRequest(needs, '2026-09-25')).toEqual({ currencies: ['GBP', 'USD'], fromDay: '2026-09-14', toDay: '2026-09-25' });
    expect(planEcbRequest([], '2026-09-25')).toBeNull();
  });
});

describe('T-045d which published rate a day uses', () => {
  const pick = (currency: string, day: string, published: readonly EcbReferenceRate[] = decoded()) => selectEcbRates([{ currency, day }], published, savedAt);

  it('uses the day own rate, else the last one before once a later one is published', () => {
    expect(pick('USD', '2026-09-18')).toEqual([{ id: 'ecb:EUR:USD:2026-09-18', source: 'ecb', from: 'EUR', to: 'USD', day: '2026-09-18', rateDay: '2026-09-18', rate: '1.146', savedAt }]);
    expect(pick('GBP', '2026-09-18')).toMatchObject([{ rate: '0.8588' }]);
    expect(pick('USD', '2026-09-19')).toMatchObject([{ id: 'ecb:EUR:USD:2026-09-19', rateDay: '2026-09-18', rate: '1.146' }]);
    expect(pick('USD', '2026-09-20')).toMatchObject([{ rateDay: '2026-09-18', rate: '1.146' }]);
    expect(pick('USD', '2026-09-25')).toMatchObject([{ rate: '1.1403' }]);
    expect(pick('USD', '2026-09-26')).toEqual([]);
  });

  it('covers Easter and never a longer gap, whatever the order', () => {
    const easter = [rate('USD', '2026-04-07', '1.1557'), rate('USD', '2026-04-02', '1.1525')];
    expect(pick('USD', '2026-04-03', easter)).toMatchObject([{ rateDay: '2026-04-02', rate: '1.1525' }]);
    expect(pick('USD', '2026-04-06', easter)).toMatchObject([{ rateDay: '2026-04-02', rate: '1.1525' }]);
    expect(pick('USD', '2026-09-15', [rate('USD', '2026-09-16', '1.15'), rate('USD', '2026-09-10', '1.14')])).toEqual([]);
  });

  it('builds only valid stored rows', () => {
    const records = selectEcbRates([{ currency: 'USD', day: '2026-09-19' }, { currency: 'GBP', day: '2026-09-18' }, { currency: 'USD', day: '2026-04-06' }], [...decoded(), rate('USD', '2026-04-02', '1.1525'), rate('USD', '2026-04-07', '1.1557')], savedAt);
    expect(records).toHaveLength(3);
    for (const record of records) expect(isExchangeRateRecordShape(record)).toBe(true);
  });
});

describe('T-045d fetching the missing rates', () => {
  const fixturePort = () => {
    const acquireRates = vi.fn<EcbReferenceRatesPort['acquireRates']>().mockResolvedValue({ ok: true, rates: decoded() });
    return { port: { acquireRates } as EcbReferenceRatesPort, acquireRates };
  };

  it('asks once and saves what the bank published', async () => {
    const db = await current('fetch');
    const { port, acquireRates } = fixturePort();
    const result = await fetchMissingEcbRates(db, port, [{ from: 'GBP', to: 'USD', day: '2026-09-18' }, { from: 'EUR', to: 'USD', day: '2026-09-26' }], { now: savedAt });
    expect(acquireRates).toHaveBeenCalledTimes(1);
    expect(acquireRates.mock.calls[0]![0]).toEqual({ currencies: ['GBP', 'USD'], fromDay: '2026-09-14', toDay: '2026-09-26' });
    expect(result).toEqual({ ok: true, saved: 2, notPublishedYet: [{ currency: 'USD', day: '2026-09-26' }] });
    expect((await db.exchangeRates.toArray()).map((row) => row.id).sort()).toEqual(['ecb:EUR:GBP:2026-09-18', 'ecb:EUR:USD:2026-09-18']);
  });

  it('writes nothing when the bank is unavailable', async () => {
    const db = await current('unavailable');
    const failing = { acquireRates: vi.fn().mockResolvedValue({ ok: false, reason: 'transport-failed' }) } as EcbReferenceRatesPort;
    const throwing = { acquireRates: vi.fn().mockRejectedValue(new Error('boom')) } as EcbReferenceRatesPort;
    const missing = [{ from: 'GBP', to: 'USD', day: '2026-09-18' }];
    expect(await fetchMissingEcbRates(db, failing, missing, { now: savedAt })).toEqual({ ok: false, reason: 'unavailable' });
    expect(await fetchMissingEcbRates(db, throwing, missing, { now: savedAt })).toEqual({ ok: false, reason: 'unavailable' });
    expect(await db.exchangeRates.count()).toBe(0);
  });

  it('does not ask when the bank cannot help, and reports a failed save', async () => {
    const db = await current('nothing');
    const { port, acquireRates } = fixturePort();
    expect(await fetchMissingEcbRates(db, port, [{ from: 'USDT', to: 'USD', day: '2026-09-18' }], { now: savedAt })).toEqual({ ok: false, reason: 'nothing-to-fetch' });
    expect(acquireRates).not.toHaveBeenCalled();
    vi.spyOn(db.exchangeRates, 'put').mockRejectedValue(new Error('disk full'));
    expect(await fetchMissingEcbRates(db, port, [{ from: 'GBP', to: 'USD', day: '2026-09-18' }], { now: savedAt })).toEqual({ ok: false, reason: 'storage-error' });
  });

  it('skips a day that is not a real calendar day, without asking or writing', async () => {
    for (const day of ['2026-02-30', 'abc']) {
      const db = await current(`bad-day-${day}`);
      const { port, acquireRates } = fixturePort();
      expect(await fetchMissingEcbRates(db, port, [{ from: 'GBP', to: 'EUR', day }], { now: savedAt })).toEqual({ ok: false, reason: 'nothing-to-fetch' });
      expect(acquireRates).not.toHaveBeenCalled();
      expect(await db.exchangeRates.count()).toBe(0);
    }
  });
});
