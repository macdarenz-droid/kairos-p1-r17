import { describe, expect, it } from 'vitest';
import {
  convertCurrencyAmount,
  exchangeRateId,
  isExchangeRateRecordShape,
  type CurrencyConversionInput,
  type ExchangeRateRecord,
  type UsdStablecoin,
} from '../src/domain/calculations/currencyConversion';
import { assessNetPnlCurrencyCompatibility } from '../src/domain/calculations/netPnlCurrencyPolicy';
import { calculateComparableNetPnl } from '../src/domain/calculations/netPnlComposition';
import { calculateTradeMetrics } from '../src/domain/calculations';
import { projectVisualPnlOutcome } from '../src/application/visual-pnl';
import {
  parseDecimalString,
  type DecimalString,
  type TradeExecutionId,
  type TradeExecutionRecord,
  type TradeFeeId,
  type TradeFeeRecord,
  type TradeId,
} from '../src/domain/trades';

const savedAt = '2026-09-19T08:00:00.000Z';
const DAY = '2026-09-18';

function ecb(to: string, rate: string, day = DAY, rateDay = day): ExchangeRateRecord {
  return { id: exchangeRateId('ecb', 'EUR', to, day), source: 'ecb', from: 'EUR', to, day, rateDay, rate: rate as DecimalString, savedAt };
}
function typed(from: string, to: string, rate: string, day = DAY): ExchangeRateRecord {
  return { id: exchangeRateId('typed', from, to, day), source: 'typed', from, to, day, rateDay: day, rate: rate as DecimalString, savedAt };
}
const BANK = [ecb('USD', '1.146'), ecb('GBP', '0.8588'), ecb('JPY', '180.94')];

function convert(amount: string, currency: string, target: string, rates: readonly ExchangeRateRecord[] = BANK, usdStablecoins: readonly UsdStablecoin[] = [], day = DAY) {
  const input: CurrencyConversionInput = { amount: amount as DecimalString, currency, day, target, usdStablecoins, rates };
  return convertCurrencyAmount(input);
}

function dec(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`fixture decimal ${value}`);
  return parsed.value;
}
const tradeId = 'trade-1' as TradeId;
function fill(id: string, type: 'entry' | 'exit', price: string, quantity: string, executedAt: string): TradeExecutionRecord {
  return { id: id as TradeExecutionId, tradeId, type, price: dec(price), quantity: dec(quantity), executedAt, createdAt: executedAt };
}
function fee(amount: string, currency: string): TradeFeeRecord {
  return { id: 'fee-1' as TradeFeeId, tradeId, executionId: null, amount: dec(amount), currency, createdAt: '2026-09-20T12:00:00.000Z' };
}

describe('P33.1 converting a result: bank rates through the euro', () => {
  it('converts EUR to USD with the bank rate of the day, rounded half up to 2 places', () => {
    expect(convert('24.5', 'EUR', 'USD')).toEqual({
      ok: true,
      amount: '28.08',
      currency: 'USD',
      steps: [{ kind: 'ecb-rate', from: 'EUR', to: 'USD', day: DAY, rateDay: DAY, eurFrom: null, eurTo: '1.146' }],
    });
    expect(convert('-24.5', 'EUR', 'USD')).toMatchObject({ ok: true, amount: '-28.08' });
  });

  it('crosses two bank rates through the euro', () => {
    expect(convert('50', 'GBP', 'USD')).toMatchObject({
      ok: true,
      amount: '66.72',
      steps: [{ kind: 'ecb-rate', from: 'GBP', to: 'USD', eurFrom: '0.8588', eurTo: '1.146' }],
    });
    expect(convert('60', 'USD', 'EUR')).toMatchObject({
      ok: true,
      amount: '52.36',
      currency: 'EUR',
      steps: [{ kind: 'ecb-rate', from: 'USD', to: 'EUR', eurFrom: '1.146', eurTo: null }],
    });
    expect(convert('1250', 'JPY', 'USD')).toMatchObject({ ok: true, amount: '7.92' });
  });
});

