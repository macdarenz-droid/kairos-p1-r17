import { useEffect, useState } from 'react';
import { loadDisciplineLists, type DisciplineAnswerInput } from '../../application/discipline';
import type { KairosDatabase } from '../../data/database';
import type { DisciplineListItem } from '../../domain/discipline';

interface BeforeYouTradeFieldProps {
  readonly db: KairosDatabase;
  readonly idPrefix: string;
  /** 'checklist' for a draft or open trade in All details; 'after' for Quick log or a closed or cancelled trade, which gets the note instead (D241); null before a status is chosen. */
  readonly mode: 'checklist' | 'after' | null;
  /** Every step of the list as yes or no once one is ticked; empty while nothing is ticked. */
  readonly answers: readonly DisciplineAnswerInput[];
  readonly onAnswersChange: (answers: readonly DisciplineAnswerInput[]) => void;
  readonly disabled: boolean;
}

type ListsState = { readonly kind: 'loading' } | { readonly kind: 'failed' } | { readonly kind: 'ready'; readonly items: readonly DisciplineListItem[] };

/**
 * U12 (D241): "Before you trade" in the trade form. The trader ticks the steps of their checklist before Save, and the ticks
 * are saved with the trade in one write. Nothing ticked means no checklist yet (the card still offers it later).
 */
export function BeforeYouTradeField({ db, idPrefix, mode, answers, onAnswersChange, disabled }: BeforeYouTradeFieldProps) {
  const [lists, setLists] = useState<ListsState>({ kind: 'loading' });
  // The lists are read only once the checklist shows (a draft or open trade), not on every form that never asks for it.
  const asks = mode === 'checklist';
  useEffect(() => {
    if (!asks) return;
    let ignore = false;
    void loadDisciplineLists(db).catch(() => null).then(result => {
      if (!ignore) setLists(result?.ok ? { kind: 'ready', items: result.lists.checklist } : { kind: 'failed' });
    });
    return () => { ignore = true; };
  }, [db, asks]);

  if (mode === null) return null;
  if (mode === 'after') {
    return <section className="kairos-trade-form__section kairos-trade-form__before" aria-labelledby={`${idPrefix}-before-title`}>
      <h2 id={`${idPrefix}-before-title`} className="kairos-trade-form__before-title">Before you trade</h2>
      <p className="kairos-trade-form__section-copy">Logged after the trade, so no checklist.</p>
    </section>;
  }
  if (lists.kind === 'ready' && lists.items.length === 0) return null;

  const ticked = new Set(answers.filter(answer => answer.answer === 'yes').map(answer => answer.itemId));
  const toggle = (items: readonly DisciplineListItem[], itemId: string) => {
    const next = new Set(ticked);
    if (next.has(itemId)) next.delete(itemId); else next.add(itemId);
    onAnswersChange(next.size === 0 ? [] : items.map(item => ({ itemId: item.id, answer: next.has(item.id) ? 'yes' : 'no' })));
  };

  return <fieldset className="kairos-trade-form__section kairos-trade-form__before" disabled={disabled}>
    <legend>Before you trade <span>Optional</span></legend>
    <p className="kairos-trade-form__section-copy">Tick each step you did before this trade. It is saved with the trade.</p>
    {lists.kind === 'loading' ? <p className="kairos-trade-form__section-copy">Loading your checklist…</p> : null}
    {lists.kind === 'failed' ? <p className="kairos-trade-form__section-copy">Kairos could not load your checklist. You can still save this trade and tick it on its card.</p> : null}
    {lists.kind === 'ready' ? lists.items.map(item => <label className="kairos-trade-form__check" key={item.id}>
      <input type="checkbox" name="checklist" checked={ticked.has(item.id)} onChange={() => toggle(lists.items, item.id)} /> <span>{item.label}</span>
    </label>) : null}
  </fieldset>;
}
