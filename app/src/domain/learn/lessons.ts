/**
 * P25 lessons: short, declarative lessons shipped as data. A lesson has a revision and ordered steps; a step has a title and one to four blocks: text, picture, words, size example, check or try.
 * Content is data, never code: no HTML, no links, no scripts. A lesson is not a learning source (P23) and cites none yet. Nothing about a reader's answers is stored (P47/P48).
 */

import { parseLearnPictureSpec, type LearnPictureSpec } from './learnPicture';

export type LessonId = string;
export type LessonLevel = 1 | 2 | 3;
export type LessonTool = 'calculators' | 'journal' | 'practice';
export interface LessonChoice { readonly text: string; readonly right: boolean }
export type LessonBlock =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'picture'; readonly picture: LearnPictureSpec; readonly caption: string | null }
  | { readonly kind: 'words'; readonly termIds: readonly string[] }
  | { readonly kind: 'size-example'; readonly accountSize: string; readonly riskPercent: string; readonly entryPrice: string; readonly stopPrice: string }
  | { readonly kind: 'check'; readonly question: string; readonly choices: readonly LessonChoice[]; readonly explanation: string }
  | { readonly kind: 'try'; readonly text: string; readonly tool: LessonTool };
export type LessonSizeExample = Extract<LessonBlock, { kind: 'size-example' }>;
export interface LessonStep { readonly id: string; readonly title: string; readonly blocks: readonly LessonBlock[] }
export interface Lesson {
  readonly id: LessonId;
  /** Starts at 1 and goes up whenever what the lesson teaches changes (a step, a check or its right answer); fixing a typo keeps it. */
  readonly revision: number;
  readonly title: string;
  /** One plain sentence. */
  readonly summary: string;
  readonly level: LessonLevel;
  /** About how long it takes, as the author judges it. */
  readonly minutes: number;
  readonly steps: readonly LessonStep[];
}
export type LessonCatalogProblemReason = 'catalog-missing' | 'unsupported-version' | 'unknown-field' | 'invalid-field' | 'duplicate-id' | 'duplicate-title' | 'unknown-word' | 'example-failed';
export interface LessonCatalogProblem { readonly index: number | null; readonly id: LessonId | null; readonly field: string | null; readonly reason: LessonCatalogProblemReason }
export interface LessonCatalog { readonly lessons: readonly Lesson[]; readonly problems: readonly LessonCatalogProblem[] }
export interface LessonCatalogLinks {
  /** Ids of the trading words a `words` block may name. */
  readonly termIds: ReadonlySet<string>;
  /** True when the size example's four numbers give an answer. The application passes the position-size owner. */
  readonly sizeExampleWorks: (example: LessonSizeExample) => boolean;
}

export const KAIROS_LESSON_CATALOG_VERSION = 1;
export const KAIROS_LESSON_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const KAIROS_LESSON_TEXT_LIMITS = Object.freeze({ title: 60, summary: 120, stepTitle: 40, text: 200, caption: 100, question: 120, choice: 60, explanation: 200, tryText: 140 });
export const KAIROS_LESSON_LIST_LIMITS = Object.freeze({ minSteps: 2, maxSteps: 12, maxBlocks: 4, maxWords: 4, minChoices: 2, maxChoices: 4 });
export const KAIROS_LESSON_MAX_MINUTES = 20;
export const KAIROS_LESSON_TOOLS: readonly LessonTool[] = Object.freeze(['calculators', 'journal', 'practice']);
/** A plain number like 1000 or 0.5: no sign, no commas, no spaces. */
export const KAIROS_LESSON_EXAMPLE_NUMBER_PATTERN = /^(0|[1-9]\d{0,11})(\.\d{1,8})?$/;

