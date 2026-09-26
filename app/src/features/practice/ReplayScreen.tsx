import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { parseForexPair } from '../../application/markets/forexPair';
import { loadReplayCandles, REPLAY_CANDLE_SIZES, type LoadedReplay, type ReplayLoadFailure, type ReplayMarketDeps } from '../../application/practice/replayCandles';
import { projectReplayView, type ReplayOrder } from '../../application/practice/replayEngine';
import { projectReplayPicture } from '../../application/practice/replayTrade';
import type { KairosDatabase } from '../../data/database';
import { Button, Card, Field } from '../../design-system/primitives';
import { TradePictureCard } from '../journal/TradePictureCard';
import { ReplayTradePanel } from './ReplayTradePanel';
import './replay.css';

/** How long each candle stays on screen while playing. */
export const REPLAY_PLAY_STEP_MS = 800;

type LoadState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'failed'; readonly reason: ReplayLoadFailure; readonly market: string }
  | { readonly kind: 'ready'; readonly replay: LoadedReplay };

type FieldName = 'market' | 'candleSize' | 'startAt';

/** Plain words for each refusal, and the field it belongs to. `unavailable` is the page's alert instead. */
const FIELD_ERRORS: Readonly<Partial<Record<ReplayLoadFailure, { readonly field: FieldName; readonly text: string }>>> = {
  'market-required': { field: 'market', text: 'Type a market, for example BTCUSDT.' },
  'unknown-market': { field: 'market', text: "Kairos can't find this market on Binance. Check the spelling, for example BTCUSDT." },
  'candle-size-invalid': { field: 'candleSize', text: 'Choose a candle size.' },
  'start-invalid': { field: 'startAt', text: 'Choose the date and time to start from.' },
  'start-in-future': { field: 'startAt', text: 'Pick a time in the past: a replay only uses candles that have finished.' },
  'no-history': { field: 'startAt', text: 'Binance has no candles for this market before that moment. Pick a later time.' },
  'no-future': { field: 'startAt', text: 'There are no finished candles after that moment yet. Pick an earlier time.' },
};

