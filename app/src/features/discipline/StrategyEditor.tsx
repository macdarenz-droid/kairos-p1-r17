import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { SaveStrategyResult, StrategyDraft, StrategyRuleDraft } from '../../application/discipline/strategies';
import { projectStrategyRuleBars, STRATEGY_RULE_BAR_STEPS } from '../../application/discipline/strategyCheck';
import { createStrategyRuleId, KAIROS_STRATEGY_NAME_MAX_LENGTH, type Strategy, type StrategyRuleId } from '../../domain/discipline';
import { parsePositiveDecimalString } from '../../domain/trades';
import { Button, Card, Field } from '../../design-system/primitives';
import './tradeDisciplineControls.css';
import './strategies.css';

export interface StrategyEditorProps {
  /** The strategy to change, or the draft to start from (empty or the example). */
  readonly initial: StrategyDraft;
  /** The host binds the database (saveStrategy); this component never touches storage. */
  readonly save: (draft: StrategyDraft) => Promise<SaveStrategyResult>;
  readonly onSaved: (strategy: Strategy) => void;
  readonly onCancel: () => void;
}

interface EditorState {
  readonly name: string;
  readonly maxRisk: { readonly used: boolean; readonly id: StrategyRuleId; readonly amount: string; readonly currency: string };
  readonly minReward: { readonly used: boolean; readonly id: StrategyRuleId; readonly ratio: string };
  readonly stopPlanned: { readonly used: boolean; readonly id: StrategyRuleId };
  readonly checklistComplete: { readonly used: boolean; readonly id: StrategyRuleId };
  readonly markets: { readonly used: boolean; readonly id: StrategyRuleId; readonly symbols: string };
  readonly written: readonly { readonly id: StrategyRuleId; readonly label: string }[];
}

function stateFrom(initial: StrategyDraft): EditorState {
  const find = <K extends StrategyRuleDraft['kind']>(kind: K) => initial.rules.find((rule): rule is Extract<StrategyRuleDraft, { kind: K }> => rule.kind === kind);
  const maxRisk = find('max-risk'), minReward = find('min-reward-to-risk'), stop = find('stop-planned'), checklist = find('checklist-complete'), markets = find('markets');
  return {
    name: initial.name,
    maxRisk: maxRisk ? { used: true, id: maxRisk.id, amount: maxRisk.amount, currency: maxRisk.currency } : { used: false, id: createStrategyRuleId(), amount: '', currency: '' },
    minReward: minReward ? { used: true, id: minReward.id, ratio: minReward.ratio } : { used: false, id: createStrategyRuleId(), ratio: '' },
    stopPlanned: { used: stop !== undefined, id: stop?.id ?? createStrategyRuleId() },
    checklistComplete: { used: checklist !== undefined, id: checklist?.id ?? createStrategyRuleId() },
    markets: markets ? { used: true, id: markets.id, symbols: markets.symbols } : { used: false, id: createStrategyRuleId(), symbols: '' },
    written: initial.rules.filter((rule): rule is Extract<StrategyRuleDraft, { kind: 'written' }> => rule.kind === 'written').map(rule => ({ id: rule.id, label: rule.label })),
  };
}

/** The ticked checked kinds in a fixed order, then the written rules. */
function rulesFrom(state: EditorState): StrategyRuleDraft[] {
  const rules: StrategyRuleDraft[] = [];
  if (state.maxRisk.used) rules.push({ id: state.maxRisk.id, kind: 'max-risk', amount: state.maxRisk.amount, currency: state.maxRisk.currency });
  if (state.minReward.used) rules.push({ id: state.minReward.id, kind: 'min-reward-to-risk', ratio: state.minReward.ratio });
  if (state.stopPlanned.used) rules.push({ id: state.stopPlanned.id, kind: 'stop-planned' });
  if (state.checklistComplete.used) rules.push({ id: state.checklistComplete.id, kind: 'checklist-complete' });
  if (state.markets.used) rules.push({ id: state.markets.id, kind: 'markets', symbols: state.markets.symbols });
  for (const rule of state.written) rules.push({ id: rule.id, kind: 'written', label: rule.label });
  return rules;
}

