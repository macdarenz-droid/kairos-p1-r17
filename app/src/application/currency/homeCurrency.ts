/**
 * P33: the trader's home currency, the one currency Kairos shows totals in, and the coins they choose to count as US dollars.
 * One metadata preference, like the goals (goalsPreference.ts), practice money (D54) and strategies (D75): no schema change,
 * in every full backup, brought back by a full restore, left alone by a merge import. A missing or damaged record reads as
 * 'not chosen' (nothing is converted), and the next save replaces it.
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import { USD_STABLECOINS, isEcbReferenceCurrency, type EcbReferenceCurrency, type UsdStablecoin } from '../../domain/calculations/currencyConversion';

export const homeCurrencyMetadataKey = 'preferences.home-currency.v1';
export interface HomeCurrencyPreference { readonly currency: EcbReferenceCurrency; readonly usdStablecoins: readonly UsdStablecoin[] }
export interface HomeCurrencyInput { readonly currency: string; readonly usdStablecoins: readonly string[] }
export type HomeCurrencyInvalidReason = 'currency-invalid' | 'stablecoin-invalid';
export type SaveHomeCurrencyResult =
  | { readonly ok: true; readonly preference: HomeCurrencyPreference | null }
  | { readonly ok: false; readonly type: 'validation-error'; readonly reason: HomeCurrencyInvalidReason }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'home-currency-save-failed' };

const STORED_KEYS = 'currency,usdStablecoins,version';

/** A blank currency is "not chosen" (null). Otherwise one of the bank's currencies, with each coin once, in USD_STABLECOINS order. */
export function parseHomeCurrencyInput(input: HomeCurrencyInput): Readonly<{ ok: true; preference: HomeCurrencyPreference | null } | { ok: false; reason: HomeCurrencyInvalidReason }> {
  const currency = input.currency.trim().toUpperCase();
  if (currency === '') return Object.freeze({ ok: true as const, preference: null });
  if (!isEcbReferenceCurrency(currency)) return Object.freeze({ ok: false as const, reason: 'currency-invalid' as const });
  const known = input.usdStablecoins.every((coin) => (USD_STABLECOINS as readonly string[]).includes(coin));
  if (!known || new Set(input.usdStablecoins).size !== input.usdStablecoins.length) return Object.freeze({ ok: false as const, reason: 'stablecoin-invalid' as const });
  const usdStablecoins = Object.freeze(USD_STABLECOINS.filter((coin) => input.usdStablecoins.includes(coin)));
  return Object.freeze({ ok: true as const, preference: Object.freeze({ currency, usdStablecoins }) });
}

/** The stored preference; a missing or damaged record reads as null. Never writes. */
export async function readHomeCurrency(metadata: MetadataRepository): Promise<HomeCurrencyPreference | null> {
  const stored = await metadata.get(homeCurrencyMetadataKey);
  if (!stored) return null;
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || Object.keys(record).sort().join(',') !== STORED_KEYS) return null;
    if (typeof record.currency !== 'string' || !Array.isArray(record.usdStablecoins) || !record.usdStablecoins.every((coin) => typeof coin === 'string')) return null;
    const coins = record.usdStablecoins as string[];
    const result = parseHomeCurrencyInput({ currency: record.currency, usdStablecoins: coins });
    if (!result.ok || result.preference === null || result.preference.currency !== record.currency) return null;
    if (result.preference.usdStablecoins.join(',') !== coins.join(',')) return null;
    return result.preference;
  } catch {
    return null;
  }
}

/** The home currency for screens, which never import data/repositories. */
export function loadHomeCurrency(db: KairosDatabase): Promise<HomeCurrencyPreference | null> {
  return readHomeCurrency(createKairosRepositories(db).metadata);
}

/** Validates first and writes nothing on a refusal; a valid save is one atomic metadata write, and "not chosen" removes the record. */
export async function saveHomeCurrency(db: KairosDatabase, input: HomeCurrencyInput, dependencies: { readonly now?: () => string } = {}): Promise<SaveHomeCurrencyResult> {
  const parsed = parseHomeCurrencyInput(input);
  if (!parsed.ok) return { ok: false, type: 'validation-error', reason: parsed.reason };
  const now = dependencies.now ?? (() => new Date().toISOString());
  const preference = parsed.preference;
  try {
    const updatedAt = now();
    await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      if (preference === null) await repositories.metadata.delete(homeCurrencyMetadataKey);
      else await repositories.metadata.put({ key: homeCurrencyMetadataKey, value: JSON.stringify({ version: 1, currency: preference.currency, usdStablecoins: preference.usdStablecoins }), updatedAt });
    });
    return { ok: true, preference };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'home-currency-save-failed' };
  }
}