const LESSON_KEYS: readonly string[] = ['id', 'revision', 'title', 'summary', 'level', 'minutes', 'steps'];
const STEP_KEYS: readonly string[] = ['id', 'title', 'blocks'];
const BLOCK_KEYS: Readonly<Record<LessonBlock['kind'], readonly string[]>> = {
  text: ['kind', 'text'],
  picture: ['kind', 'picture', 'caption'],
  words: ['kind', 'termIds'],
  'size-example': ['kind', 'accountSize', 'riskPercent', 'entryPrice', 'stopPrice'],
  check: ['kind', 'question', 'choices', 'explanation'],
  try: ['kind', 'text', 'tool'],
};
const EXAMPLE_FIELDS = ['accountSize', 'riskPercent', 'entryPrice', 'stopPrice'] as const;
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/;

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isId = (value: unknown): value is string => typeof value === 'string' && KAIROS_LESSON_ID_PATTERN.test(value);
/** Text: no control characters, trimmed length 1 to the limit. Returns the trimmed value, or null when refused. */
function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string' || CONTROL_CHARACTERS.test(value)) return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= limit ? trimmed : null;
}
/** Array.from reads holes as undefined, so a sparse list is refused like one holding undefined. */
const items = (value: readonly unknown[]): unknown[] => Array.from(value);

type Fault = { readonly field: string | null; readonly reason: LessonCatalogProblemReason };
type Parsed<T> = { readonly ok: true; readonly value: T } | ({ readonly ok: false } & Fault);
const fail = <T>(field: string | null, reason: LessonCatalogProblemReason = 'invalid-field'): Parsed<T> => ({ ok: false, field, reason });
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });

function parseChoices(value: unknown): readonly LessonChoice[] | null {
  if (!Array.isArray(value)) return null;
  const list = items(value);
  if (list.length < KAIROS_LESSON_LIST_LIMITS.minChoices || list.length > KAIROS_LESSON_LIST_LIMITS.maxChoices) return null;
  const choices: LessonChoice[] = [];
  const seen = new Set<string>();
  for (const choice of list) {
    if (!isPlainObject(choice)) return null;
    const keys = Object.keys(choice);
    if (keys.length !== 2 || !keys.includes('text') || !keys.includes('right')) return null;
    const choiceText = text(choice.text, KAIROS_LESSON_TEXT_LIMITS.choice);
    if (choiceText === null || typeof choice.right !== 'boolean') return null;
    const key = choiceText.toLowerCase();
    if (seen.has(key)) return null;
    seen.add(key);
    choices.push(Object.freeze({ text: choiceText, right: choice.right }));
  }
  if (choices.filter((choice) => choice.right).length !== 1) return null;
  return Object.freeze(choices);
}