const MESSAGES: Readonly<Record<string, string>> = {
  'name-required': 'Give your strategy a name.',
  'name-too-long': 'Keep the name under 40 characters.',
  'duplicate-name': 'You already have a strategy with this name. Choose another name.',
  'too-many-strategies': 'You can keep at most 20 strategies. Delete one first.',
  'rules-required': 'Choose at least one rule.',
  'too-many-rules': 'Keep at most 12 rules.',
  'amount-invalid': 'Use an amount above 0, like 50.',
  'currency-invalid': 'Use a currency code such as USDT.',
  'ratio-invalid': 'Use a number above 0, like 2.',
  'markets-invalid': 'Add at least one market, for example BTCUSDT, and at most 20.',
  'label-required': 'Each rule you tick yourself needs some words. Fill it in or remove it.',
  'label-too-long': 'Keep each rule under 80 characters.',
  'strategy-not-found': 'This strategy was deleted. Cancel and choose another one.',
};
const OTHER_REFUSAL = 'Kairos could not save this strategy. Check each rule and try again.';
const STORAGE_REFUSAL = 'Kairos could not save this strategy. Your saved strategies were not changed.';

/** P28: write one strategy: its name, the rules Kairos checks and the rules the trader ticks. The host saves it. */
export function StrategyEditor({ initial, save, onSaved, onCancel }: StrategyEditorProps) {
  const [state, setState] = useState<EditorState>(() => stateFrom(initial));
  const [saving, setSaving] = useState(false);
  const [refusal, setRefusal] = useState<{ readonly message: string; readonly field: string | null } | null>(null);
  const titleId = useId(), prefix = useId();
  const ids = { name: `${prefix}-name`, amount: `${prefix}-amount`, currency: `${prefix}-currency`, ratio: `${prefix}-ratio`, markets: `${prefix}-markets`, add: `${prefix}-add` };
  const writtenId = (id: StrategyRuleId) => `${prefix}-rule-${id}`;
  const heading = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef<string | null>(null);

  useEffect(() => { heading.current?.focus(); }, []);
  // Focus moves once the new content is on screen.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    document.getElementById(target)?.focus();
  });

  const set = (change: (current: EditorState) => EditorState) => setState(change);
  const ratio = state.minReward.used ? parsePositiveDecimalString(state.minReward.ratio) : null;
  const bars = ratio?.ok ? projectStrategyRuleBars('1', ratio.value) : null;

  const fieldFor = (reason: string, index: number | null, rules: readonly StrategyRuleDraft[]): string | null => {
    if (reason === 'name-required' || reason === 'name-too-long' || reason === 'duplicate-name') return ids.name;
    const rule = index === null ? undefined : rules[index];
    if (!rule) return null;
    if (rule.kind === 'max-risk') return reason === 'currency-invalid' ? ids.currency : ids.amount;
    if (rule.kind === 'min-reward-to-risk') return ids.ratio;
    if (rule.kind === 'markets') return ids.markets;
    if (rule.kind === 'written') return writtenId(rule.id);
    return null;
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const rules = rulesFrom(state);
    setSaving(true);
    setRefusal(null);
    const result = await save({ id: initial.id, name: state.name, rules }).catch(() => null);
    setSaving(false);
    if (result?.ok) { onSaved(result.strategy); return; }
    if (result === null || result.type === 'storage-error') { setRefusal({ message: STORAGE_REFUSAL, field: null }); return; }
    const field = fieldFor(result.reason, result.type === 'validation-error' ? result.rule : null, rules);
    setRefusal({ message: MESSAGES[result.reason] ?? OTHER_REFUSAL, field });
    if (field) pendingFocus.current = field;
  };

  const invalid = (field: string) => refusal?.field === field;
  const removeWritten = (index: number) => {
    const next = state.written[index + 1];
    pendingFocus.current = next ? writtenId(next.id) : ids.add;
    set(current => ({ ...current, written: current.written.filter((_, at) => at !== index) }));
  };
  const addWritten = () => {
    const id = createStrategyRuleId();
    pendingFocus.current = writtenId(id);
    set(current => ({ ...current, written: [...current.written, { id, label: '' }] }));
  };
  const check = (label: string, used: boolean, toggle: (used: boolean) => void) => <label className="kairos-discipline-check">
    <input type="checkbox" checked={used} onChange={event => toggle(event.target.checked)} /> <span>{label}</span>
  </label>;

  return <Card as="form" className="kairos-strategy-editor" aria-labelledby={titleId} noValidate onSubmit={event => { void submit(event); }}>
    <h2 id={titleId} tabIndex={-1} ref={heading}>{initial.id === null ? 'New strategy' : `Change ${initial.name}`}</h2>
    <Field label="Name" id={ids.name} required hint="A short name you will know, for example Breakout." invalid={invalid(ids.name)}>
      {control => <input {...control} type="text" maxLength={KAIROS_STRATEGY_NAME_MAX_LENGTH} value={state.name} onChange={event => { const name = event.target.value; set(current => ({ ...current, name })); }} />}
    </Field>

    <fieldset>
      <legend>Rules Kairos checks for you</legend>
      <p>Kairos checks these from the plan you write on a trade: your planned entry, stop, target and quantity. It never stops you saving.</p>

      {check('Most I risk on one trade', state.maxRisk.used, used => set(current => ({ ...current, maxRisk: { ...current.maxRisk, used } })))}
      {state.maxRisk.used ? <>
        <Field label="Amount" id={ids.amount} required hint="The most you can lose on one trade, for example 50." invalid={invalid(ids.amount)}>
          {control => <input {...control} type="text" inputMode="decimal" value={state.maxRisk.amount} onChange={event => { const amount = event.target.value; set(current => ({ ...current, maxRisk: { ...current.maxRisk, amount } })); }} />}
        </Field>
        <Field label="Currency" id={ids.currency} required hint="The price currency of your trades, for example USDT." invalid={invalid(ids.currency)}>
          {control => <input {...control} type="text" autoCapitalize="characters" spellCheck={false} value={state.maxRisk.currency} onChange={event => { const currency = event.target.value; set(current => ({ ...current, maxRisk: { ...current.maxRisk, currency } })); }} />}
        </Field>
      </> : null}

      {check('Least I aim to make for what I risk', state.minReward.used, used => set(current => ({ ...current, minReward: { ...current.minReward, used } })))}
      {state.minReward.used ? <>
        <Field label="Times what you risk" id={ids.ratio} required hint="For example 2: aim to make twice what you risk." invalid={invalid(ids.ratio)}>
          {control => <input {...control} type="text" inputMode="decimal" value={state.minReward.ratio} onChange={event => { const value = event.target.value; set(current => ({ ...current, minReward: { ...current.minReward, ratio: value } })); }} />}
        </Field>
        {ratio?.ok && bars ? <>
          <div className="kairos-strategy-editor__bars" aria-hidden="true">
            <span>Risk</span>
            <span className="kairos-strategy-bar" data-bar="risk" data-steps={bars.firstSteps}><span style={{ inlineSize: `${(bars.firstSteps / STRATEGY_RULE_BAR_STEPS) * 100}%` }} /></span>
            <span>Reward</span>
            <span className="kairos-strategy-bar" data-bar="reward" data-steps={bars.secondSteps}><span style={{ inlineSize: `${(bars.secondSteps / STRATEGY_RULE_BAR_STEPS) * 100}%` }} /></span>
          </div>
          <p>For every 1 you risk, you aim to make {ratio.value}.</p>
        </> : null}
      </> : null}

      {check('Plan a stop before every trade', state.stopPlanned.used, used => set(current => ({ ...current, stopPlanned: { ...current.stopPlanned, used } })))}

      {check('Tick every step of my checklist before the trade', state.checklistComplete.used, used => set(current => ({ ...current, checklistComplete: { ...current.checklistComplete, used } })))}
      {state.checklistComplete.used ? <p>Your checklist steps are in More → Settings.</p> : null}

      {check('Trade only these markets', state.markets.used, used => set(current => ({ ...current, markets: { ...current.markets, used } })))}
      {state.markets.used ? <Field label="Markets" id={ids.markets} required hint="Symbols separated by commas, for example BTCUSDT, ETHUSDT." invalid={invalid(ids.markets)}>
        {control => <input {...control} type="text" autoCapitalize="characters" spellCheck={false} value={state.markets.symbols} onChange={event => { const symbols = event.target.value; set(current => ({ ...current, markets: { ...current.markets, symbols } })); }} />}
      </Field> : null}
    </fieldset>

    <fieldset>
      <legend>Rules you tick yourself</legend>
      <p>Write the rules Kairos can't check, in your own words, for example "I wait for a candle to close above the line". You tick them on each trade.</p>
      {state.written.map((rule, index) => <div className="kairos-discipline-lists__row" key={rule.id}>
        <Field label={`Rule ${index + 1}`} id={writtenId(rule.id)} invalid={invalid(writtenId(rule.id))}>
          {control => <input {...control} type="text" value={rule.label} onChange={event => { const label = event.target.value; set(current => ({ ...current, written: current.written.map(row => (row.id === rule.id ? { ...row, label } : row)) })); }} />}
        </Field>
        <Button variant="ghost" size="sm" aria-label={`Remove rule ${index + 1}`} onClick={() => removeWritten(index)}>Remove</Button>
      </div>)}
      <Button id={ids.add} variant="secondary" size="sm" onClick={addWritten}>Add a rule</Button>
    </fieldset>

    <div className="kairos-strategy-editor__actions">
      <Button type="submit" busy={saving}>{saving ? 'Saving…' : 'Save strategy'}</Button>
      <Button variant="secondary" onClick={onCancel}>Cancel</Button>
    </div>
    {refusal ? <p role="alert">{refusal.message}</p> : null}
  </Card>;
}
