import { describe, expect, it } from 'vitest';
import { suggestHomeCurrency } from '../src/application/currency/homeCurrencySuggestion';

describe('T-053d the home currency suggested from the phone\'s region', () => {
  it('takes the first language tag\'s region, filling it in from the language', () => {
    expect(suggestHomeCurrency(['en-PH', 'en-US'])).toBe('PHP');
    expect(suggestHomeCurrency(['de-DE'])).toBe('EUR');
    expect(suggestHomeCurrency(['fr'])).toBe('EUR');
    expect(suggestHomeCurrency(['en-US'])).toBe('USD');
    expect(suggestHomeCurrency(['en-GB'])).toBe('GBP');
    expect(suggestHomeCurrency(['ja'])).toBe('JPY');
  });

  it('suggests nothing when the region\'s currency is not one the bank publishes, or there is no region', () => {
    expect(suggestHomeCurrency(['ar-EG'])).toBeNull();
    expect(suggestHomeCurrency(['not a tag!'])).toBeNull();
    expect(suggestHomeCurrency([])).toBeNull();
  });
});