const formatTime = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/** P27 replay: pick a market and a past moment, then show its candles one at a time. Candles live in this page's memory only. */
export function ReplayScreen({ db, market, playStepMs = REPLAY_PLAY_STEP_MS }: { readonly db: KairosDatabase; readonly market: ReplayMarketDeps; readonly playStepMs?: number }) {
  const [form, setForm] = useState({ market: 'BTCUSDT', candleSize: '1h', startAt: '' });
  const [load, setLoad] = useState<LoadState>({ kind: 'idle' });
  const [cursor, setCursor] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Read by a play step when it fires: a step that arrives after the replay stopped does nothing.
  const playingNow = useRef(false);
  const [order, setOrder] = useState<ReplayOrder | null>(null);
  const setupTitleId = useId(), stageTitleId = useId();
  const marketId = useId(), sizeId = useId(), startId = useId();
  const controller = useRef<AbortController | null>(null);
  const stageHeading = useRef<HTMLHeadingElement>(null);
  const focusAfterLoad = useRef<'stage' | FieldName | null>(null);

  useEffect(() => () => controller.current?.abort(), []);

  const play = useCallback((value: boolean) => {
    playingNow.current = value;
    setPlaying(value);
  }, []);

  const replay = load.kind === 'ready' ? load.replay : null;
  const view = useMemo(() => (replay ? projectReplayView(replay.candles, cursor, order) : null), [replay, cursor, order]);
  const picture = useMemo(() => (replay ? projectReplayPicture(replay, cursor, order) : null), [replay, cursor, order]);
  const candlesLeft = view?.candlesLeft ?? 0;

  const start = useCallback(async () => {
    controller.current?.abort();
    const own = new AbortController();
    controller.current = own;
    play(false);
    setLoad({ kind: 'loading' });
    const result = await loadReplayCandles(form, { ...market, signal: own.signal }).catch(() => ({ ok: false as const, reason: 'unavailable' as const }));
    if (own.signal.aborted) return;
    if (result.ok) {
      setOrder(null);
      setCursor(result.replay.startIndex);
      focusAfterLoad.current = 'stage';
      setLoad({ kind: 'ready', replay: result.replay });
    } else {
      focusAfterLoad.current = FIELD_ERRORS[result.reason]?.field ?? null;
      setLoad({ kind: 'failed', reason: result.reason, market: form.market });
    }
  }, [form, market, play]);

  // Focus moves once the new content is on screen.
  useEffect(() => {
    const target = focusAfterLoad.current;
    if (target === null) return;
    focusAfterLoad.current = null;
    if (target === 'stage') stageHeading.current?.focus();
    else document.getElementById({ market: marketId, candleSize: sizeId, startAt: startId }[target])?.focus();
  }, [load, marketId, sizeId, startId]);

  const next = useCallback(() => {
    if (!replay) return;
    setCursor(c => Math.min(c + 1, replay.candles.length));
  }, [replay]);

  // One step per shown candle. The step stops the replay in the same update as the candle that reaches the entry, the
  // exit or the last candle, so the beginner sees it happen; a step that fires after Pause or a new start does nothing.
  useEffect(() => {
    if (!playing || replay === null) return;
    const timer = setTimeout(() => {
      if (!playingNow.current) return;
      const nextCursor = Math.min(cursor + 1, replay.candles.length);
      const before = projectReplayView(replay.candles, cursor, order)?.outcome?.kind ?? null;
      const after = projectReplayView(replay.candles, nextCursor, order);
      const changed = after?.outcome?.kind ?? null;
      if (after === null || after.candlesLeft === 0 || (changed !== before && (changed === 'open' || changed === 'closed'))) play(false);
      setCursor(nextCursor);
    }, playStepMs);
    return () => clearTimeout(timer);
  }, [playing, replay, cursor, order, playStepMs, play]);

  useEffect(() => {
    if (playing && candlesLeft === 0) play(false);
  }, [playing, candlesLeft, play]);

  // The trade changed: stop, so the beginner sees the entry or the exit happen.
  const outcomeKind = view?.outcome?.kind ?? null;
  useEffect(() => {
    if (outcomeKind === 'open' || outcomeKind === 'closed') play(false);
  }, [outcomeKind, play]);

  const again = () => {
    play(false);
    setOrder(null);
    focusAfterLoad.current = 'market';
    setLoad({ kind: 'idle' });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void start();
  };

  const forex = load.kind === 'failed' && load.reason === 'unknown-market' ? parseForexPair(load.market) : null;
  const fieldError = load.kind === 'failed'
    ? (forex !== null && forex.ok && forex.pair.standard
      ? { field: 'market' as const, text: `Replay has crypto markets from Binance only for now, so it cannot replay ${forex.pair.label}. Try a crypto market, for example BTCUSDT.` }
      : FIELD_ERRORS[load.reason])
    : undefined;
  const errorFor = (field: FieldName) => (fieldError?.field === field ? fieldError.text : undefined);
  const loading = load.kind === 'loading';

  return <section className="kairos-route kairos-replay" aria-labelledby="kairos-replay-title">
    <p className="kairos-replay__eyebrow">Practice only</p>
    <h1 id="kairos-replay-title">Replay the past</h1>
    <p>Pick a market and a moment in the past. Kairos shows the candles up to that moment and hides the rest. Then play them one at a time and practise a trade without knowing what comes next. No real money is used.</p>
    <p className="kairos-replay__back"><Link to="/practice">Back to Practice</Link></p>

    {replay && view && picture ? (() => {
      const quote = replay.quoteAsset ? ` ${replay.quoteAsset}` : '';
      const time = formatTime(view.replayTime);
      return <><section className="kairos-replay__stage" aria-labelledby={stageTitleId}>
        <h2 id={stageTitleId} tabIndex={-1} ref={stageHeading}>{replay.symbol} · {replay.candleSize.label} candles</h2>
        <TradePictureCard model={picture} compact={order === null} notes={false} label={order === null ? `${replay.symbol}: ${view.window.length} candles up to ${time}. Price now ${view.last.close}${quote}.` : undefined} />
        <p className="kairos-replay__now" aria-live={playing ? 'off' : 'polite'}>Now in the replay: <time dateTime={view.replayTime}>{time}</time>. Price: <strong>{view.last.close}{quote}</strong></p>
        <div className="kairos-replay__controls" role="group" aria-label="Replay controls">
          <Button onClick={next} disabled={playing || candlesLeft === 0}>Next candle</Button>
          <Button variant="secondary" onClick={() => play(!playingNow.current)} disabled={candlesLeft === 0}>{playing && candlesLeft > 0 ? 'Pause' : 'Play'}</Button>
          <span>{candlesLeft === 0 ? 'No candles left' : candlesLeft === 1 ? '1 candle left' : `${candlesLeft} candles left`}</span>
          <Button variant="ghost" onClick={again}>Choose another moment</Button>
        </div>
        {candlesLeft === 0 ? <p>This replay has no candles left. Choose another moment to keep practising.</p> : null}
      </section>
      <ReplayTradePanel db={db} replay={replay} cursor={cursor} view={view} order={order} onPlace={setOrder} onClear={() => setOrder(null)} />
      </>;
    })() : <>
      <Card as="form" className="kairos-replay__setup" aria-labelledby={setupTitleId} noValidate onSubmit={submit}>
        <h2 id={setupTitleId} tabIndex={-1}>Choose a market and a moment</h2>
        <Field label="Market" id={marketId} required hint="Replay has crypto markets from Binance only for now, such as BTCUSDT." error={errorFor('market')}>
          {control => <input {...control} value={form.market} autoCapitalize="characters" autoComplete="off" spellCheck={false} onChange={event => setForm(value => ({ ...value, market: event.target.value }))} />}
        </Field>
        <Field label="Candle size" id={sizeId} required hint="How much time each candle covers." error={errorFor('candleSize')}>
          {control => <select {...control} value={form.candleSize} onChange={event => setForm(value => ({ ...value, candleSize: event.target.value }))}>
            {REPLAY_CANDLE_SIZES.map(size => <option key={size.interval} value={size.interval}>{size.label}</option>)}
          </select>}
        </Field>
        <Field label="Start from" id={startId} required hint="A date and time in the past, in your time zone." error={errorFor('startAt')}>
          {control => <input {...control} type="datetime-local" value={form.startAt} onChange={event => setForm(value => ({ ...value, startAt: event.target.value }))} />}
        </Field>
        <Button type="submit" busy={loading}>Start replay</Button>
        {loading ? <p>Loading past prices…</p> : null}
      </Card>
      {load.kind === 'failed' && load.reason === 'unavailable' ? <div role="alert" className="kairos-replay__unavailable">
        <p>Past prices are unavailable. Replay needs an internet connection to load them. Your saved trades are not affected.</p>
        <Button onClick={() => { void start(); }}>Try again</Button>
      </div> : null}
    </>}
  </section>;
}