function parseBlock(block: unknown, path: string, links: LessonCatalogLinks): Parsed<LessonBlock> {
  if (!isPlainObject(block)) return fail(path);
  const kind = block.kind;
  if (typeof kind !== 'string' || !Object.hasOwn(BLOCK_KEYS, kind)) return fail(`${path}.kind`);
  const allowed = BLOCK_KEYS[kind as LessonBlock['kind']];
  const extra = Object.keys(block).find((key) => !allowed.includes(key));
  if (extra !== undefined) return fail(`${path}.${extra}`, 'unknown-field');
  const limits = KAIROS_LESSON_TEXT_LIMITS;
  switch (kind as LessonBlock['kind']) {
    case 'text': {
      const value = text(block.text, limits.text);
      return value === null ? fail(`${path}.text`) : ok(Object.freeze({ kind: 'text' as const, text: value }));
    }
    case 'picture': {
      const picture = parseLearnPictureSpec(block.picture);
      if (picture === null) return fail(`${path}.picture`);
      if (!Object.hasOwn(block, 'caption')) return fail(`${path}.caption`);
      const caption = block.caption === null ? null : text(block.caption, limits.caption);
      if (caption === null && block.caption !== null) return fail(`${path}.caption`);
      return ok(Object.freeze({ kind: 'picture' as const, picture, caption }));
    }
    case 'words': {
      if (!Array.isArray(block.termIds)) return fail(`${path}.termIds`);
      const termIds = items(block.termIds);
      if (termIds.length < 1 || termIds.length > KAIROS_LESSON_LIST_LIMITS.maxWords) return fail(`${path}.termIds`);
      if (!termIds.every(isId) || new Set(termIds).size !== termIds.length) return fail(`${path}.termIds`);
      if (!termIds.every((id) => links.termIds.has(id as string))) return fail(`${path}.termIds`, 'unknown-word');
      return ok(Object.freeze({ kind: 'words' as const, termIds: Object.freeze(termIds as string[]) }));
    }
    case 'size-example': {
      for (const field of EXAMPLE_FIELDS) {
        const value = block[field];
        if (typeof value !== 'string' || !KAIROS_LESSON_EXAMPLE_NUMBER_PATTERN.test(value)) return fail(`${path}.${field}`);
      }
      const example: LessonSizeExample = Object.freeze({
        kind: 'size-example' as const,
        accountSize: block.accountSize as string, riskPercent: block.riskPercent as string, entryPrice: block.entryPrice as string, stopPrice: block.stopPrice as string,
      });
      let works = false;
      try {
        works = links.sizeExampleWorks(example) === true;
      } catch {
        works = false;
      }
      return works ? ok(example) : fail(path, 'example-failed');
    }
    case 'check': {
      const question = text(block.question, limits.question);
      if (question === null) return fail(`${path}.question`);
      const choices = parseChoices(block.choices);
      if (choices === null) return fail(`${path}.choices`);
      const explanation = text(block.explanation, limits.explanation);
      if (explanation === null) return fail(`${path}.explanation`);
      return ok(Object.freeze({ kind: 'check' as const, question, choices, explanation }));
    }
    case 'try': {
      const value = text(block.text, limits.tryText);
      if (value === null) return fail(`${path}.text`);
      if (!KAIROS_LESSON_TOOLS.includes(block.tool as LessonTool)) return fail(`${path}.tool`);
      return ok(Object.freeze({ kind: 'try' as const, text: value, tool: block.tool as LessonTool }));
    }
  }
}

function parseStep(step: unknown, index: number, earlierIds: ReadonlySet<string>, links: LessonCatalogLinks): Parsed<LessonStep> {
  const path = `steps[${index}]`;
  if (!isPlainObject(step)) return fail(path);
  const extra = Object.keys(step).find((key) => !STEP_KEYS.includes(key));
  if (extra !== undefined) return fail(`${path}.${extra}`, 'unknown-field');
  if (!isId(step.id)) return fail(`${path}.id`);
  if (earlierIds.has(step.id)) return fail(`${path}.id`, 'duplicate-id');
  const title = text(step.title, KAIROS_LESSON_TEXT_LIMITS.stepTitle);
  if (title === null) return fail(`${path}.title`);
  if (!Array.isArray(step.blocks)) return fail(`${path}.blocks`);
  const rawBlocks = items(step.blocks);
  if (rawBlocks.length < 1 || rawBlocks.length > KAIROS_LESSON_LIST_LIMITS.maxBlocks) return fail(`${path}.blocks`);
  const blocks: LessonBlock[] = [];
  for (let j = 0; j < rawBlocks.length; j += 1) {
    const parsed = parseBlock(rawBlocks[j], `${path}.blocks[${j}]`, links);
    if (!parsed.ok) return parsed;
    blocks.push(parsed.value);
  }
  if (blocks.filter((block) => block.kind === 'check').length > 1) return fail(`${path}.blocks`);
  return ok(Object.freeze({ id: step.id, title, blocks: Object.freeze(blocks) }));
}

