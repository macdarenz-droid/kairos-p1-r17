import type { JournalHistoryScope } from '../../application/journal';
import type { KairosDatabase } from '../../data/database';
import { PageHeader } from '../../design-system/primitives';
import { PATTERNS_INTRO, PATTERNS_SHORT_INTRO, PatternsLink, PatternsPanel } from './PatternsPanel';

export interface PatternsScreenProps {
  readonly db: KairosDatabase;
  readonly scope: JournalHistoryScope;
  /** The current instant (UTC ISO); tests inject a fixed one. */
  readonly now?: () => string;
}

const TITLE = 'kairos-patterns-title';

/** The Patterns page: its header, the patterns panel, and the way back. */
export function PatternsScreen({ db, scope, now }: PatternsScreenProps) {
  const practice = scope === 'practice';
  return <section className="kairos-route kairos-patterns" aria-labelledby="kairos-patterns-title">
    <PageHeader tone="insight" eyebrow={practice ? 'Practice' : 'Your results'} title={practice ? 'Your practice patterns' : 'Your patterns'} titleId={TITLE}
      intro={practice ? PATTERNS_SHORT_INTRO.practice : PATTERNS_SHORT_INTRO.real} howItWorks={<p>{practice ? PATTERNS_INTRO.practice : PATTERNS_INTRO.real}</p>} />
    <PatternsPanel db={db} scope={scope} now={now} headingId={TITLE} />
    <p><PatternsLink to={practice ? '/practice' : '/journal'}>{practice ? 'Back to Practice' : 'Back to your Journal'}</PatternsLink></p>
  </section>;
}
