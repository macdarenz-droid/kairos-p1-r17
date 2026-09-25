import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import {
  loadPracticeMoney, savePracticeMoney, PRACTICE_MONEY_PICTURE_STEPS,
  type PracticeMoneyInvalidReason, type PracticeMoneyUnavailableReason, type PracticeMoneyView,
} from '../../application/practice/practiceMoney';
import type { KairosDatabase } from '../../data/database';
import { Button, Card, Field } from '../../design-system/primitives';
import './practice.css';

const FIELD_ERRORS: Readonly<Record<PracticeMoneyInvalidReason, string>> = {
  'start-amount-invalid': 'Use a number above 0, like 10000 or 2500.50.',
  'currency-invalid': 'Use a currency code such as USD or USDT: letters and digits only, at most 12.',
};

function unavailableLine(reason: PracticeMoneyUnavailableReason, currency: string, resultCurrency: string | null): string {
  switch (reason) {
    case 'other-currency':
      return `Your closed practice trades are in ${resultCurrency}, not ${currency}, and Kairos does not convert currencies. Change your practice money to ${resultCurrency} to see it.`;
    case 'missing-currency':
      return `A closed practice trade has no price currency, and a closed trade can't get one later, so Kairos can't add up your practice money. To count it, delete that trade in your trade history and save it again with the currency code ${currency}.`;
    case 'trade-without-result':
      return 'A closed practice trade has no result Kairos can count: it has no entries and exits, or its fees are not in the same currency as its prices, and Kairos does not convert currencies. Fix it in your trade history, or delete it and save it again, to see your practice money.';
    case 'mixed-currencies':
      return "Your closed practice trades use more than one currency, and Kairos does not convert currencies, so it can't add up your practice money.";
    case 'calculation-failed':
      return 'Kairos could not work out your practice money. Your stored trades were not changed.';
  }
}

const OUTCOME_MARK = { profit: '▲', loss: '▼', breakeven: '—' } as const;
type FocusTarget = 'heading' | 'amount' | 'currency' | null;

