import { useEffect, useMemo, useState } from 'react';
import type { DisciplineAnswerInput } from '../../application/discipline';
import { loadStrategies } from '../../application/discipline/strategies';
import { previewTradeStrategyCheck } from '../../application/discipline/strategyCheck';
import { describeStrategyRuleResult, describeTradeStrategyCheck } from '../../application/discipline/strategyWords';
import type { ManualTradeDraft } from '../../application/trades';
import type { KairosDatabase } from '../../data/database';
import type { Strategy, StrategyId, StrategyRule } from '../../domain/discipline';
import type { TradeStatus } from '../../domain/trades';
import { Field } from '../../design-system/primitives';

interface TradeStrategyFieldProps {
  readonly db: KairosDatabase;
  readonly idPrefix: string;
  readonly value: StrategyId | '';
  readonly onChange: (value: StrategyId | '') => void;
  readonly draft: ManualTradeDraft;
  /** Quick log passes 'closed'. */
  readonly status: TradeStatus | '';
  readonly disabled: boolean;
  /** U12 (D241): ticks on the chosen strategy's written rules, every rule as yes or no once one is ticked; empty while none is. */
  readonly answers: readonly DisciplineAnswerInput[];
  readonly onAnswersChange: (answers: readonly DisciplineAnswerInput[]) => void;
  /** The checklist as ticked in the form, or null when none applies; the preview reads it. */
  readonly checklist: readonly DisciplineAnswerInput[] | null;
  /** U12 (D242): how many rules the preview says are broken, for "Before you save". */
  readonly onBrokenRulesChange: (broken: number) => void;
}

type LoadState = { readonly kind: 'loading' } | { readonly kind: 'failed' } | { readonly kind: 'ready'; readonly strategies: readonly Strategy[] };
const MARKS = { kept: '✓', broken: '✗', unknown: '?' } as const;

/** P28: choose the strategy a trade follows, and see before saving which of its rules the trade keeps, breaks or can't be checked yet. It never blocks a save. */
export function TradeStrategyField({ db, idPrefix, value, onChange, draft, status, disabled, answers, onAnswersChange, checklist, onBrokenRulesChange }: TradeStrategyFieldProps) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  useEffect(() => {
    let ignore = false;
    setLoad({ kind: 'loading' });
    void loadStrategies(db).catch(() => null).then(result => {
      if (ignore) return;
      setLoad(result?.ok ? { kind: 'ready', strategies: result.strategies } : { kind: 'failed' });
    });
    return () => { ignore = true; };
  }, [db]);

  const strategy = load.kind === 'ready' ? load.strategies.find(item => item.id === value) ?? null : null;
  const written = strategy ? strategy.rules.filter((rule): rule is Extract<StrategyRule, { kind: 'written' }> => rule.kind === 'written') : [];
  const ruleTicked = new Set(answers.filter(answer => answer.answer === 'yes').map(answer => answer.itemId));
  const check = useMemo(() => {
    if (!strategy) return null;
    const ticked = checklist?.filter(answer => answer.answer === 'yes').length ?? 0;
    const summary = checklist && ticked > 0 ? { ticked, asked: checklist.length, complete: ticked === checklist.length } : null;
    return previewTradeStrategyCheck(draft, status, strategy, { checklist: summary, answers: answers.map(({ itemId, answer }) => ({ ruleId: itemId as StrategyRule['id'], answer })) });
  }, [strategy, draft, status, checklist, answers]);
  const broken = check?.broken ?? 0;
  useEffect(() => { onBrokenRulesChange(broken); }, [broken, onBrokenRulesChange]);
  const toggleRule = (ruleId: string) => {
    const next = new Set(ruleTicked);
    if (next.has(ruleId)) next.delete(ruleId); else next.add(ruleId);
    onAnswersChange(next.size === 0 ? [] : written.map(rule => ({ itemId: rule.id, answer: next.has(rule.id) ? 'yes' : 'no' })));
  };

  return <fieldset className="kairos-trade-form__section kairos-trade-form__strategy" disabled={disabled}>
    <legend>Strategy <span>Optional</span></legend>
    {load.kind === 'loading' ? <p className="kairos-trade-form__section-copy">Loading your strategies…</p> : null}
    {load.kind === 'failed' ? <p className="kairos-trade-form__section-copy">Kairos could not load your strategies. You can still save this trade.</p> : null}
    {load.kind === 'ready' && load.strategies.length === 0 ? <p className="kairos-trade-form__section-copy">No strategies yet. Write your rules in More → Strategies, then choose one here.</p> : null}
    {load.kind === 'ready' && load.strategies.length > 0 ? <Field label="Strategy" id={`${idPrefix}-strategy`} hint="The plan this trade follows. Kairos checks its rules; it never stops you saving.">
      {control => <select {...control} value={value} onChange={event => onChange(event.target.value)}>
        <option value="">No strategy</option>
        {load.strategies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>}
    </Field> : null}
    {written.length > 0 ? <fieldset className="kairos-trade-form__rules">
      <legend>Your written rules</legend>
      <p className="kairos-trade-form__section-copy">Tick each one you kept. It is saved with the trade.</p>
      {written.map(rule => <label className="kairos-trade-form__check" key={rule.id}>
        <input type="checkbox" name="written-rule" checked={ruleTicked.has(rule.id)} onChange={() => toggleRule(rule.id)} /> <span>{rule.label}</span>
      </label>)}
    </fieldset> : null}
    {strategy && check ? <div className="kairos-trade-form__strategy-note" id={`${idPrefix}-strategy-note`}>
      <p>
        <span className="kairos-trade-form__strategy-marks" aria-hidden="true">{check.results.map(result => <span key={result.ruleId} data-verdict={result.verdict}>{MARKS[result.verdict]}</span>)}</span>
        {' '}{describeTradeStrategyCheck(check, strategy.name)}
      </p>
      {check.results.filter(result => result.verdict === 'broken').map(result => <p key={result.ruleId} data-verdict="broken"><span aria-hidden="true">✗</span> {describeStrategyRuleResult(result)}</p>)}
      {check.results.filter(result => result.verdict === 'unknown').map(result => <p key={result.ruleId} data-verdict="unknown"><span aria-hidden="true">?</span> {describeStrategyRuleResult(result)}</p>)}
      {check.broken > 0 ? <p>You can still save this trade.</p> : null}
    </div> : null}
  </fieldset>;
}
