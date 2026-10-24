import { useEffect, useId, useRef, useState } from 'react';
import {
  describeVisualPnlPeriodProblem,
  projectVisualPnlPeriod,
  shiftVisualPnlDayKey,
  VISUAL_PNL_PERIOD_KINDS,
  type VisualPnlPeriod,
  type VisualPnlPeriodChoice,
  type VisualPnlPeriodKind,
} from '../../application/visual-pnl';
import { Button, Field, Select } from '../../design-system/primitives';

export interface PeriodChooserProps {
  readonly period: VisualPnlPeriod;
  readonly todayKey: string;
  readonly onChoiceChange: (choice: VisualPnlPeriodChoice) => void;
}

const KIND_LABELS: Readonly<Record<VisualPnlPeriodKind, string>> = Object.freeze({
  week: 'Week', month: 'Month', 'three-months': '3 months', year: 'Year', all: 'All time', custom: 'Custom',
});
const STEP_NAMES: Readonly<Partial<Record<VisualPnlPeriodKind, string>>> = Object.freeze({
  week: 'week', month: 'month', 'three-months': '3 months', year: 'year',
});
const OPTIONS = VISUAL_PNL_PERIOD_KINDS.map(kind => ({ value: kind, label: KIND_LABELS[kind] }));

/** The id of the "Period" list, so the dashboard can place focus on it after a retry or "Show all time". */
export const PERIOD_LIST_ID = 'kairos-results-period';

/** The days the custom fields start from: the period's own (never after today), or this month for all time. */
function customStart(period: VisualPnlPeriod, todayKey: string): Readonly<{ first: string; last: string }> {
  if (period.fromDayKey === null || period.toDayKey === null) return { first: `${todayKey.slice(0, 7)}-01`, last: todayKey };
  const last = shiftVisualPnlDayKey(period.toDayKey, -1);
  return { first: period.fromDayKey, last: last > todayKey ? todayKey : last };
}

/** U5 (D198): the period list, previous and next, and the custom days. The period itself comes from its owner; this only chooses. */
export function PeriodChooser({ period, todayKey, onChoiceChange }: PeriodChooserProps) {
  const [mode, setMode] = useState<VisualPnlPeriodKind>(period.kind);
  const [custom, setCustom] = useState(() => customStart(period, todayKey));
  const [problem, setProblem] = useState<string | null>(null);
  const problemId = useId();
  const previous = useRef<HTMLButtonElement>(null);
  const nextPressed = useRef(false);

  // A period chosen elsewhere (the arrows, the address, "Show all time") resets the list and the custom days.
  const periodKey = `${period.kind}:${period.fromDayKey ?? ''}:${period.toDayKey ?? ''}`;
  useEffect(() => {
    setMode(period.kind);
    setCustom(customStart(period, todayKey));
    setProblem(null);
  }, [periodKey, todayKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // "›" goes away under focus when today's period is reached, so focus moves to "‹" (WCAG 2.4.3).
  useEffect(() => {
    if (!nextPressed.current) return;
    nextPressed.current = false;
    if (period.next === null) previous.current?.focus();
  }, [periodKey, period.next]);

  const step = STEP_NAMES[period.kind];
  const showSteps = step !== undefined && mode === period.kind;

  function choose(kind: VisualPnlPeriodKind): void {
    setMode(kind);
    setProblem(null);
    if (kind === 'custom') return;
    onChoiceChange(kind === 'all' ? Object.freeze({ kind }) : Object.freeze({ kind, at: null }));
  }

  function show(): void {
    const choice: VisualPnlPeriodChoice = Object.freeze({ kind: 'custom', firstDayKey: custom.first, lastDayKey: custom.last });
    const result = projectVisualPnlPeriod(choice, todayKey);
    if (!result.ok) { setProblem(describeVisualPnlPeriodProblem(result.reason)); return; }
    setProblem(null);
    onChoiceChange(choice);
  }

  return <div className="kairos-period-chooser">
    <div className="kairos-period-chooser__row">
      <Field label="Period" id={PERIOD_LIST_ID} className="kairos-period-chooser__list">
        {control => <Select {...control} value={mode} options={OPTIONS} onChange={event => choose(event.target.value as VisualPnlPeriodKind)} />}
      </Field>
      <div className="kairos-period-chooser__steps">
        {showSteps ? <Button ref={previous} variant="secondary" size="sm" aria-label={`Previous ${step}`} onClick={() => { if (period.previous) onChoiceChange(period.previous); }}>‹</Button> : null}
        <p className="kairos-period-chooser__label" aria-live="polite">{period.label}</p>
        {showSteps ? <Button variant="secondary" size="sm" aria-label={`Next ${step}`} disabled={period.next === null}
          onClick={() => { if (period.next) { nextPressed.current = true; onChoiceChange(period.next); } }}>›</Button> : null}
      </div>
    </div>
    {mode === 'custom' ? <div className="kairos-period-chooser__custom">
      <Field label="First day">
        {control => <input {...control} type="date" max={todayKey} value={custom.first} aria-describedby={problem ? problemId : undefined}
          onChange={event => setCustom(current => ({ ...current, first: event.target.value }))} />}
      </Field>
      <Field label="Last day">
        {control => <input {...control} type="date" max={todayKey} value={custom.last} aria-describedby={problem ? problemId : undefined}
          onChange={event => setCustom(current => ({ ...current, last: event.target.value }))} />}
      </Field>
      <Button variant="secondary" size="sm" onClick={show}>Show</Button>
      {problem ? <p id={problemId} role="alert" className="kairos-period-chooser__problem">{problem}</p> : null}
    </div> : null}
  </div>;
}