function parseLesson(entry: unknown, links: LessonCatalogLinks): Parsed<Lesson> {
  if (!isPlainObject(entry)) return fail(null);
  const extra = Object.keys(entry).find((key) => !LESSON_KEYS.includes(key));
  if (extra !== undefined) return fail(extra, 'unknown-field');
  if (!isId(entry.id)) return fail('id');
  if (typeof entry.revision !== 'number' || !Number.isInteger(entry.revision) || entry.revision < 1) return fail('revision');
  const title = text(entry.title, KAIROS_LESSON_TEXT_LIMITS.title);
  if (title === null) return fail('title');
  const summary = text(entry.summary, KAIROS_LESSON_TEXT_LIMITS.summary);
  if (summary === null) return fail('summary');
  if (entry.level !== 1 && entry.level !== 2 && entry.level !== 3) return fail('level');
  if (typeof entry.minutes !== 'number' || !Number.isInteger(entry.minutes) || entry.minutes < 1 || entry.minutes > KAIROS_LESSON_MAX_MINUTES) return fail('minutes');
  if (!Array.isArray(entry.steps)) return fail('steps');
  const rawSteps = items(entry.steps);
  if (rawSteps.length < KAIROS_LESSON_LIST_LIMITS.minSteps || rawSteps.length > KAIROS_LESSON_LIST_LIMITS.maxSteps) return fail('steps');
  const steps: LessonStep[] = [];
  const stepIds = new Set<string>();
  for (let i = 0; i < rawSteps.length; i += 1) {
    const parsed = parseStep(rawSteps[i], i, stepIds, links);
    if (!parsed.ok) return parsed;
    stepIds.add(parsed.value.id);
    steps.push(parsed.value);
  }
  return ok(Object.freeze({ id: entry.id, revision: entry.revision, title, summary, level: entry.level, minutes: entry.minutes, steps: Object.freeze(steps) }));
}

const catalogProblem = (field: string | null, reason: LessonCatalogProblemReason): LessonCatalog =>
  Object.freeze({ lessons: Object.freeze([]), problems: Object.freeze([Object.freeze({ index: null, id: null, field, reason })]) });

/**
 * Reads the lesson catalog. It never throws: a catalog-level fault gives no
 * lessons and that one problem; a lesson fault skips only that lesson and
 * records one problem with its index. Kept lessons stay in file order.
 */
export function parseLessonCatalog(value: unknown, links: LessonCatalogLinks): LessonCatalog {
  if (!isPlainObject(value)) return catalogProblem(null, 'catalog-missing');
  if (value.version !== KAIROS_LESSON_CATALOG_VERSION) return catalogProblem('version', 'unsupported-version');
  if (!Array.isArray(value.lessons)) return catalogProblem('lessons', 'catalog-missing');
  const extra = Object.keys(value).find((key) => key !== 'version' && key !== 'lessons');
  if (extra !== undefined) return catalogProblem(extra, 'unknown-field');

  const entries = items(value.lessons);
  const lessons: Lesson[] = [];
  const problems: LessonCatalogProblem[] = [];
  const ids = new Set<string>();
  const titles = new Set<string>();
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const id = isPlainObject(entry) && typeof entry.id === 'string' ? entry.id : null;
    let parsed = parseLesson(entry, links);
    if (parsed.ok && ids.has(parsed.value.id)) parsed = fail('id', 'duplicate-id');
    else if (parsed.ok && titles.has(parsed.value.title.toLowerCase())) parsed = fail('title', 'duplicate-title');
    if (!parsed.ok) {
      problems.push(Object.freeze({ index, id, field: parsed.field, reason: parsed.reason }));
      continue;
    }
    ids.add(parsed.value.id);
    titles.add(parsed.value.title.toLowerCase());
    lessons.push(parsed.value);
  }
  return Object.freeze({ lessons: Object.freeze(lessons), problems: Object.freeze(problems) });
}

/** The picture the lesson list shows: the first `picture` block in step and block order, or null. */
export function lessonCoverPicture(lesson: Lesson): LearnPictureSpec | null {
  for (const step of lesson.steps) {
    for (const block of step.blocks) {
      if (block.kind === 'picture') return block.picture;
    }
  }
  return null;
}