describe('P33.1 converting a result: pence and stablecoins', () => {
  it('turns pence into pounds exactly before a bank rate', () => {
    const result = convert('5000', 'GBX', 'USD');
    expect(result).toMatchObject({ ok: true, amount: '66.72' });
    if (!result.ok) throw new Error('expected ok');
    expect(result.steps.map((step) => step.kind)).toEqual(['pence', 'ecb-rate']);
    expect(result.steps[1]).toMatchObject({ from: 'GBP', to: 'USD' });
    expect(convert('1250', 'GBX', 'GBP')).toEqual({ ok: true, amount: '12.5', currency: 'GBP', steps: [{ kind: 'pence', from: 'GBX', to: 'GBP' }] });
  });

  it('counts a stablecoin as US dollars only when the trader chose it', () => {
    expect(convert('12.345678', 'USDT', 'USD', BANK, ['USDT'])).toEqual({
      ok: true,
      amount: '12.345678',
      currency: 'USD',
      steps: [{ kind: 'stablecoin', from: 'USDT', to: 'USD' }],
    });
    const toEuro = convert('100', 'USDT', 'EUR', BANK, ['USDT']);
    expect(toEuro).toMatchObject({ ok: true, amount: '87.26' });
    if (!toEuro.ok) throw new Error('expected ok');
    expect(toEuro.steps.map((step) => step.kind)).toEqual(['stablecoin', 'ecb-rate']);
    expect(toEuro.steps[1]).toMatchObject({ from: 'USD' });
    expect(convert('10', 'USDT', 'USD', BANK, [])).toEqual({ ok: false, reason: 'missing-rate', from: 'USDT', to: 'USD', day: DAY });
    expect(convert('10', 'USDC', 'EUR', BANK, ['USDT'])).toMatchObject({ ok: false, reason: 'missing-rate', from: 'USDC' });
  });
});

describe('P33.1 converting a result: typed rates, missing rates and refusals', () => {
  it('uses the trader typed rate first', () => {
    expect(convert('0.01', 'BTC', 'USD', [typed('BTC', 'USD', '63000.5')])).toEqual({
      ok: true,
      amount: '630.01',
      currency: 'USD',
      steps: [{ kind: 'typed-rate', from: 'BTC', to: 'USD', day: DAY, rate: '63000.5' }],
    });
    expect(convert('24.5', 'EUR', 'USD', [typed('EUR', 'USD', '1.2'), ...BANK])).toMatchObject({ ok: true, amount: '29.4', steps: [{ kind: 'typed-rate' }] });
  });

  it('never uses another day and never 1', () => {
    expect(convert('24.5', 'EUR', 'USD', [ecb('USD', '1.1481', '2026-09-17')])).toEqual({ ok: false, reason: 'missing-rate', from: 'EUR', to: 'USD', day: DAY });
    expect(convert('50', 'GBP', 'USD', [ecb('USD', '1.146')])).toMatchObject({ ok: false, reason: 'missing-rate', from: 'GBP' });
    const mixed = [ecb('GBP', '0.8588', '2026-09-19', '2026-09-18'), ecb('USD', '1.149', '2026-09-19', '2026-09-19')];
    expect(convert('50', 'GBP', 'USD', mixed, [], '2026-09-19')).toMatchObject({ ok: false, reason: 'missing-rate', day: '2026-09-19' });
  });

  it('returns the same currency unchanged and refuses bad input', () => {
    expect(convert('25', 'USD', 'USD')).toEqual({ ok: true, amount: '25', currency: 'USD', steps: [] });
    expect(convert('25', '50 USD', 'EUR')).toEqual({ ok: false, reason: 'invalid-currency' });
    expect(convert('25', 'usd', 'EUR')).toEqual({ ok: false, reason: 'invalid-currency' });
    expect(convert('abc', 'EUR', 'USD')).toEqual({ ok: false, reason: 'invalid-decimal' });
  });

  it('freezes every result and its steps', () => {
    for (const result of [convert('5000', 'GBX', 'USD'), convert('10', 'USDT', 'USD'), convert('abc', 'EUR', 'USD'), convert('25', 'USD', 'USD')]) {
      expect(Object.isFrozen(result)).toBe(true);
      if (result.ok) {
        expect(Object.isFrozen(result.steps)).toBe(true);
        for (const step of result.steps) expect(Object.isFrozen(step)).toBe(true);
      }
    }
  });
});

