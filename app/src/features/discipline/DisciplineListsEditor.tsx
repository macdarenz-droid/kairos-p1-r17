import { useEffect, useId, useState, type FormEvent } from 'react';
import { loadDisciplineLists, saveDisciplineLists } from '../../application/discipline';
import type { KairosDatabase } from '../../data/database';
import { Button, Field } from '../../design-system/primitives';
import {
  KAIROS_DISCIPLINE_LABEL_MAX_LENGTH,
  KAIROS_DISCIPLINE_LIST_MAX_ITEMS,
  createDisciplineListItemId,
  type DisciplineListItem,
  type DisciplineListKind,
  type DisciplineLists,
} from '../../domain/discipline';
import './tradeDisciplineControls.css';

export interface DisciplineListsEditorProps {
  readonly db: KairosDatabase;
}

type Load = Readonly<{ kind: 'loading' }> | Readonly<{ kind: 'failed' }> | Readonly<{ kind: 'ready' }>;
type Feedback = Readonly<{ kind: 'saved' }> | Readonly<{ kind: 'refused'; message: string }> | null;
type Draft = Record<DisciplineListKind, DisciplineListItem[]>;

const GROUPS: readonly { readonly kind: DisciplineListKind; readonly legend: string; readonly noun: string }[] = [
  { kind: 'checklist', legend: 'Before you trade: your steps', noun: 'step' },
  { kind: 'review', legend: 'After the trade: your questions', noun: 'question' },
  { kind: 'mistakes', legend: 'Mistakes you can tag', noun: 'mistake' },
];

const capital = (word: string) => word[0].toUpperCase() + word.slice(1);
const draftOf = (lists: DisciplineLists): Draft => ({ checklist: [...lists.checklist], review: [...lists.review], mistakes: [...lists.mistakes] });

function refusalText(reason: string): string {
  if (reason === 'label-required') return 'Each item needs some words. Fill it in or remove it.';
  if (reason === 'label-too-long') return `Keep each item under ${KAIROS_DISCIPLINE_LABEL_MAX_LENGTH} characters.`;
  if (reason === 'too-many-items') return `Keep at most ${KAIROS_DISCIPLINE_LIST_MAX_ITEMS} items in each list.`;
  return 'Kairos could not save these lists. Check each item and try again.';
}

/** "Your checklist" in Settings: the trader's own steps, questions and mistakes, saved together. Answers already saved keep their words. */
export function DisciplineListsEditor({ db }: DisciplineListsEditorProps) {
  const titleId = useId();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  const [draft, setDraft] = useState<Draft>({ checklist: [], review: [], mistakes: [] });
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  useEffect(() => {
    let ignore = false;
    setLoad({ kind: 'loading' });
    loadDisciplineLists(db).then(
      result => {
        if (ignore) return;
        if (!result.ok) { setLoad({ kind: 'failed' }); return; }
        setDraft(draftOf(result.lists));
        setLoad({ kind: 'ready' });
      },
      () => { if (!ignore) setLoad({ kind: 'failed' }); },
    );
    return () => { ignore = true; };
  }, [db]);

  const change = (kind: DisciplineListKind, update: (items: DisciplineListItem[]) => DisciplineListItem[]) => {
    setDraft(current => ({ ...current, [kind]: update(current[kind]) }));
    setFeedback(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving || load.kind !== 'ready') return;
    setSaving(true);
    setFeedback(null);
    const result = await saveDisciplineLists(db, draft).catch(() => null);
    setSaving(false);
    if (result === null || (!result.ok && result.type === 'storage-error')) {
      setFeedback({ kind: 'refused', message: 'Kairos could not save your checklist. Your stored lists were not changed.' });
      return;
    }
    if (!result.ok) { setFeedback({ kind: 'refused', message: refusalText(result.reason) }); return; }
    setDraft(draftOf(result.lists));
    setFeedback({ kind: 'saved' });
  }

  const loading = load.kind === 'loading';
  return <form className="kairos-settings-card kairos-discipline-lists" aria-labelledby={titleId} onSubmit={event => { void submit(event); }} noValidate>
    <div>
      <h2 id={titleId}>Your checklist</h2>
      <p>These are the steps and questions Kairos asks on your trade cards. Changes apply to answers you give from now on; answers you already saved keep their words.</p>
    </div>
    {loading ? <p>Loading your checklist…</p> : null}
    {load.kind === 'failed' ? <p>Kairos could not load your checklist.</p> : <>
      {GROUPS.map(group => <fieldset key={group.kind} disabled={loading || saving}>
        <legend>{group.legend}</legend>
        {draft[group.kind].map((item, index) => <div className="kairos-discipline-lists__row" key={item.id}>
          <Field label={`${capital(group.noun)} ${index + 1}`}>
            {control => <input {...control} type="text" value={item.label}
              onChange={event => { const label = event.target.value; change(group.kind, items => items.map((row, at) => (at === index ? { ...row, label } : row))); }} />}
          </Field>
          <Button variant="ghost" size="sm" aria-label={`Remove ${group.noun} ${index + 1}`} onClick={() => change(group.kind, items => items.filter((_, at) => at !== index))}>Remove</Button>
        </div>)}
        <Button variant="secondary" size="sm" onClick={() => change(group.kind, items => [...items, { id: createDisciplineListItemId(), label: '', ruleId: null }])}>{`Add a ${group.noun}`}</Button>
      </fieldset>)}
      <Button type="submit" busy={saving} disabled={loading}>{saving ? 'Saving…' : 'Save your checklist'}</Button>
    </>}
    {feedback?.kind === 'saved' ? <p role="status">Your checklist is saved.</p> : null}
    {feedback?.kind === 'refused' ? <p role="alert">{feedback.message}</p> : null}
  </form>;
}
