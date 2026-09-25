import { describe, expect, it } from 'vitest';
import {
  createStrategyId, createStrategyRuleId, isDisciplineListItemId, isStrategyName, isTradeStrategyMark, parseStrategies, parseStrategyRules,
} from '../src/domain/discipline';

const breakoutRules = () => [
  { id: 'risk', kind: 'max-risk', amount: '50', currency: 'USDT' },
  { id: 'reward', kind: 'min-reward-to-risk', ratio: '2' },
  { id: 'stop', kind: 'stop-planned' },
  { id: 'markets', kind: 'markets', symbols: ['BTCUSDT', 'ETHUSDT'] },
  { id: 'volume', kind: 'written', label: 'Volume confirms the break' },
  { id: 'news', kind: 'written', label: 'No big news in the next hour' },
];
const breakout = () => ({ id: 'breakout', name: 'Breakout', revision: 1, rules: breakoutRules() });
const pullback = () => ({ id: 'pullback', name: ' Pullback ', revision: 3, note: 'extra', rules: [{ id: 'checklist', kind: 'checklist-complete', note: 'extra' }, { id: 'wait', kind: 'written', label: '  I wait for the pullback  ' }] });
const withRules = (rules: unknown[]) => [{ ...breakout(), rules }];
const rule = (overrides: Record<string, unknown>) => withRules([{ id: 'r1', ...overrides }]);
const deepFrozen = (value: unknown): boolean => typeof value !== 'object' || value === null || (Object.isFrozen(value) && Object.values(value).every(deepFrozen));

