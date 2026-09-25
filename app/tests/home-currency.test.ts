import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { homeCurrencyMetadataKey, loadHomeCurrency, parseHomeCurrencyInput, saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { listExchangeRatesForDays, listSavedExchangeRates, parseTypedExchangeRate, saveTypedExchangeRate } from '../src/application/currency/exchangeRates';
import { createKairosDatabaseSnapshot } from '../src/data/backup';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { DecimalString } from '../src/domain/trades';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-home-currency-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const savedAt = '2026-09-19T08:00:00.000Z';
const now = () => savedAt;
const bank = (to: string, rate: string, day: string): ExchangeRateRecord => ({ id: exchangeRateId('ecb', 'EUR', to, day), source: 'ecb', from: 'EUR', to, day, rateDay: day, rate: rate as DecimalString, savedAt });
const typed = (from: string, to: string, rate: string, day: string): ExchangeRateRecord => ({ id: exchangeRateId('typed', from, to, day), source: 'typed', from, to, day, rateDay: day, rate: rate as DecimalString, savedAt });
const putRaw = (db: KairosDatabase, value: unknown) => db.metadata.put({ key: homeCurrencyMetadataKey, value: typeof value === 'string' ? value : JSON.stringify(value), updatedAt: savedAt });

describe('T-045c parseHomeCurrencyInput', () => {
  it('reads blank as not chosen and accepts a bank currency', () => {
    expect(parseHomeCurrencyInput({ currency: '', usdStablecoins: [] })).toEqual({ ok: true, preference: null });
    expect(parseHomeCurrencyInput({ currency: '  ', usdStablecoins: [] })).toEqual({ ok: true, preference: null });
    const eur = parseHomeCurrencyInput({ currency: ' eur ', usdStablecoins: [] });
    expect(eur).toEqual({ ok: true, preference: { currency: 'EUR', usdStablecoins: [] } });
    expect(Object.isFrozen(eur)).toBe(true);
    if (eur.ok && eur.preference) {
      expect(Object.isFrozen(eur.preference)).toBe(true);
      expect(Object.isFrozen(eur.preference.usdStablecoins)).toBe(true);
    }
  });

  it('refuses other currencies and bad coin lists, and orders the coins', () => {
    for (const currency of ['USDT', 'BTC', 'GBX']) {
      const result = parseHomeCurrencyInput({ currency, usdStablecoins: [] });
      expect(result).toEqual({ ok: false, reason: 'currency-invalid' });
      expect(Object.isFrozen(result)).toBe(true);
    }
    expect(parseHomeCurrencyInput({ currency: 'EUR', usdStablecoins: ['USDC', 'USDT'] })).toEqual({ ok: true, preference: { currency: 'EUR', usdStablecoins: ['USDT', 'USDC'] } });
    expect(parseHomeCurrencyInput({ currency: 'EUR', usdStablecoins: ['USDT', 'USDT'] })).toEqual({ ok: false, reason: 'stablecoin-invalid' });
    expect(parseHomeCurrencyInput({ currency: 'EUR', usdStablecoins: ['DAI'] })).toEqual({ ok: false, reason: 'stablecoin-invalid' });
  });
});

describe('T-045c the home currency preference', () => {
  it('reads null until saved, then reads what was saved', async () => {
    const db = await current('save');
    expect(await loadHomeCurrency(db)).toBeNull();
    expect(await saveHomeCurrency(db, { currency: 'eur', usdStablecoins: ['USDT'] }, { now })).toEqual({ ok: true, preference: { currency: 'EUR', usdStablecoins: ['USDT'] } });
    expect((await db.metadata.get(homeCurrencyMetadataKey))?.value).toBe('{"version":1,"currency":"EUR","usdStablecoins":["USDT"]}');
    expect(await loadHomeCurrency(db)).toEqual({ currency: 'EUR', usdStablecoins: ['USDT'] });
    const snapshot = await createKairosDatabaseSnapshot(db);
    expect(snapshot.payload.metadata.map((record) => record.key)).toContain(homeCurrencyMetadataKey);
  });

  it('reads a damaged record as not chosen', async () => {
    const db = await current('damaged');
    for (const value of [
      'not json',
      { version: 2, currency: 'EUR', usdStablecoins: [] },
      { version: 1, currency: 'EUR', usdStablecoins: [], extra: true },
      { version: 1, currency: 'usd', usdStablecoins: [] },
      { version: 1, currency: 'USDT', usdStablecoins: [] },
      { version: 1, currency: 'EUR', usdStablecoins: ['USDC', 'USDT'] },
    ]) {
      await putRaw(db, value);
      expect(await loadHomeCurrency(db)).toBeNull();
    }
  });

  it('removes the record when saved as not chosen', async () => {
    const db = await current('remove');
    await saveHomeCurrency(db, { currency: 'GBP', usdStablecoins: [] }, { now });
    expect(await saveHomeCurrency(db, { currency: '', usdStablecoins: [] }, { now })).toEqual({ ok: true, preference: null });
    expect(await db.metadata.get(homeCurrencyMetadataKey)).toBeUndefined();
  });

  it('writes nothing on a refusal and keeps the old value when the write fails', async () => {
    const db = await current('refuse');
    await saveHomeCurrency(db, { currency: 'GBP', usdStablecoins: [] }, { now });
    expect(await saveHomeCurrency(db, { currency: 'BTC', usdStablecoins: [] }, { now })).toEqual({ ok: false, type: 'validation-error', reason: 'currency-invalid' });
    expect(await loadHomeCurrency(db)).toEqual({ currency: 'GBP', usdStablecoins: [] });
    vi.spyOn(db.metadata, 'put').mockRejectedValue(new Error('disk full'));
    expect(await saveHomeCurrency(db, { currency: 'USD', usdStablecoins: [] }, { now })).toEqual({ ok: false, type: 'storage-error', reason: 'home-currency-save-failed' });
    vi.restoreAllMocks();
    expect(await loadHomeCurrency(db)).toEqual({ currency: 'GBP', usdStablecoins: [] });
  });
});

describe('T-045c typed exchange rates', () => {
  it('parses a typed rate into its stored record', () => {
    expect(parseTypedExchangeRate({ from: 'gbp', to: 'eur', day: '2026-09-18', rate: ' 1.1460 ' }, savedAt)).toEqual({
      ok: true,
      record: { id: 'typed:GBP:EUR:2026-09-18', source: 'typed', from: 'GBP', to: 'EUR', day: '2026-09-18', rateDay: '2026-09-18', rate: '1.146', savedAt },
    });
    expect(parseTypedExchangeRate({ from: 'JPY', to: 'EUR', day: '2026-09-18', rate: '0.0055' }, savedAt)).toMatchObject({ ok: true, record: { rate: '0.0055' } });
  });

  it('refuses a bad rate, pair or day', () => {
    const input = { from: 'GBP', to: 'EUR', day: '2026-09-18' };
    for (const rate of ['0', '-1', 'abc', '1e3', '1234567890123', '0.1234567890123']) {
      expect(parseTypedExchangeRate({ ...input, rate }, savedAt)).toEqual({ ok: false, reason: 'rate-invalid' });
    }
    expect(parseTypedExchangeRate({ ...input, to: 'GBP', rate: '1' }, savedAt)).toEqual({ ok: false, reason: 'pair-invalid' });
    expect(parseTypedExchangeRate({ ...input, from: '50 USD', rate: '1' }, savedAt)).toEqual({ ok: false, reason: 'pair-invalid' });
    expect(parseTypedExchangeRate({ ...input, from: 'ABCDEFGHIJKLM', rate: '1' }, savedAt)).toEqual({ ok: false, reason: 'pair-invalid' });
    expect(parseTypedExchangeRate({ ...input, day: '2026-02-30', rate: '1' }, savedAt)).toEqual({ ok: false, reason: 'day-invalid' });
  });

  it('saves one row per pair and day, replaces it when typed again, and keeps a bank row beside it', async () => {
    const db = await current('typed');
    expect(await saveTypedExchangeRate(db, { from: 'GBP', to: 'EUR', day: '2026-09-18', rate: '1.146' }, { now })).toMatchObject({ ok: true });
    expect(await db.exchangeRates.count()).toBe(1);
    await saveTypedExchangeRate(db, { from: 'GBP', to: 'EUR', day: '2026-09-18', rate: '1.17' }, { now });
    expect(await db.exchangeRates.toArray()).toEqual([typed('GBP', 'EUR', '1.17', '2026-09-18')]);
    await db.exchangeRates.put(bank('GBP', '0.8588', '2026-09-18'));
    expect(await db.exchangeRates.count()).toBe(2);
    expect(await saveTypedExchangeRate(db, { from: 'GBP', to: 'EUR', day: '2026-02-30', rate: '1' }, { now })).toEqual({ ok: false, type: 'validation-error', reason: 'day-invalid' });
    expect(await db.exchangeRates.count()).toBe(2);
  });

  it('reads the rates of some days, leaving damaged rows out, and lists every rate in order', async () => {
    const db = await current('reads');
    await db.exchangeRates.bulkPut([
      bank('USD', '1.146', '2026-09-18'),
      typed('GBP', 'EUR', '1.17', '2026-09-18'),
      bank('USD', '1.1481', '2026-09-17'),
      bank('GBP', '0.8588', '2026-09-18'),
      typed('EUR', 'USD', '1.2', '2026-09-18'),
      { ...bank('JPY', '180.94', '2026-09-18'), rate: '0' as DecimalString },
    ]);
    const day = await listExchangeRatesForDays(db, ['2026-09-18']);
    expect(day.map((rate) => rate.id).sort()).toEqual(['ecb:EUR:GBP:2026-09-18', 'ecb:EUR:USD:2026-09-18', 'typed:EUR:USD:2026-09-18', 'typed:GBP:EUR:2026-09-18']);
    expect(Object.isFrozen(day)).toBe(true);
    expect(await listExchangeRatesForDays(db, [])).toEqual([]);
    const all = await listSavedExchangeRates(db);
    expect(all.map((rate) => rate.id)).toEqual([
      'ecb:EUR:GBP:2026-09-18',
      'ecb:EUR:USD:2026-09-18',
      'typed:EUR:USD:2026-09-18',
      'typed:GBP:EUR:2026-09-18',
      'ecb:EUR:USD:2026-09-17',
    ]);
    expect(Object.isFrozen(all)).toBe(true);
  });
});
