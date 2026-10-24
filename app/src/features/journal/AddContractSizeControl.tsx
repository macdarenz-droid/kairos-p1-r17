import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../../application/journal';
import type { AddTradeContractSizeInput, AddTradeContractSizeResult } from '../../application/trades';
import { Button, Field, PriceInput } from '../../design-system/primitives';
import './addContractSize.css';

/** The hint wherever "Each point is worth" is asked (the trade form and this control). */
export const CONTRACT_SIZE_HINT = 'For one contract, in your price currency. For example 50 for one e-mini S&P 500 point, or 100 for most US stock options. Leave it empty for crypto perpetuals priced in USDT.';

const REFUSED: Readonly<Record<Exclude<AddTradeContractSizeResult, { ok: true }>['reason'] | 'invalid', string>> = {
  invalid: 'Enter how much one point is worth, such as 50.',
  'trade-not-found': 'This trade is no longer saved on this device.',
  'trade-changed': 'This trade changed in another tab. Reload the page to see it, then try again.',
  'not-futures-or-options': 'Only futures and options trades need how much one point is worth.',
  'contract-size-recorded': 'How much one point is worth is already saved for this trade.',
  'trade-save-failed': 'Kairos could not save it. Your value is kept, so you can try again.',
};

interface AddContractSizeControlProps {
  readonly entry: JournalHistoryEntry;
  readonly idPrefix: string;
  readonly save: (input: AddTradeContractSizeInput) => Promise<AddTradeContractSizeResult>;
  /** Reloads what shows the trade, which then moves focus to its result (D237: the result appears after saving). */
  readonly onSaved: () => Promise<void> | void;
}

/**
 * U11 (D237): "Add how much one point is worth" for a saved futures or options trade with none. It can be added once,
 * never changed (like a missing price currency). Opening focuses the field; Cancel returns focus to the button.
 */
export function AddContractSizeControl({ entry, idPrefix, save, onSaved }: AddContractSizeControlProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const reopened = useRef(false);

  useEffect(() => {
    if (open) fieldRef.current?.focus();
    else if (reopened.current) openRef.current?.focus();
  }, [open]);
  // A refused value keeps the field open and focused, with the reason read as its description.
  useEffect(() => { if (error) fieldRef.current?.focus(); }, [error]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await save({ expected: { trade: entry.trade, executions: entry.executions, fees: entry.fees }, contractSize: value }).catch((): AddTradeContractSizeResult => ({ ok: false, type: 'storage-error', reason: 'trade-save-failed' }));
    setSaving(false);
    if (!result.ok) {
      setError(REFUSED[result.type === 'validation-error' ? 'invalid' : result.reason]);
      return;
    }
    await onSaved();
  }

  if (!open) {
    return <Button ref={openRef} variant="secondary" size="sm" className="kairos-add-point-value__open" onClick={() => { reopened.current = true; setOpen(true); }}>
      Add how much one point is worth
    </Button>;
  }
  return <form className="kairos-add-point-value" onSubmit={submit} noValidate aria-label={`How much one point is worth for ${entry.trade.symbol}`}>
    <Field label="Each point is worth" id={`${idPrefix}-point-value`} hint={CONTRACT_SIZE_HINT} error={error ?? undefined}>
      {control => <PriceInput {...control} ref={fieldRef} name="contractSize" value={value} onValueChange={text => { setValue(text); setError(null); }} disabled={saving} />}
    </Field>
    <div className="kairos-add-point-value__actions">
      <Button type="submit" size="sm" busy={saving}>{saving ? 'Saving…' : 'Save'}</Button>
      <Button variant="ghost" size="sm" disabled={saving} onClick={() => { setOpen(false); setValue(''); setError(null); }}>Cancel</Button>
    </div>
  </form>;
}