describe('T-040a what a strategy is', () => {
  it('parses a good list: trimmed, in order, frozen, extra keys dropped', () => {
    const parsed = parseStrategies([breakout(), pullback()]);
    if (!parsed.ok) throw new Error(parsed.reason);
    expect(parsed.strategies.map(strategy => strategy.name)).toEqual(['Breakout', 'Pullback']);
    expect(parsed.strategies[0]!.rules).toEqual(breakoutRules());
    expect(parsed.strategies[1]).toEqual({ id: 'pullback', name: 'Pullback', revision: 3, rules: [{ id: 'checklist', kind: 'checklist-complete' }, { id: 'wait', kind: 'written', label: 'I wait for the pullback' }] });
    expect(deepFrozen(parsed.strategies)).toBe(true);
  });

  it.each([
    ['strategies-missing', {}, null, null],
    ['too-many-strategies', Array.from({ length: 21 }, (_, i) => ({ ...breakout(), id: `s${i}`, name: `S${i}` })), null, null],
    ['invalid-strategy-id', [{ ...breakout(), id: 'Bad Id' }], 0, null],
    ['duplicate-strategy-id', [breakout(), { ...breakout(), name: 'Other' }], 1, null],
    ['name-required', [{ ...breakout(), name: '  ' }], 0, null],
    ['name-too-long', [{ ...breakout(), name: 'x'.repeat(41) }], 0, null],
    ['duplicate-name', [breakout(), { ...breakout(), id: 'second', name: ' breakout ' }], 1, null],
    ['invalid-revision', [{ ...breakout(), revision: 0 }], 0, null],
    ['invalid-revision', [{ ...breakout(), revision: 1.5 }], 0, null],
    ['rules-required', withRules([]), 0, null],
    ['too-many-rules', withRules(Array.from({ length: 13 }, (_, i) => ({ id: `w${i}`, kind: 'written', label: `Rule ${i}` }))), 0, null],
    ['invalid-rule-id', rule({ id: '', kind: 'stop-planned' }), 0, 0],
    ['duplicate-rule-id', withRules([{ id: 'a', kind: 'stop-planned' }, { id: 'a', kind: 'checklist-complete' }]), 0, 1],
    ['unknown-rule-kind', rule({ kind: 'max-trades' }), 0, 0],
    ['duplicate-rule-kind', withRules([{ id: 'a', kind: 'stop-planned' }, { id: 'b', kind: 'stop-planned' }]), 0, 1],
    ['amount-invalid', rule({ kind: 'max-risk', amount: '0', currency: 'USDT' }), 0, 0],
    ['amount-invalid', rule({ kind: 'max-risk', amount: '-5', currency: 'USDT' }), 0, 0],
    ['amount-invalid', rule({ kind: 'max-risk', amount: ' 50', currency: 'USDT' }), 0, 0],
    ['amount-invalid', rule({ kind: 'max-risk', amount: '5e1', currency: 'USDT' }), 0, 0],
    ['currency-invalid', rule({ kind: 'max-risk', amount: '50', currency: 'usdt' }), 0, 0],
    ['currency-invalid', rule({ kind: 'max-risk', amount: '50', currency: '' }), 0, 0],
    ['ratio-invalid', rule({ kind: 'min-reward-to-risk', ratio: '0' }), 0, 0],
    ['markets-invalid', rule({ kind: 'markets', symbols: [] }), 0, 0],
    ['markets-invalid', rule({ kind: 'markets', symbols: ['btcusdt'] }), 0, 0],
    ['markets-invalid', rule({ kind: 'markets', symbols: ['BTCUSDT', 'BTCUSDT'] }), 0, 0],
    ['markets-invalid', rule({ kind: 'markets', symbols: Array.from({ length: 21 }, (_, i) => `M${i}`) }), 0, 0],
    ['label-required', rule({ kind: 'written', label: ' ' }), 0, 0],
    ['label-too-long', rule({ kind: 'written', label: 'x'.repeat(81) }), 0, 0],
  ] as const)('refuses with %s', (reason, value, strategy, ruleIndex) => {
    expect(parseStrategies(value)).toEqual({ ok: false, reason, strategy, rule: ruleIndex });
  });

  it('allows two written rules in one strategy, and an empty list', () => {
    expect(parseStrategyRules([{ id: 'a', kind: 'written', label: 'One' }, { id: 'b', kind: 'written', label: 'Two' }]).ok).toBe(true);
    expect(parseStrategies([])).toEqual({ ok: true, strategies: [] });
  });

  it('knows a good name', () => {
    expect(isStrategyName('Breakout')).toBe(true);
    expect(isStrategyName(' Breakout')).toBe(false);
    expect(isStrategyName('')).toBe(false);
    expect(isStrategyName('x'.repeat(41))).toBe(false);
  });

  it('makes fresh ids', () => {
    const ids = [createStrategyId(), createStrategyId(), createStrategyRuleId(), createStrategyRuleId()];
    for (const id of ids) expect(isDisciplineListItemId(id)).toBe(true);
    expect(new Set(ids).size).toBe(4);
  });
});

describe('T-040a a trade\'s strategy mark', () => {
  const mark = (overrides: Record<string, unknown> = {}) => ({ strategyId: 'breakout', revision: 1, name: 'Breakout', rules: breakoutRules(), answers: [{ ruleId: 'volume', answer: 'yes' }], linkedAt: '2026-09-20T09:00:00.000Z', ...overrides });

  it('accepts a snapshot with ticks on written rules', () => {
    expect(isTradeStrategyMark(mark())).toBe(true);
  });

  it.each([
    ['an answer on a checked rule', mark({ answers: [{ ruleId: 'risk', answer: 'yes' }] })],
    ['an answer that is not yes or no', mark({ answers: [{ ruleId: 'volume', answer: 'maybe' }] })],
    ['the same rule twice', mark({ answers: [{ ruleId: 'volume', answer: 'yes' }, { ruleId: 'volume', answer: 'no' }] })],
    ['a date without a time', mark({ linkedAt: '2026-09-20' })],
    ['revision 0', mark({ revision: 0 })],
    ['an empty name', mark({ name: '' })],
    ['no rules', mark({ rules: [] })],
    ['null', null],
  ])('refuses %s', (_label, value) => {
    expect(isTradeStrategyMark(value)).toBe(false);
  });
});
