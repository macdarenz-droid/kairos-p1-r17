import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteStrategy, exampleStrategyDraft, loadStrategies, saveStrategy, strategyDraftFrom, type StrategyDraft } from '../../application/discipline/strategies';
import { describeStrategyRule } from '../../application/discipline/strategyWords';
import type { KairosDatabase } from '../../data/database';
import type { Strategy, StrategyId } from '../../domain/discipline';
import { Button, Card } from '../../design-system/primitives';
import { StrategyEditor } from './StrategyEditor';
import './strategies.css';

type LoadState = { readonly kind: 'loading' } | { readonly kind: 'failed' } | { readonly kind: 'ready'; readonly strategies: readonly Strategy[] };
type Feedback = null | { readonly kind: 'saved' | 'deleted'; readonly name: string } | { readonly kind: 'delete-failed' };

const EMPTY_DRAFT: StrategyDraft = { id: null, name: '', rules: [] };
const headingId = (id: StrategyId) => `kairos-strategy-${id}`;

/** P28: the trader's strategies as plain sentences, with an example to start from, the editor and a confirmed delete. */
export function StrategiesScreen({ db }: { readonly db: KairosDatabase }) {
  const [load, setLoad] = useState<LoadState>({ kind: 'loading' });
  const [editing, setEditing] = useState<StrategyDraft | null>(null);
  const [confirming, setConfirming] = useState<StrategyId | null>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const pendingFocus = useRef<string | null>(null);

  const reload = useCallback(async () => {
    const result = await loadStrategies(db).catch(() => null);
    setLoad(result?.ok ? { kind: 'ready', strategies: result.strategies } : { kind: 'failed' });
  }, [db]);
  useEffect(() => { void reload(); }, [reload]);

  // Focus moves once the new content is on screen.
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    const element = document.getElementById(target);
    if (!element) return;
    pendingFocus.current = null;
    element.focus();
  });

  const startEditing = (draft: StrategyDraft) => {
    setFeedback(null);
    setConfirming(null);
    setEditing(draft);
  };

  const remove = async (strategy: Strategy) => {
    const result = await deleteStrategy(db, strategy.id).catch(() => null);
    setConfirming(null);
    if (result?.ok) {
      await reload();
      setFeedback({ kind: 'deleted', name: strategy.name });
      pendingFocus.current = 'kairos-strategies-title';
    } else {
      setFeedback({ kind: 'delete-failed' });
      pendingFocus.current = 'kairos-strategies-delete-failed';
    }
  };

  return <section className="kairos-route kairos-strategies" aria-labelledby="kairos-strategies-title">
    <div>
      <p className="kairos-strategies__eyebrow">Discipline</p>
      <h1 id="kairos-strategies-title" tabIndex={-1}>Your strategies</h1>
      <p>A strategy is your own plan for one kind of trade, written as rules. When you log a trade, choose the strategy it follows: Kairos checks the rules it can from your trade plan, and you tick the others yourself. A rule never stops you saving a trade.</p>
    </div>
    {feedback?.kind === 'saved' ? <p role="status">Strategy saved.</p> : null}
    {feedback?.kind === 'deleted' ? <p role="status">{feedback.name} was deleted. Trades that used it keep its rules.</p> : null}
    {feedback?.kind === 'delete-failed' ? <p role="alert" tabIndex={-1} id="kairos-strategies-delete-failed">Kairos could not delete this strategy. Nothing was changed.</p> : null}

    {load.kind === 'loading' ? <p>Loading your strategies…</p> : null}
    {load.kind === 'failed' ? <p>Kairos could not load your strategies. Your trades are not affected.</p> : null}

    {load.kind === 'ready' && editing !== null ? <StrategyEditor
      initial={editing}
      save={draft => saveStrategy(db, draft)}
      onSaved={strategy => {
        void reload().then(() => {
          setFeedback({ kind: 'saved', name: strategy.name });
          setEditing(null);
          pendingFocus.current = headingId(strategy.id);
        });
      }}
      onCancel={() => {
        pendingFocus.current = editing.id === null ? 'kairos-strategies-title' : headingId(editing.id);
        setEditing(null);
      }}
    /> : null}

    {load.kind === 'ready' && editing === null ? (load.strategies.length === 0
      ? <Card className="kairos-strategies__empty">
        <p>You have no strategies yet. Start from an example you can change, or write your own.</p>
        <Button onClick={() => startEditing(exampleStrategyDraft())}>Start from an example</Button>
        <Button variant="secondary" onClick={() => startEditing(EMPTY_DRAFT)}>Write your own</Button>
      </Card>
      : <>
        <ul className="kairos-strategies__list">
          {load.strategies.map(strategy => {
            const h2Id = headingId(strategy.id);
            const deleteId = `kairos-strategy-delete-${strategy.id}`, keepId = `kairos-strategy-keep-${strategy.id}`;
            return <li key={strategy.id}>
              <Card as="article" aria-labelledby={h2Id}>
                <h2 id={h2Id} tabIndex={-1}>{strategy.name}</h2>
                <ul className="kairos-strategies__rules">
                  {strategy.rules.map(rule => <li key={rule.id}>{describeStrategyRule(rule)}</li>)}
                </ul>
                <Button variant="secondary" size="sm" aria-label={`Change ${strategy.name}`} onClick={() => startEditing(strategyDraftFrom(strategy))}>Change</Button>
                <Button id={deleteId} variant="ghost" size="sm" aria-label={`Delete ${strategy.name}`} onClick={() => { setFeedback(null); setConfirming(strategy.id); pendingFocus.current = keepId; }}>Delete</Button>
                {confirming === strategy.id ? <div role="group" aria-label={`Delete ${strategy.name}?`}>
                  <p>Delete {strategy.name}? Trades that used it keep its rules as they were.</p>
                  <Button onClick={() => { void remove(strategy); }}>Yes, delete it</Button>
                  <Button id={keepId} variant="secondary" onClick={() => { setConfirming(null); pendingFocus.current = deleteId; }}>Keep it</Button>
                </div> : null}
              </Card>
            </li>;
          })}
        </ul>
        <Button onClick={() => startEditing(EMPTY_DRAFT)}>Add a strategy</Button>
      </>) : null}
  </section>;
}
