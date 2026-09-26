import { useState, type FormEvent } from 'react';
import { summarizeTradeChecklist, type SaveTradeDisciplineInput, type SaveTradeDisciplineResult } from '../../application/discipline';
import type { JournalHistoryScope } from '../../application/journal';
import { Button, Sheet } from '../../design-system/primitives';
import type { DisciplineListItem, TradeDisciplineRecord } from '../../domain/discipline';
import './tradeDisciplineControls.css';

export interface TradeChecklistControlProps {
  readonly symbol: string;
  readonly tradeId: string;
  /** Which trades the page may write for; the host sets it. */
  readonly scope: JournalHistoryScope;
  /** The current checklist list. */
  readonly items: readonly DisciplineListItem[];
  readonly record: TradeDisciplineRecord | null;
  /** The host binds the database; this component never touches storage. */
  readonly save: (input: SaveTradeDisciplineInput) => Promise<SaveTradeDisciplineResult>;
  readonly onSaved: (record: TradeDisciplineRecord) => void;
}

interface Row { readonly itemId: string; readonly label: string; readonly ticked: boolean; }

/** A trade keeps the checklist it was answered with; an unanswered trade gets the current list, all empty. */
function rowsFor(items: readonly DisciplineListItem[], record: TradeDisciplineRecord | null): Row[] {
  if (record !== null && record.checklistCompletedAt !== null && record.preTradeChecklist.length > 0) {
    return record.preTradeChecklist.map(answer => ({ itemId: answer.itemId, label: answer.label, ticked: answer.answer === 'yes' }));
  }
  return items.map(item => ({ itemId: item.id, label: item.label, ticked: false }));
}

/** "Before you trade" on a draft or open card: the steps the trader did, ticked in a sheet, saved in one write. */
export function TradeChecklistControl({ symbol, tradeId, scope, items, record, save, onSaved }: TradeChecklistControlProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const summary = summarizeTradeChecklist(record);
  if (summary === null && items.length === 0) return null;

  function openSheet(): void {
    setRows(rowsFor(items, record));
    setFailed(false);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFailed(false);
    const result = await save({ tradeId: tradeId as SaveTradeDisciplineInput['tradeId'], scope, half: 'checklist', answers: rows.map(row => ({ itemId: row.itemId, answer: row.ticked ? 'yes' : 'no' })) }).catch(() => null);
    setSaving(false);
    if (result === null || !result.ok) { setFailed(true); return; }
    setOpen(false);
    onSaved(result.record);
  }

  const toggle = (index: number) => setRows(current => current.map((row, at) => (at === index ? { ...row, ticked: !row.ticked } : row)));

  return <>
    <Button variant="secondary" size="sm" className="kairos-discipline-control" onClick={openSheet}
      aria-label={summary === null ? 'Before you trade: not done yet' : `Before you trade: ${summary.ticked} of ${summary.asked} ticked`}>
      <span className="kairos-discipline-control__title">Before you trade</span>
      {summary === null ? <span className="kairos-discipline-control__state">Not done yet</span> : <>
        <span className="kairos-discipline-dots" aria-hidden="true">
          {record!.preTradeChecklist.map(answer => <span key={answer.itemId} data-ticked={answer.answer === 'yes' ? 'true' : 'false'}>{answer.answer === 'yes' ? '●' : '○'}</span>)}
        </span>
        <span className="kairos-discipline-control__state">{summary.ticked} of {summary.asked} ticked</span>
      </>}
    </Button>
    <Sheet open={open} title={`Before you trade: ${symbol}`} onClose={() => setOpen(false)}>
      <form className="kairos-discipline-sheet" onSubmit={event => { void submit(event); }} noValidate>
        <p>Tick each step you did before this trade. Leave a step empty if you did not do it.</p>
        <fieldset>
          <legend>Your steps</legend>
          {rows.map((row, index) => <label className="kairos-discipline-check" key={row.itemId}>
            <input type="checkbox" checked={row.ticked} onChange={() => toggle(index)} /> <span>{row.label}</span>
          </label>)}
        </fieldset>
        {failed ? <p role="alert">Kairos could not save your checklist. Your ticks are kept so you can try again.</p> : null}
        <Button type="submit" busy={saving}>{saving ? 'Saving…' : 'Save checklist'}</Button>
      </form>
    </Sheet>
  </>;
}
