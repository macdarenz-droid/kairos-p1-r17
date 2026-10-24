import { useId } from 'react';

interface Props {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly disabled?: boolean;
  readonly recorded?: boolean;
  readonly error?: string;
  /** U14 (D254): Kairos filled the code from this crypto market's quote asset. */
  readonly filledFrom?: Readonly<{ symbol: string; currency: string }> | null;
}

/**
 * Presentation only: the user supplies the unit, except a forex pair's quote currency (P31, prepareManualTradeSubmission)
 * and, while the code is blank or was filled by Kairos, a listed crypto market's quote asset (U14, D254), which says so.
 */
export function JournalPriceCurrencyField({ value, onChange, disabled, recorded, error, filledFrom = null }: Props) {
  const id = useId();
  return <fieldset className="kairos-trade-form__section" disabled={disabled}>
    <legend>Price currency <span>Optional</span></legend>
    <label className="kairos-field" htmlFor={`${id}-currency`}>
      <span id={`${id}-label`}>Currency code</span>
      <input id={`${id}-currency`} value={value} onChange={event => onChange(event.target.value)} readOnly={recorded}
        autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="USD or USDT" aria-labelledby={`${id}-label`} aria-invalid={Boolean(error) || undefined} aria-describedby={`${filledFrom ? `${id}-filled ` : ''}${id}-hint${error ? ` ${id}-error` : ''}`} />
      {filledFrom ? <small id={`${id}-filled`}>Filled from {filledFrom.symbol}: prices are in {filledFrom.currency}. You can change it.</small> : null}
      <small id={`${id}-hint`}>{recorded ? 'Recorded with this trade. New entries and exits keep this currency.' : 'Enter only the currency code for your prices, such as USD or USDT. This field does not record a profit amount. Leave blank if unknown. Fees need matching currencies.'}</small>
      {error ? <small id={`${id}-error`}>{error}</small> : null}
    </label>
  </fieldset>;
}
