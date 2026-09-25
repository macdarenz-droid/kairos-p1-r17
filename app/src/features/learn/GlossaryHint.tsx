import { Component, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GlossaryEntry } from '../../application/learn/glossary';
import { Sheet } from '../../design-system/primitives';
import { GlossaryTermCard, GlossaryWordLink } from './GlossaryTermCard';
import './learn.css';

const UNAVAILABLE = "This explanation can't be shown right now.";

type HintState =
  | { readonly kind: 'idle' }
  | { readonly kind: 'loading' }
  | { readonly kind: 'ready'; readonly entry: GlossaryEntry }
  | { readonly kind: 'missing' };

/** Keeps a broken explanation inside its sheet; the page around it stays. */
class GlossaryHintBoundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    return this.state.failed ? <p>{UNAVAILABLE}</p> : this.props.children;
  }
}

function GlossaryHintEntry({ entry, label, termId }: { readonly entry: GlossaryEntry; readonly label: string; readonly termId: string }) {
  const same = label.trim().toLowerCase() === entry.term.plainWords.toLowerCase();
  return (
    <>
      <GlossaryTermCard term={entry.term} related={entry.related} heading={same ? null : 'h3'} />
      <p><GlossaryWordLink termId={termId}>See all trading words</GlossaryWordLink></p>
    </>
  );
}

/**
 * A small "?" next to a plain word. The glossary loads only on the tap
 * (dynamic import), so the screen that shows the "?" never carries the data.
 */
export function GlossaryHint({ termId, label }: { readonly termId: string; readonly label: string }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<HintState>({ kind: 'idle' });
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  function show(): void {
    setOpen(true);
    if (state.kind === 'ready' || state.kind === 'loading') return;
    setState({ kind: 'loading' });
    import('../../application/learn/glossary')
      .then((module) => module.findGlossaryEntry(termId))
      .then(
        (entry) => { if (mounted.current) setState(entry ? { kind: 'ready', entry } : { kind: 'missing' }); },
        () => { if (mounted.current) setState({ kind: 'missing' }); },
      );
  }

  return (
    <>
      <button type="button" className="kairos-glossary-hint" aria-label={`What does "${label}" mean?`} onClick={show}><span aria-hidden="true">?</span></button>
      <Sheet open={open} title={label} onClose={() => setOpen(false)}>
        <GlossaryHintBoundary>
          {state.kind === 'loading' || state.kind === 'idle' ? <p>Loading…</p> : null}
          {state.kind === 'missing' ? <p>{UNAVAILABLE}</p> : null}
          {state.kind === 'ready' ? <GlossaryHintEntry entry={state.entry} label={label} termId={termId} /> : null}
        </GlossaryHintBoundary>
      </Sheet>
    </>
  );
}
