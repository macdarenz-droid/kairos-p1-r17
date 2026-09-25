import { useState, type FormEvent } from 'react';
import type { SaveTradeDisciplineInput, SaveTradeDisciplineResult } from '../../application/discipline';
import { STRATEGY_RULE_BAR_STEPS, type StrategyRuleBars, type TradeStrategyCheck } from '../../application/discipline/strategyCheck';
import { describeStrategyRuleResult } from '../../application/discipline/strategyWords';
import type { JournalHistoryScope } from '../../application/journal';
import { Button, Field, Sheet } from '../../design-system/primitives';
import type { Strategy, StrategyRule, TradeDisciplineRecord, TradeStrategyMark } from '../../domain/discipline';
import './tradeDisciplineControls.css';

export interface TradeStrategyControlProps {
  readonly symbol: string;
  readonly tradeId: string;
  readonly scope: JournalHistoryScope;
  /** The current strategies, to choose from. */
  readonly strategies: readonly Strategy[];
  readonly record: TradeDisciplineRecord | null;
  /** checkSavedTradeStrategy for this trade, worked out by the host; null when no strategy is chosen. */
  readonly check: TradeStrategyCheck | null;
  readonly save: (input: SaveTradeDisciplineInput) => Promise<SaveTradeDisciplineResult>;
  readonly onSaved: (record: TradeDisciplineRecord) => void;
}

const MARKS = { kept: '✓', broken: '✗', unknown: '?' } as const;
const rules = (count: number) => (count === 1 ? '1 rule' : `${count} rules`);

/** The visible state line and the button's name; each name holds its visible words. */
function stateOf(check: TradeStrategyCheck): { readonly visible: string; readonly spoken: string } {
  if (check.broken > 0) return { visible: `Breaks ${check.broken} of ${rules(check.total)}`, spoken: `breaks ${check.broken} of ${rules(check.total)}` };
  if (check.unknown > 0) return { visible: `Keeps ${check.kept} of ${rules(check.total)} · ${check.unknown} to check`, spoken: `keeps ${check.kept} of ${rules(check.total)}, ${check.unknown} to check` };
  if (check.total === 1) return { visible: 'Keeps its rule', spoken: 'keeps its rule' };
  return { visible: `Keeps all ${rules(check.total)}`, spoken: `keeps all ${rules(check.total)}` };
}

const tickedFrom = (mark: TradeStrategyMark | undefined): Record<string, boolean> =>
  Object.fromEntries((mark?.answers ?? []).map(answer => [answer.ruleId, answer.answer === 'yes']));

function Bars({ bars }: { readonly bars: StrategyRuleBars }) {
  const width = (steps: number) => ({ inlineSize: `${(steps / STRATEGY_RULE_BAR_STEPS) * 100}%` });
  return <span className="kairos-strategy-bars" aria-hidden="true">
    <span>This trade</span>
    <span className="kairos-strategy-bar" data-bar="trade" data-steps={bars.firstSteps}><span style={width(bars.firstSteps)} /></span>
    <span>Your rule</span>
    <span className="kairos-strategy-bar" data-bar="rule" data-steps={bars.secondSteps}><span style={width(bars.secondSteps)} /></span>
  </span>;
}

/** P28 on every trade card: the strategy the trade follows and its rule check; the sheet ticks written rules and chooses, changes or removes the strategy. */
export function TradeStrategyControl({ symbol, tradeId, scope, strategies, record, check, save, onSaved }: TradeStrategyControlProps) {
  const [open, setOpen] = useState(false);
  const [chosen, setChosen] = useState('');
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const mark = record?.strategy;
  if (!mark && strategies.length === 0) return null;

  function openSheet(): void {
    setChosen(mark?.strategyId ?? '');
    setTicked(tickedFrom(mark));
    setFailed(false);
    setOpen(true);
  }

  const written = mark ? mark.rules.filter((rule): rule is Extract<StrategyRule, { kind: 'written' }> => rule.kind === 'written') : [];
  const keeping = mark !== undefined && chosen === mark.strategyId;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFailed(false);
    // A newly chosen strategy's written rules stay "not ticked yet", never "not kept".
    const answers = keeping ? written.map(rule => ({ itemId: rule.id, answer: ticked[rule.id] ? 'yes' as const : 'no' as const })) : [];
    const result = await save({ tradeId: tradeId as SaveTradeDisciplineInput['tradeId'], scope, half: 'strategy', strategyId: chosen || null, answers }).catch(() => null);
    setSaving(false);
    if (result === null || !result.ok) { setFailed(true); return; }
    setOpen(false);
    onSaved(result.record);
  }

  const state = mark && check ? stateOf(check) : null;
  const other = chosen === '' ? null : strategies.find(item => item.id === chosen) ?? null;

  return <>
    <Button variant="secondary" size="sm" className="kairos-discipline-control" onClick={openSheet}
      aria-label={mark && state ? `Strategy ${mark.name}: ${state.spoken}` : 'Strategy: none chosen'}>
      <span className="kairos-discipline-control__title">Strategy</span>
      {mark && check && state ? <>
        <span>{mark.name}</span>
        <span className="kairos-strategy-marks" aria-hidden="true">
          {check.results.map(result => <span key={result.ruleId} data-verdict={result.verdict}>{MARKS[result.verdict]}</span>)}
        </span>
        <span className="kairos-discipline-control__state">{state.visible}</span>
      </> : <span className="kairos-discipline-control__state">None chosen</span>}
    </Button>
    <Sheet open={open} title={`Strategy: ${symbol}`} onClose={() => setOpen(false)}>
      <form className="kairos-discipline-sheet" onSubmit={event => { void submit(event); }} noValidate>
        <Field label="Strategy">
          {control => <select {...control} value={chosen} onChange={event => setChosen(event.target.value)}>
            <option value="">No strategy</option>
            {strategies.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            {mark && !strategies.some(item => item.id === mark.strategyId) ? <option value={mark.strategyId}>{mark.name} (kept on this trade)</option> : null}
          </select>}
        </Field>
        {keeping && mark ? <>
          <p>Kairos checks this trade against your {mark.name} rules as they were when you chose them.</p>
          {check?.results.map(result => <div className="kairos-strategy-rule" key={result.ruleId}>
            {'bars' in result && result.bars ? <Bars bars={result.bars} /> : null}
            <p className="kairos-strategy-result" data-verdict={result.verdict}><span aria-hidden="true">{MARKS[result.verdict]}</span> {describeStrategyRuleResult(result)}</p>
          </div>)}
          {written.length > 0 ? <fieldset>
            <legend>Rules you tick yourself</legend>
            <p>Tick each rule you kept on this trade. Leave a rule empty if you did not keep it.</p>
            {written.map(rule => <label className="kairos-discipline-check" key={rule.id}>
              <input type="checkbox" checked={ticked[rule.id] === true} onChange={() => setTicked(current => ({ ...current, [rule.id]: !current[rule.id] }))} /> <span>{rule.label}</span>
            </label>)}
          </fieldset> : null}
        </> : null}
        {!keeping && other ? <p>Save to use your {other.name} rules as they are now. Then open this again to tick the rules you keep yourself.</p> : null}
        {chosen === '' && mark ? <p>Save to take the strategy off this trade. The trade itself is not changed.</p> : null}
        {failed ? <p role="alert">Kairos could not save the strategy for this trade. Your choices are kept so you can try again.</p> : null}
        <Button type="submit" busy={saving} disabled={!mark && chosen === ''}>{saving ? 'Saving…' : 'Save strategy'}</Button>
      </form>
    </Sheet>
  </>;
}
