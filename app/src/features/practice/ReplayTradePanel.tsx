import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import type { LoadedReplay } from '../../application/practice/replayCandles';
import { placeReplayOrder, type ReplayOrder, type ReplayOrderInput, type ReplayOrderInvalidReason, type ReplayView } from '../../application/practice/replayEngine';
import { saveReplayTrade } from '../../application/practice/replayTrade';
import type { KairosDatabase } from '../../data/database';
import { Button, Card, Field } from '../../design-system/primitives';
import './replay.css';

type InputName = 'side' | 'entryPrice' | 'stopPrice' | 'targetPrice' | 'quantity';

const PRICE_ERROR = 'Use a price above 0, like 100 or 0.5.';

/** The field a refusal belongs to and its plain words; null means the page-level alert. */
function refusal(reason: ReplayOrderInvalidReason, side: ReplayOrderInput['side']): { readonly field: InputName; readonly text: string } | null {
  if (reason === 'side-required') return { field: 'side', text: 'Choose buy or sell.' };
  if (reason === 'entry-invalid') return { field: 'entryPrice', text: PRICE_ERROR };
  if (reason === 'stop-invalid') return { field: 'stopPrice', text: PRICE_ERROR };
  if (reason === 'target-invalid') return { field: 'targetPrice', text: PRICE_ERROR };
  if (reason === 'quantity-invalid') return { field: 'quantity', text: 'Use an amount above 0, like 1 or 0.01.' };
  if (reason === 'levels-not-ordered') return { field: 'stopPrice', text: side === 'short' ? 'On a sell, the stop goes above the entry and the target below it.' : 'On a buy, the stop goes below the entry and the target above it.' };
  return null;
}

const RULES = [
  "Your entry is reached when a candle's price touches it. If your entry is the price now, you get in at the next candle's opening price.",
  'If a candle opens past your entry, stop or target, Kairos uses that opening price.',
  "If one candle reaches both your stop and your target, Kairos can't tell which came first, so it counts the stop. This is the careful choice.",
  'If you get in during a candle, only your stop counts on that candle, for the same reason.',
  'Times are when the candle started. Fees are not counted. A saved replay trade keeps the replay\'s dates.',
] as const;

