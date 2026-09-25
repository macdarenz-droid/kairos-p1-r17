/**
 * P33: which European Central Bank rates Kairos asks for, and which published rate a trade's close day uses (D112, D113).
 * A day's own rate first; for a day with none (weekends and the bank's holidays), its last rate before, at most
 * ECB_RATE_MAX_AGE_DAYS days before, and only once the bank has published a rate after that day, so a late rate is never
 * replaced by an older one. Nothing is fetched unless the trader asks. The port type comes from services (D31); the
 * composition root builds the port.
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { ECB_RATE_MAX_AGE_DAYS, exchangeRateId, isEcbReferenceCurrency, type ExchangeRateRecord } from '../../domain/calculations/currencyConversion';
import type { EcbReferenceRate, EcbReferenceRateRequest, EcbReferenceRatesPort } from '../../services/exchange-rates/ecbReferenceRates';
import { projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import { shiftVisualPnlDayKey } from '../visual-pnl/dayKeyCalendar';

export type { EcbReferenceRatesPort } from '../../services/exchange-rates/ecbReferenceRates';

/** One bank rate Kairos needs: 1 EUR = ? `currency`, for trades closed on `day` (UTC). */
export interface EcbRateNeed { readonly currency: string; readonly day: string }
export type FetchEcbRatesResult =
  | Readonly<{ ok: true; saved: number; notPublishedYet: readonly EcbRateNeed[] }>
  | Readonly<{ ok: false; reason: 'nothing-to-fetch' | 'unavailable' | 'storage-error' }>;
type MissingPair = { readonly from: string; readonly to: string; readonly day: string };

/** The bank can give a rate between two currencies it publishes. */
export function ecbCanProvideRate(from: string, to: string): boolean {
  return from !== to && isEcbReferenceCurrency(from) && isEcbReferenceCurrency(to);
}

/** The bank rows behind missing pairs: one per currency (never EUR) and day, sorted by day, then currency. */
export function ecbRateNeeds(missing: readonly MissingPair[]): readonly EcbRateNeed[] {
  const keys = new Map<string, EcbRateNeed>();
  const add = (currency: string, day: string) => {
    if (currency !== 'EUR') keys.set(`${day}:${currency}`, Object.freeze({ currency, day }));
  };
  for (const pair of missing) {
    if (!ecbCanProvideRate(pair.from, pair.to)) continue;
    add(pair.from, pair.day);
    add(pair.to, pair.day);
  }
  const needs = [...keys.values()].sort((left, right) => left.day.localeCompare(right.day) || left.currency.localeCompare(right.currency));
  return Object.freeze(needs);
}

/** One request for every need: from ECB_RATE_MAX_AGE_DAYS before the first day to today (UTC); null when nothing is needed. */
export function planEcbRequest(needs: readonly EcbRateNeed[], todayKey: string): EcbReferenceRateRequest | null {
  if (needs.length === 0) return null;
  const currencies = [...new Set(needs.map((need) => need.currency))].sort();
  const earliest = needs.map((need) => need.day).sort()[0];
  return Object.freeze({ currencies: Object.freeze(currencies), fromDay: shiftVisualPnlDayKey(earliest, -ECB_RATE_MAX_AGE_DAYS), toDay: todayKey });
}

/** The stored rows for the needs the published rates cover, by the rule above. */
export function selectEcbRates(needs: readonly EcbRateNeed[], published: readonly EcbReferenceRate[], savedAt: string): readonly ExchangeRateRecord[] {
  const records: ExchangeRateRecord[] = [];
  for (const need of needs) {
    const ofCurrency = published.filter((rate) => rate.currency === need.currency);
    let chosen = ofCurrency.find((rate) => rate.day === need.day);
    if (chosen === undefined) {
      const oldest = shiftVisualPnlDayKey(need.day, -ECB_RATE_MAX_AGE_DAYS);
      const before = ofCurrency.filter((rate) => rate.day < need.day && oldest <= rate.day).sort((left, right) => right.day.localeCompare(left.day))[0];
      const publishedAfter = ofCurrency.some((rate) => rate.day > need.day);
      if (before !== undefined && publishedAfter) chosen = before;
    }
    if (chosen === undefined) continue;
    records.push(Object.freeze({ id: exchangeRateId('ecb', 'EUR', need.currency, need.day), source: 'ecb' as const, from: 'EUR', to: need.currency, day: need.day, rateDay: chosen.day, rate: chosen.rate, savedAt }));
  }
  return Object.freeze(records);
}

/** Asks the bank once for every missing rate, then saves what it published in one atomic write. A failed request writes nothing. */
export async function fetchMissingEcbRates(
  db: KairosDatabase,
  port: EcbReferenceRatesPort,
  missing: readonly MissingPair[],
  options: { readonly now: string; readonly signal?: AbortSignal },
): Promise<FetchEcbRatesResult> {
  const needs = ecbRateNeeds(missing);
  if (needs.length === 0) return Object.freeze({ ok: false as const, reason: 'nothing-to-fetch' as const });
  const today = projectVisualPnlDayKey(options.now, 'UTC');
  if (!today.available) return Object.freeze({ ok: false as const, reason: 'unavailable' as const });
  const request = planEcbRequest(needs, today.dayKey);
  if (request === null) return Object.freeze({ ok: false as const, reason: 'nothing-to-fetch' as const });
  let published: readonly EcbReferenceRate[];
  try {
    const result = await port.acquireRates(request, { signal: options.signal });
    if (!result.ok) return Object.freeze({ ok: false as const, reason: 'unavailable' as const });
    published = result.rates;
  } catch {
    return Object.freeze({ ok: false as const, reason: 'unavailable' as const });
  }
  const records = selectEcbRates(needs, published, options.now);
  if (records.length > 0) {
    try {
      await runKairosAtomicWrite(db, ['exchangeRates'], async ({ repositories }) => {
        for (const record of records) await repositories.exchangeRates.put(record);
      });
    } catch {
      return Object.freeze({ ok: false as const, reason: 'storage-error' as const });
    }
  }
  const covered = new Set(records.map((record) => record.id));
  const notPublishedYet = Object.freeze(needs.filter((need) => !covered.has(exchangeRateId('ecb', 'EUR', need.currency, need.day))));
  return Object.freeze({ ok: true as const, saved: records.length, notPublishedYet });
}
