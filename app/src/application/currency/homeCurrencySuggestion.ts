/**
 * T-053d (D222): a home currency to suggest in the setup, from the phone's region. Only a suggestion: nothing is saved
 * until the trader taps. A region missing here, or one whose currency the European Central Bank does not publish,
 * gives no suggestion; Kairos never guesses one.
 */

import { isEcbReferenceCurrency, type EcbReferenceCurrency } from '../../domain/calculations/currencyConversion';

/** The euro area (the 21 members on 1 January 2026, Bulgaria the newest), and the states that use the euro by agreement or alone. */
const EURO = ['AT', 'BE', 'BG', 'CY', 'DE', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PT', 'SI', 'SK', 'AD', 'MC', 'SM', 'VA', 'ME', 'XK'] as const;

/** Each region's own currency, for the bank's other 29 currencies (ISO 3166 region → ISO 4217 code). */
const REGION_CURRENCY: Readonly<Record<string, string>> = Object.freeze({
  ...Object.fromEntries(EURO.map((region) => [region, 'EUR'])),
  AU: 'AUD', BR: 'BRL', CA: 'CAD', CH: 'CHF', LI: 'CHF', CN: 'CNY', CZ: 'CZK', DK: 'DKK', FO: 'DKK', GL: 'DKK',
  GB: 'GBP', GG: 'GBP', IM: 'GBP', JE: 'GBP', HK: 'HKD', HU: 'HUF', ID: 'IDR', IL: 'ILS', IN: 'INR', IS: 'ISK',
  JP: 'JPY', KR: 'KRW', MX: 'MXN', MY: 'MYR', NO: 'NOK', NZ: 'NZD', PH: 'PHP', PL: 'PLN', RO: 'RON', SE: 'SEK',
  SG: 'SGD', TH: 'THB', TR: 'TRY', US: 'USD', PR: 'USD', GU: 'USD', VI: 'USD', AS: 'USD', MP: 'USD', EC: 'USD',
  SV: 'USD', ZA: 'ZAR',
});

/** The region a language tag names, filling it in from the language when the tag has none ("fr" → FR). */
function regionOf(tag: string): string | null {
  try {
    return new Intl.Locale(tag).maximize().region ?? null;
  } catch {
    return null;
  }
}

/** The currency of the first tag's region (`navigator.languages`), or null. */
export function suggestHomeCurrency(languageTags: readonly string[]): EcbReferenceCurrency | null {
  const first = languageTags[0];
  if (first === undefined) return null;
  const region = regionOf(first);
  const currency = region === null ? undefined : REGION_CURRENCY[region];
  return currency !== undefined && isEcbReferenceCurrency(currency) ? currency : null;
}
