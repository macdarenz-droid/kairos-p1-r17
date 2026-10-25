/**
 * The only module that imports the glossary data. Screens that show one word on demand load this file with import(), so the Journal never carries the data.
 */

import glossaryJson from '../../content/learn/glossary.json';
import { parseGlossary, type Glossary, type GlossaryTerm } from '../../domain/learn/glossary';

let glossary: Glossary | null = null;

/** The shipped glossary, parsed once. */
export function readGlossary(): Glossary {
  glossary ??= parseGlossary(glossaryJson as unknown);
  return glossary;
}

export interface GlossaryEntry {
  readonly term: GlossaryTerm;
  readonly related: readonly GlossaryTerm[];
}

/** One word with its related words in the listed order; null for an unknown id. */
export function findGlossaryEntry(id: string, from: Glossary = readGlossary()): GlossaryEntry | null {
  const term = from.terms.find((item) => item.id === id);
  if (term === undefined) return null;
  const related = term.related.map((relatedId) => from.terms.find((item) => item.id === relatedId)).filter((item): item is GlossaryTerm => item !== undefined);
  return Object.freeze({ term, related: Object.freeze(related) });
}
