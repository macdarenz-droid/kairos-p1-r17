/**
 * P33: the European Central Bank's data API for its daily euro reference rates (keyless, open to every web origin; checked
 * 2026-09-25). Transport and CSV decoding only: which days and currencies to ask for, and which rate a trade uses, belong to
 * application/currency/ecbRates.ts. Rates are read as exact text, never as JavaScript numbers.
 */
import { decimalNormalize } from '../../domain/calculations/decimalKernel';
import { parsePositiveDecimalString, type DecimalString } from '../../domain/trades';

export const ECB_EXCHANGE_RATE_DATA_URL = 'https://data-api.ecb.europa.eu/service/data/EXR';
/** A request still running after this long is given up, so the page never waits forever (golden rule 8). */
export const ECB_REQUEST_TIMEOUT_MS = 20_000;

export interface EcbReferenceRateRequest { readonly currencies: readonly string[]; readonly fromDay: string; readonly toDay: string }
/** 1 EUR = rate `currency`, as the bank published it for `day`. */
export interface EcbReferenceRate { readonly currency: string; readonly day: string; readonly rate: DecimalString }
export type EcbReferenceRatesResult =
  | Readonly<{ ok: true; rates: readonly EcbReferenceRate[] }>
  | Readonly<{ ok: false; reason: 'transport-failed' | 'invalid-response' }>
  | Readonly<{ ok: false; reason: 'http-error'; status: number }>;
export interface EcbReferenceRatesPort {
  acquireRates(request: EcbReferenceRateRequest, options?: { readonly signal?: AbortSignal }): Promise<EcbReferenceRatesResult>;
}

export function ecbReferenceRatesUrl(request: EcbReferenceRateRequest): string {
  return `${ECB_EXCHANGE_RATE_DATA_URL}/D.${request.currencies.join('+')}.EUR.SP00.A?startPeriod=${request.fromDay}&endPeriod=${request.toDay}&format=csvdata&detail=dataonly`;
}

const invalid = Object.freeze({ ok: false as const, reason: 'invalid-response' as const });

/** The bank's CSV: a header line, then one line per currency and working day. A line with no published value is left out, never read as 0 or 1. */
export function decodeEcbReferenceRatesCsv(body: string): EcbReferenceRatesResult {
  const lines = body.split(/\r?\n/).map((line) => line.trim()).filter((line) => line !== '');
  if (lines.length === 0) return Object.freeze({ ok: true as const, rates: Object.freeze([]) });
  const header = lines[0].split(',');
  const currencyAt = header.indexOf('CURRENCY'), denominatorAt = header.indexOf('CURRENCY_DENOM'), dayAt = header.indexOf('TIME_PERIOD'), valueAt = header.indexOf('OBS_VALUE');
  if (currencyAt < 0 || denominatorAt < 0 || dayAt < 0 || valueAt < 0) return invalid;
  const rates: EcbReferenceRate[] = [];
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    if (cells.length !== header.length) return invalid;
    const currency = cells[currencyAt], day = cells[dayAt];
    if (cells[denominatorAt] !== 'EUR' || !/^[A-Z]{3}$/.test(currency) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return invalid;
    const value = parsePositiveDecimalString(cells[valueAt]);
    const shortest = value.ok ? decimalNormalize(value.value) : null;
    if (shortest === null || !shortest.ok) continue;
    rates.push(Object.freeze({ currency, day, rate: shortest.value }));
  }
  return Object.freeze({ ok: true as const, rates: Object.freeze(rates) });
}

/** The browser port. No credentials, no redirects, no cache, no retries: the caller retries on the trader's tap. A request still running after ECB_REQUEST_TIMEOUT_MS is aborted and reads as 'transport-failed'. */
export function createEcbReferenceRatesPort(fetchImpl: typeof fetch = globalThis.fetch.bind(globalThis)): EcbReferenceRatesPort {
  return Object.freeze({
    async acquireRates(request: EcbReferenceRateRequest, options?: { readonly signal?: AbortSignal }): Promise<EcbReferenceRatesResult> {
      // The time limit and the caller's signal abort one controller.
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), ECB_REQUEST_TIMEOUT_MS);
      const onAbort = () => controller.abort();
      options?.signal?.addEventListener('abort', onAbort, { once: true });
      if (options?.signal?.aborted) controller.abort();
      try {
        let response: Response;
        try {
          response = await fetchImpl(ecbReferenceRatesUrl(request), { method: 'GET', signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'no-store' });
        } catch {
          return Object.freeze({ ok: false as const, reason: 'transport-failed' as const });
        }
        if (!response.ok) return Object.freeze({ ok: false as const, reason: 'http-error' as const, status: response.status });
        let body: string;
        try { body = await response.text(); } catch { return Object.freeze({ ok: false as const, reason: 'transport-failed' as const }); }
        return decodeEcbReferenceRatesCsv(body);
      } finally {
        globalThis.clearTimeout(timeoutId);
        options?.signal?.removeEventListener('abort', onAbort);
      }
    },
  });
}
