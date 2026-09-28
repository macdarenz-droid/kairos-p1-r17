export const PRICE_CURRENCY_INPUT_ERROR = 'Enter a currency code such as USD or USDT, without an amount, spaces or currency symbols. Leave blank if unknown.';

/** Manual input syntax only, not a currency registry or a symbol/amount parser.
 * Keep digit-bearing asset codes; require at least one letter and one compact code. */
export function isPriceCurrencyInput(value: string): boolean {
  const code = value.trim().toUpperCase();
  return code === '' || (/^[A-Z0-9]+$/.test(code) && /[A-Z]/.test(code));
}