describe('P33.1 the stored shape of an exchange rate', () => {
  it('accepts bank and typed rows', () => {
    expect(isExchangeRateRecordShape(ecb('USD', '1.146'))).toBe(true);
    expect(isExchangeRateRecordShape(typed('GBP', 'EUR', '1.17'))).toBe(true);
    expect(isExchangeRateRecordShape(ecb('USD', '1.1525', '2026-04-06', '2026-04-02'))).toBe(true);
  });

  it('refuses damaged rows', () => {
    const { savedAt: _dropped, ...noSavedAt } = ecb('USD', '1.146');
    const bad: unknown[] = [
      { ...ecb('USD', '1.146'), extra: 1 },
      noSavedAt,
      { ...ecb('USD', '1.146'), savedAt: '2026-09-19' },
      { ...ecb('USD', '1.146'), from: 'USD', to: 'JPY', id: exchangeRateId('ecb', 'USD', 'JPY', DAY) },
      { ...ecb('EUR', '1'), to: 'EUR' },
      ecb('USDT', '1.146'),
      ecb('USD', '1.146', DAY, '2026-09-19'),
      ecb('USD', '1.146', DAY, '2026-09-13'),
      { ...typed('GBP', 'EUR', '1.17'), rateDay: '2026-09-17' },
      ecb('USD', '0'),
      ecb('USD', '-1'),
      ecb('USD', '1.1460'),
      typed('GBP', 'GBP', '1'),
      ecb('USD', '1.146', '2026-02-30', '2026-02-30'),
      { ...ecb('USD', '1.146'), id: 'ecb:EUR:USD:2026-09-17' },
      { ...ecb('USD', '1.146'), source: 'frankfurter', id: 'frankfurter:EUR:USD:2026-09-18' },
    ];
    for (const value of bad) expect(isExchangeRateRecordShape(value)).toBe(false);
  });
});

describe('P33.1 fees in pounds on a trade in pence', () => {
  it('treats pence and pounds as the same money', () => {
    expect(assessNetPnlCurrencyCompatibility(dec('10'), 'GBX', 'GBP')).toEqual({ ok: true, compatible: true, basis: 'pence-and-pounds' });
  });

  it('counts a fee in pounds on a trade in pence, exactly', () => {
    const result = calculateTradeMetrics(
      'long',
      [fill('e1', 'entry', '70', '1000', '2026-09-20T09:00:00.000Z'), fill('x1', 'exit', '75', '1000', '2026-09-20T12:00:00.000Z')],
      undefined,
      [fee('10', 'GBP')],
      { grossPnlCurrency: 'GBX' },
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.value).toMatchObject({ grossPnl: '5000', netPnl: '4000', netPnlCurrency: 'GBX' });
    expect(projectVisualPnlOutcome(result.value)).toMatchObject({ outcome: 'profit', amount: '4000', currency: 'GBX' });
  });

  it('counts a fee in pence on a trade in pounds', () => {
    const result = calculateTradeMetrics(
      'long',
      [fill('e1', 'entry', '10', '10', '2026-09-20T09:00:00.000Z'), fill('x1', 'exit', '15', '10', '2026-09-20T12:00:00.000Z')],
      undefined,
      [fee('250', 'GBX')],
      { grossPnlCurrency: 'GBP' },
    );
    if (!result.ok) throw new Error(result.reason);
    expect(result.value).toMatchObject({ netPnl: '47.5', netPnlCurrency: 'GBP' });
  });

  it('still refuses a fee in pounds on a trade in dollars', () => {
    expect(calculateComparableNetPnl(dec('10'), dec('1'), 'USD', 'GBP')).toEqual({ ok: true, available: false, reason: 'currency-mismatch' });
  });
});
