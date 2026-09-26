import { useId, useRef, useState, type FormEvent } from 'react';
import { EVENT_FIELD_ERRORS, IMPACT_WORDS, describeEventSaved, describeNewsLimit } from '../../application/economic-calendar/calendarWords';
import { saveTypedEconomicEvent, type TypedEconomicEventField } from '../../application/economic-calendar/economicEvents';
import type { KairosDatabase } from '../../data/database';
import type { EconomicEventImpact, EconomicEventRecord } from '../../domain/economic-calendar/economicEvent';
import { Button, Card, Field } from '../../design-system/primitives';
import { readDeviceTimeZone } from '../settings/DeviceTimeZoneButton';

export interface NewsEventFormProps {
  readonly db: KairosDatabase;
  /** The calendar's saved zone, named in the hint when it differs from this device's clock. */
  readonly timeZone: string;
  readonly now: () => string;
  readonly onSaved: (event: EconomicEventRecord) => void;
}

type Draft = Readonly<{ title: string; startsAt: string; currency: string; impact: EconomicEventImpact | null; expected: string; previous: string; actual: string }>;
type Outcome = Readonly<{ kind: 'saved'; text: string }> | Readonly<{ kind: 'alert'; text: string }>;

const EMPTY: Draft = Object.freeze({ title: '', startsAt: '', currency: '', impact: null, expected: '', previous: '', actual: '' });
const SIZES: readonly (EconomicEventImpact | null)[] = [null, 'high', 'medium', 'low'];
const VALUE_FIELDS = [['expected', 'Expected'], ['previous', 'Last time'], ['actual', 'Actual']] as const;

/**
 * "Big news" as two text parts ("Big" in a span, then " news"): the radio's name is the same, while the page's one
 * element whose own text is exactly "Big news" stays the size line of a saved event.
 */
function SizeWords({ words }: { readonly words: string }) {
  const space = words.indexOf(' ');
  return space < 0 ? <>{words}</> : <><span>{words.slice(0, space)}</span>{words.slice(space)}</>;
}

/** P34: "Add your own news": saved offline with the typed-news command; nothing is worked out from the numbers. */
export function NewsEventForm({ db, timeZone, now, onSaved }: NewsEventFormProps) {
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<TypedEconomicEventField | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [saving, setSaving] = useState(false);
  const details = useRef<HTMLDetailsElement>(null);
  const formId = useId();
  const sizeHintId = useId();
  const idPrefix = useId();
  const ids: Readonly<Record<TypedEconomicEventField, string>> = {
    title: `${idPrefix}-title`, startsAt: `${idPrefix}-starts-at`, currency: `${idPrefix}-currency`, impact: `${idPrefix}-impact`,
    expected: `${idPrefix}-expected`, previous: `${idPrefix}-previous`, actual: `${idPrefix}-actual`,
  };
  const deviceZone = readDeviceTimeZone();
  const clockHint = deviceZone === null || deviceZone === timeZone
    ? "As this device's clock shows it."
    : `As this device's clock shows it (${deviceZone}). This calendar shows times in ${timeZone}, so the time you see after saving can differ.`;
  const set = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));
  const errorOf = (field: TypedEconomicEventField) => (error === field ? EVENT_FIELD_ERRORS[field] : undefined);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    const result = await saveTypedEconomicEvent(db, draft, { now });
    setSaving(false);
    if (result.ok) {
      setDraft(EMPTY);
      setError(null);
      setOutcome({ kind: 'saved', text: describeEventSaved(result.event, timeZone) });
      onSaved(result.event);
      return;
    }
    if (result.type === 'validation-error') {
      setError(result.field);
      setOutcome(null);
      if ((VALUE_FIELDS as readonly (readonly [string, string])[]).some(([field]) => field === result.field) && details.current !== null) details.current.open = true;
      const target = result.field === 'impact' ? document.getElementById(`${ids.impact}-none`) : document.getElementById(ids[result.field]);
      target?.focus();
      return;
    }
    setError(null);
    setOutcome({ kind: 'alert', text: result.type === 'limit-reached' ? describeNewsLimit(result.limit) : 'Kairos could not save this news. Nothing was changed.' });
  }

  return <Card as="section" className="kairos-news-calendar-card kairos-news-form" aria-labelledby={formId}>
    <h2 id={formId}>Add your own news</h2>
    <form noValidate onSubmit={(event) => { void save(event); }}>
      <Field label="Name" id={ids.title} required hint="Such as US inflation (CPI), a PMI, or a company's earnings." error={errorOf('title')}>
        {(control) => <input {...control} type="text" value={draft.title} onChange={(event) => set({ title: event.target.value })} />}
      </Field>
      <Field label="Date and time" id={ids.startsAt} required hint={clockHint} error={errorOf('startsAt')}>
        {(control) => <input {...control} type="datetime-local" value={draft.startsAt} onChange={(event) => set({ startsAt: event.target.value })} />}
      </Field>
      <Field label="Currency (optional)" id={ids.currency} hint="The currency this news is about, such as USD." error={errorOf('currency')}>
        {(control) => <input {...control} type="text" autoCapitalize="characters" value={draft.currency} onChange={(event) => set({ currency: event.target.value })} />}
      </Field>
      <fieldset aria-describedby={error === 'impact' ? `${sizeHintId} ${ids.impact}-error` : sizeHintId}>
        <legend>How big is it?</legend>
        <p id={sizeHintId}>Only news you mark as Big news shows on your trade cards.</p>
        {SIZES.map((size) => <label key={size ?? 'none'} className="kairos-news-form__choice">
          <input type="radio" name={ids.impact} id={size === null ? `${ids.impact}-none` : undefined} checked={draft.impact === size} onChange={() => set({ impact: size })} />
          {size === null ? 'Not sure' : <SizeWords words={IMPACT_WORDS[size]} />}
        </label>)}
        {error === 'impact' ? <p id={`${ids.impact}-error`} className="kairos-form-field__error">{EVENT_FIELD_ERRORS.impact}</p> : null}
      </fieldset>
      <details ref={details}>
        <summary>Add the numbers (optional)</summary>
        <p>Copy them as your calendar shows them, such as 3.1% or 21.5K. Kairos keeps them as text and never works anything out from them.</p>
        {VALUE_FIELDS.map(([field, label]) => <Field key={field} label={label} id={ids[field]} error={errorOf(field)}>
          {(control) => <input {...control} type="text" value={draft[field]} onChange={(event) => set({ [field]: event.target.value })} />}
        </Field>)}
      </details>
      <div><Button type="submit" busy={saving}>Save news</Button></div>
      {outcome === null ? null : outcome.kind === 'saved' ? <p role="status">{outcome.text}</p> : <p role="alert">{outcome.text}</p>}
    </form>
  </Card>;
}
