import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { findGlossaryEntry, readGlossary } from '../../application/learn/glossary';
import { searchGlossary, type Glossary } from '../../domain/learn/glossary';
import { Field } from '../../design-system/primitives';
import { GlossaryTermCard } from './GlossaryTermCard';
import './learn.css';

function countText(count: number, query: string): string {
  if (query === '') return count === 1 ? '1 word' : `${count} words`;
  if (count === 0) return `No words match "${query}". Try fewer letters.`;
  return count === 1 ? `1 word matches "${query}"` : `${count} words match "${query}"`;
}

/** Trading words: every word A–Z with its picture, searched as you type; `?term=<id>` opens on one word. */
export function GlossaryScreen({ glossary }: { readonly glossary?: Glossary } = {}) {
  const [data] = useState(() => glossary ?? readGlossary());
  const [query, setQuery] = useState('');
  const [params] = useSearchParams();
  const selectedId = params.get('term');
  // A new word from a link clears the search, so a word the search hid still shows and takes focus.
  const [seenId, setSeenId] = useState(selectedId);
  if (seenId !== selectedId) {
    setSeenId(selectedId);
    setQuery('');
  }
  const q = query.trim();
  const found = searchGlossary(data.terms, query);
  const missing = selectedId !== null && !data.terms.some((term) => term.id === selectedId);

  return (
    <section className="kairos-route kairos-learn" aria-labelledby="kairos-glossary-title">
      <Link className="kairos-learn__back" to="/library">Back to the Library</Link>
      <h1 id="kairos-glossary-title">Trading words</h1>
      <p>Kairos shows plain words on screen. Here is what each one means, and what traders usually call it.</p>
      <Field label="Find a word" id="kairos-glossary-search">
        {(control) => <input {...control} type="search" autoComplete="off" value={query} onChange={(event) => setQuery(event.target.value)} />}
      </Field>
      {data.problems.length > 0 ? <p>Some words could not be shown.</p> : null}
      {missing ? <p>That word is not in the list yet.</p> : null}
      {data.terms.length === 0 ? <p>No words in this version yet.</p> : (
        <>
          <p className="kairos-learn__count" aria-live="polite">{countText(found.length, q)}</p>
          <ul className="kairos-glossary__list">
            {found.map((term) => (
              <li key={term.id}>
                <GlossaryTermCard term={term} related={findGlossaryEntry(term.id, data)?.related ?? []} heading="h2" selected={term.id === selectedId} />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