/** P27: plan one practice trade on the replay's price now, follow it candle by candle, and save it once it is finished. */
export function ReplayTradePanel({ db, replay, cursor, view, order, onPlace, onClear }: {
  readonly db: KairosDatabase;
  readonly replay: LoadedReplay;
  readonly cursor: number;
  readonly view: ReplayView;
  readonly order: ReplayOrder | null;
  readonly onPlace: (order: ReplayOrder) => void;
  readonly onClear: () => void;
}) {
  const [input, setInput] = useState<ReplayOrderInput>({ side: '', entryPrice: '', stopPrice: '', targetPrice: '', quantity: '' });
  const [error, setError] = useState<{ readonly field: InputName; readonly text: string } | null>(null);
  const [noCandles, setNoCandles] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const titleId = useId();
  const ids = { side: useId(), entryPrice: useId(), stopPrice: useId(), targetPrice: useId(), quantity: useId() };
  const heading = useRef<HTMLHeadingElement>(null);
  const tradesLink = useRef<HTMLAnchorElement>(null);
  const pendingFocus = useRef<'heading' | 'link' | InputName | null>(null);

  // Focus moves once the new content is on screen.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    if (target === 'heading') heading.current?.focus();
    else if (target === 'link') tradesLink.current?.focus();
    else document.getElementById(ids[target])?.focus();
  });

  const quote = replay.quoteAsset ? ` ${replay.quoteAsset}` : '';
  const set = (name: InputName) => (value: string) => setInput(current => ({ ...current, [name]: value }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const placed = placeReplayOrder(replay.candles, cursor, input);
    if (placed.ok) {
      setError(null);
      setNoCandles(false);
      pendingFocus.current = 'heading';
      onPlace(placed.order);
      return;
    }
    const found = refusal(placed.reason, input.side);
    setError(found);
    setNoCandles(found === null);
    if (found) pendingFocus.current = found.field;
  };

  const save = async () => {
    if (order === null) return;
    setSaving(true);
    setSaveFailed(false);
    const result = await saveReplayTrade(db, replay, cursor, order).catch(() => null);
    setSaving(false);
    if (result?.ok) {
      pendingFocus.current = 'link';
      setSaved(true);
    } else {
      setSaveFailed(true);
    }
  };

  const clear = () => {
    setSaved(false);
    setSaveFailed(false);
    pendingFocus.current = 'side';
    onClear();
  };

  const title = <h2 id={titleId} tabIndex={-1} ref={heading}>Your practice trade</h2>;

  if (order === null) {
    if (view.candlesLeft === 0) return <section className="kairos-replay__trade" aria-labelledby={titleId}>
      {title}
      <p>No candles are left for a new trade. Choose another moment.</p>
    </section>;
    const errorFor = (name: InputName) => (error?.field === name ? error.text : undefined);
    const priceField = (name: 'entryPrice' | 'stopPrice' | 'targetPrice' | 'quantity', label: string, hint: string) => <Field label={label} id={ids[name]} required hint={hint} error={errorFor(name)}>
      {control => <input {...control} inputMode="decimal" autoComplete="off" value={input[name]} onChange={event => set(name)(event.target.value)} />}
    </Field>;
    return <Card as="form" className="kairos-replay__trade" aria-labelledby={titleId} noValidate onSubmit={submit}>
      {title}
      <p>Plan a trade on the price now. Kairos then checks each new candle: did the price reach your entry, your stop or your target?</p>
      <Field label="Direction" id={ids.side} required error={errorFor('side')}>
        {control => <select {...control} value={input.side} onChange={event => set('side')(event.target.value)}>
          <option value="">Choose direction</option>
          <option value="long">Buy (long)</option>
          <option value="short">Sell (short)</option>
        </select>}
      </Field>
      {priceField('entryPrice', 'Entry price', `The price now is ${view.last.close}${quote}. Use it to get in at the next candle's opening price.`)}
      {priceField('stopPrice', 'Stop price', 'Where you get out if the price goes against you.')}
      {priceField('targetPrice', 'Target price', 'Where you take your profit.')}
      {priceField('quantity', 'Quantity', 'How much you pretend to buy or sell, for example 0.01.')}
      <Button type="submit">Place trade</Button>
      {noCandles ? <p role="alert">There are no candles left to play. Choose another moment.</p> : null}
    </Card>;
  }

  const outcome = view.outcome;
  const status = outcome === null || outcome.kind === 'waiting'
    ? 'Waiting for the price to reach your entry.'
    : outcome.kind === 'open'
      ? `Your entry was reached: in at ${outcome.entry.price}${quote}.`
      : `Your ${outcome.reason} was reached: out at ${outcome.exit.price}${quote}.`;
  const jumps: string[] = [];
  if (outcome !== null && outcome.kind !== 'waiting' && outcome.entry.jumped) jumps.push(`The candle opened past your entry, so you got in at its opening price, ${outcome.entry.price}${quote}.`);
  if (outcome?.kind === 'closed' && outcome.exit.jumped) jumps.push(`The candle opened past your ${outcome.reason}, so you got out at its opening price, ${outcome.exit.price}${quote}.`);
  const closed = outcome?.kind === 'closed';

  return <section className="kairos-replay__trade" aria-labelledby={titleId}>
    {title}
    <p>{order.side === 'long' ? 'Buy' : 'Sell'} {order.quantity} at {order.entryPrice}, stop {order.stopPrice}, target {order.targetPrice}.</p>
    <p className="kairos-replay__status" role="status">{status}</p>
    {jumps.map(text => <p key={text}>{text}</p>)}
    <details className="kairos-replay__rules">
      <summary>How Kairos decides</summary>
      <ul>{RULES.map(rule => <li key={rule}>{rule}</li>)}</ul>
    </details>
    {closed && !saved ? <Button busy={saving} onClick={() => { void save(); }}>Save to my practice trades</Button> : null}
    {saveFailed ? <p role="alert">Kairos could not save this practice trade. Nothing was changed.</p> : null}
    {saved ? <>
      <p role="status">Saved with your practice trades. It never counts in your Journal.</p>
      <Link to="/practice" ref={tradesLink}>See your practice trades</Link>
    </> : null}
    {!closed && view.candlesLeft === 0 ? <p>No candles are left and your trade did not reach its stop or target, so it can't be saved. Remove it, or choose another moment.</p> : null}
    <Button variant="secondary" onClick={clear}>{saved ? 'Place another trade' : 'Remove this trade'}</Button>
  </section>;
}
