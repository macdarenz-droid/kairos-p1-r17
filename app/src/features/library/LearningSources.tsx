import { Component, useEffect, useState, type ReactNode } from 'react';
import {
  browserLearningSourceDevice,
  learningSourceHref,
  readLearningSourceCatalog,
  readLearningSourceOfflineStates,
  removeLearningSourceFromDevice,
  saveLearningSourceForOffline,
  type LearningSourceDevice,
} from '../../application/library';
import { Button } from '../../design-system/primitives';
import { formatLearningSourceSize, type LearningSource, type LearningSourceCatalog } from '../../domain/library/learningSources';
import './learningSources.css';

export interface LearningSourcesProps {
  readonly device?: LearningSourceDevice;
  readonly catalog?: LearningSourceCatalog;
}

type OfflineState =
  | 'checking' | 'unsupported' | 'not-saved' | 'saving' | 'saved' | 'removing' | 'remove-failed'
  | 'download-failed' | 'file-mismatch' | 'not-enough-space' | 'storage-failed';

const STATE_TEXT: Readonly<Record<OfflineState, string>> = {
  'checking': 'Checking this device…',
  'unsupported': "This browser can't keep files for offline reading. It opens when you're online.",
  'not-saved': "Not saved on this device. It opens when you're online.",
  'saving': 'Saving and checking the file…',
  'saved': 'Saved for offline',
  'removing': 'Removing from this device…',
  'remove-failed': "Saved for offline. Kairos couldn't remove it from this device.",
  'download-failed': "Couldn't download it. Check your internet and try again.",
  'file-mismatch': "The downloaded file didn't match the Library's record, so it wasn't saved.",
  'not-enough-space': 'Not enough free space on this device. Kairos keeps room for your journal.',
  'storage-failed': "This device couldn't save the file.",
};

const TITLE_ID = 'kairos-learning-sources-title';
const INTRO = "Guides you read in your browser's own PDF viewer. Save one to read it without the internet.";

function Action({ source, state, onSave, onRemove }: { readonly source: LearningSource; readonly state: OfflineState; readonly onSave: () => void; readonly onRemove: () => void }) {
  const { title } = source;
  if (state === 'not-saved' || state === 'saving') {
    return <Button variant="secondary" size="sm" busy={state === 'saving'} onClick={onSave} aria-label={`Save for offline: ${title}`}>Save for offline</Button>;
  }
  if (state === 'saved' || state === 'removing' || state === 'remove-failed') {
    return <Button variant="ghost" size="sm" busy={state === 'removing'} onClick={onRemove} aria-label={`Remove from this device: ${title}`}>Remove from this device</Button>;
  }
  if (state === 'download-failed' || state === 'file-mismatch' || state === 'not-enough-space' || state === 'storage-failed') {
    return <Button variant="secondary" size="sm" onClick={onSave} aria-label={`Try again: save ${title} for offline`}>Try again</Button>;
  }
  return null;
}

function LearningSourcesList({ device: givenDevice, catalog: givenCatalog }: LearningSourcesProps) {
  const [device] = useState(() => givenDevice ?? browserLearningSourceDevice());
  const [catalog] = useState(() => givenCatalog ?? readLearningSourceCatalog());
  const [states, setStates] = useState<ReadonlyMap<string, OfflineState>>(() =>
    new Map(catalog.sources.map(source => [source.id, device.openCache === null ? 'unsupported' as const : 'checking' as const])));

  useEffect(() => {
    if (device.openCache === null) return;
    let ignore = false;
    void readLearningSourceOfflineStates(catalog.sources, device).then(result => {
      if (ignore) return;
      setStates(new Map(catalog.sources.map(source => [source.id, result.kind === 'unsupported' ? 'unsupported' as const : result.saved.has(source.id) ? 'saved' as const : 'not-saved' as const])));
    });
    return () => { ignore = true; };
  }, [catalog, device]);

  const setState = (id: string, state: OfflineState) => setStates(current => new Map(current).set(id, state));
  const save = async (source: LearningSource) => {
    setState(source.id, 'saving');
    const result = await saveLearningSourceForOffline(source, device);
    setState(source.id, result.ok ? 'saved' : result.reason);
  };
  const remove = async (source: LearningSource) => {
    setState(source.id, 'removing');
    const result = await removeLearningSourceFromDevice(source, device);
    setState(source.id, result.ok ? 'not-saved' : result.reason === 'storage-failed' ? 'remove-failed' : 'unsupported');
  };

  return <section className="kairos-learning-sources" aria-labelledby={TITLE_ID}>
    <h2 id={TITLE_ID}>Learning sources</h2>
    <p className="kairos-learning-sources__note">{INTRO}</p>
    {catalog.problems.length > 0 ? <p className="kairos-learning-sources__note">Some learning sources could not be shown.</p> : null}
    {catalog.sources.length === 0 ? <p className="kairos-learning-sources__note">No learning sources in this version yet.</p> : <ul className="kairos-learning-sources__list">
      {catalog.sources.map(source => {
        const state = states.get(source.id) ?? 'checking';
        const { title, revision } = source;
        return <li key={source.id} className="kairos-learning-source" data-learning-source-id={source.id} data-offline-state={state}>
          <h3 lang={source.language}>{title}</h3>
          <p>{source.covers}</p>
          <p className="kairos-learning-source__facts">{`${source.author === null ? 'Author not recorded' : `By ${source.author}`} · ${source.origin}`}</p>
          <p className="kairos-learning-source__facts">{`PDF · ${formatLearningSourceSize(revision.bytes)}${revision.pages === null ? '' : ` · ${revision.pages === 1 ? '1 page' : `${revision.pages} pages`}`}`}</p>
          <p className="kairos-learning-source__offline" aria-live="polite">{STATE_TEXT[state]}</p>
          <div className="kairos-learning-source__actions">
            <a className="kairos-learning-source__open" href={learningSourceHref(source)} target="_blank" rel="noopener noreferrer" aria-label={`Open PDF: ${title} (opens in a new tab)`}>Open PDF</a>
            <Action source={source} state={state} onSave={() => { void save(source); }} onRemove={() => { void remove(source); }} />
          </div>
        </li>;
      })}
    </ul>}
  </section>;
}

/** Keeps any failure inside this section: the journal and saved charts stay on screen. */
class LearningSourcesBoundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return <section className="kairos-learning-sources" aria-labelledby={TITLE_ID}>
      <h2 id={TITLE_ID}>Learning sources</h2>
      <p className="kairos-learning-sources__note">Learning sources can't be shown right now. Your journal and saved charts are not affected.</p>
    </section>;
  }
}

/** P23 "Learning sources" in the Library: each source's provenance, size and offline state, with Open PDF and Save for offline. */
export function LearningSources(props: LearningSourcesProps) {
  return <LearningSourcesBoundary><LearningSourcesList {...props} /></LearningSourcesBoundary>;
}
