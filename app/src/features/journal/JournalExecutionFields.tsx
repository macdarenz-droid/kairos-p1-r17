import { useEffect, useLayoutEffect, useRef } from 'react';
import type { ManualExecutionRow, ManualFeeRow } from '../../application/trades/manualTradeExecutionDraft';
import { Button, PriceInput, useToast } from '../../design-system/primitives';
import './journalExecutionFields.css';

interface Props {
  readonly executions: readonly ManualExecutionRow[];
  readonly fees: readonly ManualFeeRow[];
  readonly onExecutionsChange: (rows: readonly ManualExecutionRow[]) => void;
  readonly onFeesChange: (rows: readonly ManualFeeRow[]) => void;
  readonly canAddExecution: boolean;
  readonly disabled: boolean;
  readonly errorField?: string;
}

export function JournalExecutionFields({ executions, fees, onExecutionsChange, onFeesChange, canAddExecution, disabled, errorField }: Props) {
  const toast = useToast();
  // Undo reads the rows as they are when it runs, so edits made while the toast was shown are kept.
  const latest = useRef({ executions, fees });
  latest.current = { executions, fees };
  // True while this form's "Undo" toast may be up. When the rows go away (saved, cancelled, closed) the toast closes with
  // them, so an Undo never puts an old row into a new or cancelled form (D178).
  const undoShown = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; if (undoShown.current) { undoShown.current = false; toast.dismiss(); } };
  }, [toast]);
  // Where focus goes after "Remove" or "Undo" (WCAG 2.4.3): a field id, or the text of an "Add …" button.
  const section = useRef<HTMLFieldSetElement>(null);
  const focusNext = useRef<Readonly<{ id: string } | { add: string }> | null>(null);
  useLayoutEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    const element = 'id' in target ? document.getElementById(target.id)
      : [...(section.current?.querySelectorAll('button') ?? [])].find(button => button.textContent === target.add && !button.disabled);
    element?.focus();
  }, [executions, fees]);
  const afterRemoval = <T extends { key: string }>(rows: readonly T[], index: number, field: string, add: string) => {
    const next = rows[index + 1] ?? rows[index - 1];
    focusNext.current = next ? { id: `${next.key}-${field}` } : { add };
  };
  const undo = (onAction: () => void) => {
    undoShown.current = true;
    return () => { undoShown.current = false; if (mounted.current) onAction(); };
  };
  const removeExecution = (row: ManualExecutionRow, index: number, title: string) => {
    afterRemoval(executions, index, 'price', row.type === 'entry' ? 'Add entry' : 'Add exit');
    onExecutionsChange(executions.filter(item => item.key !== row.key));
    toast.show({ message: `${title} removed.`, action: { label: 'Undo', onAction: undo(() => {
      const rows = latest.current.executions;
      if (rows.some(item => item.key === row.key)) return;
      focusNext.current = { id: `${row.key}-price` };
      onExecutionsChange([...rows.slice(0, index), row, ...rows.slice(index)]);
    }) } });
  };
  const removeFee = (row: ManualFeeRow, index: number) => {
    afterRemoval(fees, index, 'amount', 'Add fee');
    onFeesChange(fees.filter(item => item.key !== row.key));
    toast.show({ message: `Fee ${index + 1} removed.`, action: { label: 'Undo', onAction: undo(() => {
      const rows = latest.current.fees;
      if (rows.some(item => item.key === row.key)) return;
      focusNext.current = { id: `${row.key}-amount` };
      onFeesChange([...rows.slice(0, index), row, ...rows.slice(index)]);
    }) } });
  };
  const updateExecution = (key: string, field: 'price' | 'quantity' | 'executedAt', value: string) =>
    onExecutionsChange(executions.map(row => row.key === key ? { ...row, [field]: value } : row));
  const updateFee = (key: string, field: 'amount' | 'currency', value: string) =>
    onFeesChange(fees.map(row => row.key === key ? { ...row, [field]: value } : row));
  return <fieldset ref={section} className="kairos-trade-form__section kairos-executions" disabled={disabled}>
    <legend>Actual entries &amp; exits <span>Optional</span></legend>
    <p className="kairos-trade-form__section-copy">Record each entry and exit from your exchange or broker, including partial exits. Each row needs a price, quantity and time.</p>
    {executions.map((row, index) => {
      const title = `${row.type === 'entry' ? 'Entry' : 'Exit'} ${index + 1}`;
      return <fieldset className="kairos-executions__row" key={row.key}>
        <legend>{title}</legend>
        <div className="kairos-executions__grid">
          <label className="kairos-field" htmlFor={`${row.key}-price`}><span>Price</span>
            <PriceInput id={`${row.key}-price`} aria-label={`${title} price`} value={row.price} onValueChange={text => updateExecution(row.key, 'price', text)} aria-invalid={errorField === `executions.${index}.price` || undefined}/>
          </label>
          <label className="kairos-field" htmlFor={`${row.key}-quantity`}><span>Quantity</span>
            <PriceInput id={`${row.key}-quantity`} aria-label={`${title} quantity`} value={row.quantity} onValueChange={text => updateExecution(row.key, 'quantity', text)} aria-invalid={errorField === `executions.${index}.quantity` || undefined}/>
          </label>
          <label className="kairos-field kairos-field--wide" htmlFor={`${row.key}-time`}><span>Date &amp; time</span>
            <input id={`${row.key}-time`} aria-label={`${title} date and time`} type="datetime-local" value={row.executedAt} onChange={e => updateExecution(row.key, 'executedAt', e.target.value)} aria-invalid={errorField === `executions.${index}.executedAt` || undefined}/>
          </label>
        </div>
        <Button variant="ghost" size="sm" className="kairos-executions__remove" aria-label={`Remove ${title.toLowerCase()}`} onClick={() => removeExecution(row, index, title)}>Remove</Button>
      </fieldset>;
    })}
    <div className="kairos-executions__add">
      {(['entry', 'exit'] as const).map(type => <Button variant="secondary" size="sm" key={type} disabled={!canAddExecution} onClick={() => onExecutionsChange([...executions, { key: crypto.randomUUID(), type, price: '', quantity: '', executedAt: '' }])}>Add {type}</Button>)}
    </div>
    {!canAddExecution ? <p className="kairos-executions__hint">Choose Open or Closed to add actual entries and exits.</p> : null}
    <p className="kairos-executions__hint">Dates and times use your device time zone.</p>
    <details className="kairos-executions__fees" open={fees.length > 0 || undefined}>
      <summary>Fees · Optional</summary>
      <p className="kairos-executions__hint">Add each recorded fee with its currency. Results use the saved fees; currencies are never converted automatically.</p>
      {fees.map((row, index) => <fieldset className="kairos-executions__row" key={row.key}>
        <legend>Fee {index + 1}</legend>
        <div className="kairos-executions__grid">
          <label className="kairos-field" htmlFor={`${row.key}-amount`}><span>Amount</span><PriceInput id={`${row.key}-amount`} aria-label={`Fee ${index + 1} amount`} value={row.amount} onValueChange={text => updateFee(row.key, 'amount', text)} aria-invalid={errorField === `fees.${index}.amount` || undefined}/></label>
          <label className="kairos-field" htmlFor={`${row.key}-currency`}><span>Currency</span><input id={`${row.key}-currency`} aria-label={`Fee ${index + 1} currency`} autoCapitalize="characters" value={row.currency} onChange={e => updateFee(row.key, 'currency', e.target.value)} aria-invalid={errorField === `fees.${index}.currency` || undefined}/></label>
        </div>
        <Button variant="ghost" size="sm" className="kairos-executions__remove" aria-label={`Remove fee ${index + 1}`} onClick={() => removeFee(row, index)}>Remove</Button>
      </fieldset>)}
      <Button variant="secondary" size="sm" onClick={() => onFeesChange([...fees, { key: crypto.randomUUID(), amount: '', currency: '' }])}>Add fee</Button>
    </details>
  </fieldset>;
}
