import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { loadDisciplineLists, saveDisciplineLists } from '../../application/discipline';
import type { KairosDatabase } from '../../data/database';
import { Button, ErrorState, Field, Skeleton, useToast } from '../../design-system/primitives';
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
  // "Try again" after a failed load bumps this, which runs the load effect again.
  const [loadAttempt, setLoadAttempt] = useState(0);
  // Bumped whenever the draft is replaced by stored lists (load or save); an older Undo then does nothing.
  const draftGeneration = useRef(0);
  const toast = useToast();
  // True while this editor's "Undo" toast may be up; a new draft generation closes it, so no Undo does nothing (D178).
  const undoShown = useRef(false);
  const form = useRef<HTMLFormElement>(null);
  // Set when "Try again" had focus: once the load settles, focus the first step's field, or the new "Try again" (WCAG 2.4.3).
  const refocusAfterRetry = useRef(false);
  // The row just removed: focus then goes to the next row's "Remove", or to "Add a {noun}" after the last row.
  const removedAt = useRef<Readonly<{ group: number; noun: string; index: number }> | null>(null);

  const newGeneration = () => {
    draftGeneration.current += 1;
    if (undoShown.current) { undoShown.current = false; toast.dismiss(); }
  };

  useEffect(() => {
    let ignore = false;
    setLoad({ kind: 'loading' });
    loadDisciplineLists(db).then(
      result => {
        if (ignore) return;
        if (!result.ok) { setLoad({ kind: 'failed' }); return; }
        newGeneration();
        setDraft(draftOf(result.lists));
        setLoad({ kind: 'ready' });
      },
      () => { if (!ignore) setLoad({ kind: 'failed' }); },
    );
    return () => { ignore = true; };
  }, [db, loadAttempt]);

  useEffect(() => {
    if (load.kind === 'loading' || !refocusAfterRetry.current) return;
    refocusAfterRetry.current = false;
    const first = form.current?.querySelector('fieldset');
    const target = load.kind === 'failed' ? form.current?.querySelector<HTMLElement>('.kairos-error-state button') : first?.querySelector<HTMLElement>('input, button');
    target?.focus();
  }, [load.kind]);

  useLayoutEffect(() => {
    const removed = removedAt.current;
    if (removed === null) return;
    removedAt.current = null;
    const group = form.current?.querySelectorAll('fieldset')[removed.group];
    const next = group?.querySelector<HTMLElement>(`button[aria-label="Remove ${removed.noun} ${removed.index + 1}"]`);
    const add = [...(group?.querySelectorAll<HTMLElement>('button') ?? [])].find(button => button.textContent === `Add a ${removed.noun}`);
    (next ?? add)?.focus();
  }, [draft]);

  const change = (kind: DisciplineListKind, update: (items: DisciplineListItem[]) => DisciplineListItem[]) => {
    setDraft(current => ({ ...current, [kind]: update(current[kind]) }));
    setFeedback(null);
  };

  /** Removes a row from the draft only; "Undo" puts the same item back at its place unless the draft was saved or reloaded since. */
  const remove = (kind: DisciplineListKind, noun: string, index: number) => {
    const item = draft[kind][index];
    if (item === undefined) return;
    const generation = draftGeneration.current;
    removedAt.current = { group: GROUPS.findIndex(group => group.kind === kind), noun, index };
    change(kind, items => items.filter((_, at) => at !== index));
    undoShown.current = true;
    toast.show({
      message: `${capital(noun)} ${index + 1} removed.`,
      action: {
        label: 'Undo',
        onAction: () => {
          undoShown.current = false;
          if (draftGeneration.current !== generation) return;
          change(kind, items => items.some(row => row.id === item.id) ? items : [...items.slice(0, index), item, ...items.slice(index)]);
        },
      },
    });
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
    newGeneration();
    setDraft(draftOf(result.lists));
    setFeedback({ kind: 'saved' });
  }

  const loading = load.kind === 'loading';
  return <form ref={form} className="kairos-settings-card kairos-discipline-lists" aria-labelledby={titleId} onSubmit={event => { void submit(event); }} noValidate>
    <div>
      <h2 id={titleId}>Your checklist</h2>
      <p>These are the steps and questions Kairos asks on your trade cards. Changes apply to answers you give from now on; answers you already saved keep their words.</p>
    </div>
    {loading ? <Skeleton label="Loading your checklist…" /> : null}
    {load.kind === 'failed' ? <ErrorState message="Kairos could not load your checklist." onRetry={() => { refocusAfterRetry.current = document.activeElement?.closest('.kairos-error-state') != null; setLoadAttempt(current => current + 1); }} /> : <>
      {GROUPS.map(group => <fieldset key={group.kind} disabled={loading || saving}>
        <legend>{group.legend}</legend>
        {draft[group.kind].map((item, index) => <div className="kairos-discipline-lists__row" key={item.id}>
          <Field label={`${capital(group.noun)} ${index + 1}`}>
            {control => <input {...control} type="text" value={item.label}
              onChange={event => { const label = event.target.value; change(group.kind, items => items.map((row, at) => (at === index ? { ...row, label } : row))); }} />}
          </Field>
          <Button variant="ghost" size="sm" aria-label={`Remove ${group.noun} ${index + 1}`} onClick={() => remove(group.kind, group.noun, index)}>Remove</Button>
        </div>)}
        <Button variant="secondary" size="sm" onClick={() => change(group.kind, items => [...items, { id: createDisciplineListItemId(), label: '', ruleId: null }])}>{`Add a ${group.noun}`}</Button>
      </fieldset>)}
      <Button type="submit" busy={saving} disabled={loading}>{saving ? 'Saving…' : 'Save your checklist'}</Button>
    </>}
    {feedback?.kind === 'saved' ? <p role="status">Your checklist is saved.</p> : null}
    {feedback?.kind === 'refused' ? <p role="alert">{feedback.message}</p> : null}
  </form>;
}
