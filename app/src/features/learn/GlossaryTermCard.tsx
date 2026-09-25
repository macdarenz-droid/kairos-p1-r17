import { useEffect, useId, useRef, type ReactNode } from 'react';
import { Link, useInRouterContext } from 'react-router';
import type { GlossaryTerm } from '../../domain/learn/glossary';
import { LearnPicture } from './LearnPicture';
import './learn.css';

/** The one place that builds a link to a trading word. */
export function glossaryWordHref(id: string): string {
  return `/library/words?term=${encodeURIComponent(id)}`;
}

/** SPA navigation in the app; a normal link outside a router. */
export function GlossaryWordLink({ termId, children }: { readonly termId: string; readonly children: ReactNode }) {
  const inRouter = useInRouterContext();
  const href = glossaryWordHref(termId);
  return inRouter ? <Link to={href}>{children}</Link> : <a href={href}>{children}</a>;
}

/** One trading word: its plain words, what traders call it, one sentence, a picture and related words. */
export function GlossaryTermCard({ term, related, heading, selected = false, focus = false }: {
  readonly term: GlossaryTerm;
  readonly related: readonly GlossaryTerm[];
  readonly heading: 'h2' | 'h3' | null;
  readonly selected?: boolean;
  /** Only this turning true moves focus to the card; `selected` alone never does. */
  readonly focus?: boolean;
}) {
  const headingId = useId();
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focus) ref.current?.focus();
  }, [focus]);
  const Heading = heading;
  return (
    <article
      ref={ref}
      className="kairos-glossary-term"
      data-term-id={term.id}
      data-selected={selected ? 'true' : undefined}
      tabIndex={selected ? -1 : undefined}
      aria-labelledby={heading ? headingId : undefined}
    >
      {Heading ? <Heading id={headingId}>{term.plainWords}</Heading> : null}
      <p className="kairos-glossary-term__trading">Traders call it: <strong>{term.tradingTerm}</strong></p>
      <p>{term.explanation}</p>
      {term.picture ? <LearnPicture spec={term.picture} /> : null}
      {term.alsoCalled.length > 0 ? <p className="kairos-glossary-term__also">Also called: {term.alsoCalled.join(' · ')}</p> : null}
      {related.length > 0 ? (
        <p className="kairos-glossary-term__related">
          Related words:{' '}
          {related.map((item, index) => (
            <span key={item.id}>
              {index > 0 ? ' · ' : null}
              <GlossaryWordLink termId={item.id}>{item.plainWords}</GlossaryWordLink>
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
}