/** "Your practice money": the pretend start, what it is now as two bars, and the form to set or change it. Every number comes from the owner. */
export function PracticeMoneyCard({ db, refreshRevision }: { readonly db: KairosDatabase; readonly refreshRevision: number }) {
  const titleId = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const currencyInput = useRef<HTMLInputElement>(null);
  const focusNext = useRef<FocusTarget>(null);
  const [view, setView] = useState<'loading' | 'error' | PracticeMoneyView>('loading');
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [fieldError, setFieldError] = useState<PracticeMoneyInvalidReason | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedNotice, setSavedNotice] = useState(false);
  const [localRevision, setLocalRevision] = useState(0);

  // Only the first load shows "loading"; a reload keeps the last view until the new one arrives.
  useEffect(() => {
    let ignore = false;
    loadPracticeMoney(db).then(
      (next) => { if (!ignore) setView(next); },
      () => { if (!ignore) setView('error'); },
    );
    return () => { ignore = true; };
  }, [db, refreshRevision, localRevision]);

  // Focus moves after the render that shows its target.
  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    (target === 'heading' ? heading : target === 'amount' ? amountInput : currencyInput).current?.focus();
  });

  const notSet = typeof view === 'object' && view.kind === 'not-set';
  const showForm = notSet || editing;

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setSaveFailed(false);
    setFieldError(null);
    const result = await savePracticeMoney(db, { startAmount: amount, currency });
    setSaving(false);
    if (result.ok) {
      setEditing(false);
      setFieldError(null);
      setSavedNotice(true);
      setLocalRevision((value) => value + 1);
      focusNext.current = 'heading';
      heading.current?.focus();
      return;
    }
    if (result.type === 'validation-error') {
      setFieldError(result.reason);
      focusNext.current = result.reason === 'start-amount-invalid' ? 'amount' : 'currency';
      (result.reason === 'start-amount-invalid' ? amountInput : currencyInput).current?.focus();
      return;
    }
    setSaveFailed(true);
  }

  function edit(): void {
    if (typeof view !== 'object' || view.kind === 'not-set') return;
    setAmount(view.money.startAmount);
    setCurrency(view.money.currency);
    setFieldError(null);
    setSaveFailed(false);
    setSavedNotice(false);
    setEditing(true);
    focusNext.current = 'amount';
  }

  function cancel(): void {
    setEditing(false);
    setFieldError(null);
    setSaveFailed(false);
    focusNext.current = 'heading';
  }

  const notice = <p className="kairos-practice-money__notice">Pretend money: no real money is used. A practice trade counts once it is closed. Your Journal, goals and Home never use it.</p>;
  const changeButton = <Button variant="secondary" size="sm" onClick={edit}>Change starting amount</Button>;

  return (
    <Card as="section" className="kairos-practice-money" aria-labelledby={titleId}>
      <h2 id={titleId} ref={heading} tabIndex={-1}>Your practice money</h2>
      {view === 'loading' ? <p>Loading your practice money…</p> : null}
      {view === 'error' ? <p>Kairos could not load your practice money. Your stored trades were not changed.</p> : null}
      {typeof view === 'object' && showForm ? (
        <form className="kairos-practice-money__form" noValidate onSubmit={(event) => { void submit(event); }}>
          {notSet ? <p>Practise with pretend money before you risk real money. Choose how much to start with.</p> : null}
          <Field label="Starting amount" required hint="Pretend money, for example 10000." error={fieldError === 'start-amount-invalid' ? FIELD_ERRORS['start-amount-invalid'] : undefined}>
            {(control) => <input {...control} ref={amountInput} inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} />}
          </Field>
          <Field label="Money currency" required hint="Use the same code as the price currency on your practice trades, such as USDT." error={fieldError === 'currency-invalid' ? FIELD_ERRORS['currency-invalid'] : undefined}>
            {(control) => <input {...control} ref={currencyInput} autoCapitalize="characters" autoComplete="off" spellCheck={false} value={currency} onChange={(event) => setCurrency(event.target.value)} />}
          </Field>
          {saveFailed ? <p role="alert">Kairos could not save your practice money. Nothing was changed.</p> : null}
          <div className="kairos-practice-money__actions">
            <Button type="submit" busy={saving}>{notSet ? 'Start practising' : 'Save'}</Button>
            {editing ? <Button variant="secondary" onClick={cancel}>Cancel</Button> : null}
          </div>
        </form>
      ) : null}
      {typeof view === 'object' && view.kind === 'ready' && !editing ? (
        <>
          <div className="kairos-practice-money__bars" role="img" aria-label={`Practice money: started with ${view.money.startAmount} ${view.money.currency}, now ${view.currentAmount} ${view.money.currency}.`}>
            <span>Started with</span>
            <span className="kairos-practice-money__bar" data-bar="start" data-steps={view.startSteps}><span style={{ inlineSize: `${(view.startSteps / PRACTICE_MONEY_PICTURE_STEPS) * 100}%` }} /></span>
            <span>Now</span>
            <span className="kairos-practice-money__bar" data-bar="now" data-steps={view.currentSteps} data-outcome={view.outcome}><span style={{ inlineSize: `${(view.currentSteps / PRACTICE_MONEY_PICTURE_STEPS) * 100}%` }} /></span>
          </div>
          <p className="kairos-practice-money__now"><span aria-hidden="true">{OUTCOME_MARK[view.outcome]}</span> Now: <strong>{view.currentAmount} {view.money.currency}</strong></p>
          <p>Started with {view.money.startAmount} {view.money.currency}.</p>
          <p>
            {view.closedTrades === 0
              ? 'No closed practice trades yet.'
              : `${view.closedTrades === 1 ? '1 closed practice trade' : `${view.closedTrades} closed practice trades`}: ${view.outcome === 'profit' ? '+' : ''}${view.resultSoFar} ${view.money.currency} so far.`}
          </p>
          {notice}
          {changeButton}
        </>
      ) : null}
      {typeof view === 'object' && view.kind === 'unavailable' && !editing ? (
        <>
          <p>Started with {view.money.startAmount} {view.money.currency}.</p>
          <p>{unavailableLine(view.reason, view.money.currency, view.resultCurrency)}</p>
          {notice}
          {changeButton}
        </>
      ) : null}
      {savedNotice ? <p role="status">Practice money saved.</p> : null}
    </Card>
  );
}
