import type { ManualExecutionRow, ManualFeeRow } from '../../application/trades/manualTradeExecutionDraft';
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
  const updateExecution = (key: string, field: 'price' | 'quantity' | 'executedAt', value: string) =>
    onExecutionsChange(executions.map(row => row.key === key ? { ...row, [field]: value } : row));
  const updateFee = (key: string, field: 'amount' | 'currency', value: string) =>
    onFeesChange(fees.map(row => row.key === key ? { ...row, [field]: value } : row));
  return <fieldset className="kairos-trade-form__section kairos-executions" disabled={disabled}>
    <legend>Actual entries &amp; exits <span>Optional</span></legend>
    <p className="kairos-trade-form__section-copy">Record each entry and exit from your exchange or broker, including partial exits. Each row needs a price, quantity and time.</p>
    {executions.map((row, index) => {
      const title = `${row.type === 'entry' ? 'Entry' : 'Exit'} ${index + 1}`;
      return <fieldset className="kairos-executions__row" key={row.key}>
        <legend>{title}</legend>
        <div className="kairos-executions__grid">
          <label className="kairos-field" htmlFor={`${row.key}-price`}><span>Price</span>
            <input id={`${row.key}-price`} aria-label={`${title} price`} inputMode="decimal" value={row.price} onChange={e => updateExecution(row.key, 'price', e.target.value)} aria-invalid={errorField === `executions.${index}.price` || undefined}/>
          </label>
          <label className="kairos-field" htmlFor={`${row.key}-quantity`}><span>Quantity</span>
            <input id={`${row.key}-quantity`} aria-label={`${title} quantity`} inputMode="decimal" value={row.quantity} onChange={e => updateExecution(row.key, 'quantity', e.target.value)} aria-invalid={errorField === `executions.${index}.quantity` || undefined}/>
          </label>
          <label className="kairos-field kairos-field--wide" htmlFor={`${row.key}-time`}><span>Date &amp; time</span>
            <input id={`${row.key}-time`} aria-label={`${title} date and time`} type="datetime-local" value={row.executedAt} onChange={e => updateExecution(row.key, 'executedAt', e.target.value)} aria-invalid={errorField === `executions.${index}.executedAt` || undefined}/>
          </label>
        </div>
        <button type="button" className="kairos-executions__remove" aria-label={`Remove ${title.toLowerCase()}`} onClick={() => onExecutionsChange(executions.filter(item => item.key !== row.key))}>Remove</button>
      </fieldset>;
    })}
    <div className="kairos-executions__add">
      {(['entry', 'exit'] as const).map(type => <button type="button" key={type} disabled={!canAddExecution} onClick={() => onExecutionsChange([...executions, { key: crypto.randomUUID(), type, price: '', quantity: '', executedAt: '' }])}>Add {type}</button>)}
    </div>
    {!canAddExecution ? <p className="kairos-executions__hint">Choose Open or Closed to add actual entries and exits.</p> : null}
    <p className="kairos-executions__hint">Dates and times use your device time zone.</p>
    <details className="kairos-executions__fees" open={fees.length > 0 || undefined}>
      <summary>Fees · Optional</summary>
      <p className="kairos-executions__hint">Add each recorded fee with its currency. Results use the saved fees; currencies are never converted automatically.</p>
      {fees.map((row, index) => <fieldset className="kairos-executions__row" key={row.key}>
        <legend>Fee {index + 1}</legend>
        <div className="kairos-executions__grid">
          <label className="kairos-field" htmlFor={`${row.key}-amount`}><span>Amount</span><input id={`${row.key}-amount`} aria-label={`Fee ${index + 1} amount`} inputMode="decimal" value={row.amount} onChange={e => updateFee(row.key, 'amount', e.target.value)} aria-invalid={errorField === `fees.${index}.amount` || undefined}/></label>
          <label className="kairos-field" htmlFor={`${row.key}-currency`}><span>Currency</span><input id={`${row.key}-currency`} aria-label={`Fee ${index + 1} currency`} autoCapitalize="characters" value={row.currency} onChange={e => updateFee(row.key, 'currency', e.target.value)} aria-invalid={errorField === `fees.${index}.currency` || undefined}/></label>
        </div>
        <button type="button" className="kairos-executions__remove" aria-label={`Remove fee ${index + 1}`} onClick={() => onFeesChange(fees.filter(item => item.key !== row.key))}>Remove</button>
      </fieldset>)}
      <button type="button" onClick={() => onFeesChange([...fees, { key: crypto.randomUUID(), amount: '', currency: '' }])}>Add fee</button>
    </details>
  </fieldset>;
}
