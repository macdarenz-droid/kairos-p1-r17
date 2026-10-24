import { describe, expect, it } from 'vitest';
import { findGlossaryEntry, readGlossary } from '../src/application/learn/glossary';
import { parseGlossary } from '../src/domain/learn/glossary';

const linked = [
  'result-after-fees', 'result-before-fees', 'total-result-so-far', 'your-results-over-time', 'entries-and-exits', 'trade-estimated-from-time',
  'times-what-you-risked', 'fees', 'reward-to-risk', 'stop', 'target', 'position-size',
];

describe('P24.2 the shipped trading words', () => {
  it('breaks no glossary rule and is parsed once', () => {
    expect(readGlossary().problems).toEqual([]);
    expect(readGlossary()).toBe(readGlossary());
  });

  it('has every word the screens link to', () => {
    const ids = readGlossary().terms.map((term) => term.id);
    for (const id of linked) expect(ids).toContain(id);
  });

  it('finds one word with its related words in order', () => {
    const entry = findGlossaryEntry('stop');
    expect(entry?.term.id).toBe('stop');
    expect(entry?.related.map((term) => term.id)).toEqual(entry?.term.related);
    expect(Object.isFrozen(entry?.related)).toBe(true);
    expect(findGlossaryEntry('no-such-word')).toBeNull();
  });

  it('resolves related words from the glossary it is given', () => {
    const word = (id: string, related: string[]) => ({ id, plainWords: `Words ${id}`, tradingTerm: `Term ${id}`, alsoCalled: [], explanation: 'A sentence.', picture: null, related });
    const fixture = parseGlossary({ version: 1, terms: [word('one', ['two']), word('two', [])] });
    const entry = findGlossaryEntry('one', fixture);
    expect(entry?.related).toEqual([fixture.terms[1]]);
    expect(findGlossaryEntry('stop', fixture)).toBeNull();
  });
});
