import { describe, expect, it, vi } from 'vitest';
import { lessonCoverPicture, parseLessonCatalog, type LessonCatalogLinks } from '../src/domain/learn/lessons';

const links: LessonCatalogLinks = { termIds: new Set(['stop', 'long']), sizeExampleWorks: () => true };
const textBlock = (value = 'Some words.') => ({ kind: 'text', text: value });
const step = (id: string, blocks: unknown[] = [textBlock()]) => ({ id, title: `Step ${id}`, blocks });
const lesson = (id: string, overrides: Record<string, unknown> = {}) => ({
  id, revision: 1, title: `Lesson ${id}`, summary: `About ${id}.`, level: 1, minutes: 3, steps: [step('one'), step('two')], ...overrides,
});
const catalog = (...lessons: unknown[]) => ({ version: 1, lessons });
const picture = { kind: 'risk-box', side: 'long', target: true, highlight: 'stop' };
const check = (overrides: Record<string, unknown> = {}) => ({
  kind: 'check', question: 'Where is the stop?', choices: [{ text: 'Below', right: true }, { text: 'Above', right: false }], explanation: 'For a buy it sits below.', ...overrides,
});
const example = (overrides: Record<string, unknown> = {}) => ({ kind: 'size-example', accountSize: '1000', riskPercent: '1', entryPrice: '100', stopPrice: '95', ...overrides });

describe('P25.1 parseLessonCatalog', () => {
  it('reads a lesson that uses all six kinds, trims text and freezes everything', () => {
    const result = parseLessonCatalog(catalog(lesson('stop-first', {
      steps: [
        step('see', [textBlock('  Hello.  '), { kind: 'picture', picture, caption: null }, { kind: 'words', termIds: ['stop', 'long'] }]),
        step('try', [example(), check(), { kind: 'try', text: 'Open the calculators.', tool: 'calculators' }]),
      ],
    })), links);
    expect(result.problems).toEqual([]);
    const [parsed] = result.lessons;
    const [first, second] = parsed.steps;
    expect(first.blocks[0]).toEqual({ kind: 'text', text: 'Hello.' });
    expect(first.blocks[1]).toEqual({ kind: 'picture', picture, caption: null });
    const checkBlock = second.blocks[1];
    if (checkBlock.kind !== 'check') throw new Error('kind');
    const wordsBlock = first.blocks[2];
    if (wordsBlock.kind !== 'words') throw new Error('kind');
    const pictureBlock = first.blocks[1];
    if (pictureBlock.kind !== 'picture') throw new Error('kind');
    for (const frozen of [result, result.lessons, result.problems, parsed, parsed.steps, first, first.blocks, ...first.blocks, ...second.blocks, checkBlock.choices, checkBlock.choices[0], wordsBlock.termIds, pictureBlock.picture]) {
      expect(Object.isFrozen(frozen)).toBe(true);
    }
  });

  it('gives no lessons and one problem for a catalog-level fault', () => {
    const cases: [unknown, unknown][] = [
      [null, { index: null, id: null, field: null, reason: 'catalog-missing' }],
      [[], { index: null, id: null, field: null, reason: 'catalog-missing' }],
      [{ version: 2, lessons: [] }, { index: null, id: null, field: 'version', reason: 'unsupported-version' }],
      [{ version: 1 }, { index: null, id: null, field: 'lessons', reason: 'catalog-missing' }],
      [{ version: 1, lessons: [], extra: 1 }, { index: null, id: null, field: 'extra', reason: 'unknown-field' }],
    ];
    for (const [value, problem] of cases) expect(parseLessonCatalog(value, links)).toEqual({ lessons: [], problems: [problem] });
  });

  it('skips only the refused lesson and names the exact problem', () => {
    const cases: [Record<string, unknown>, string | null, string, string][] = [
      [lesson('bad', { html: '<b>' }), 'bad', 'html', 'unknown-field'],
      [lesson('Bad Id'), 'Bad Id', 'id', 'invalid-field'],
      [lesson('bad', { revision: 0 }), 'bad', 'revision', 'invalid-field'],
      [lesson('bad', { revision: 1.5 }), 'bad', 'revision', 'invalid-field'],
      [lesson('bad', { title: '  ' }), 'bad', 'title', 'invalid-field'],
      [lesson('bad', { title: 'x'.repeat(61) }), 'bad', 'title', 'invalid-field'],
      [lesson('bad', { summary: 'Two\nlines.' }), 'bad', 'summary', 'invalid-field'],
      [lesson('bad', { level: 4 }), 'bad', 'level', 'invalid-field'],
      [lesson('bad', { minutes: 0 }), 'bad', 'minutes', 'invalid-field'],
      [lesson('bad', { minutes: 21 }), 'bad', 'minutes', 'invalid-field'],
      [lesson('bad', { steps: [step('one')] }), 'bad', 'steps', 'invalid-field'],
      [lesson('bad', { steps: Array.from({ length: 13 }, (_, i) => step(`s${i}`)) }), 'bad', 'steps', 'invalid-field'],
      [lesson('first', { title: 'Another title' }), 'first', 'id', 'duplicate-id'],
      [lesson('bad', { title: 'LESSON FIRST' }), 'bad', 'title', 'duplicate-title'],
    ];
    for (const [entry, id, field, reason] of cases) {
      const result = parseLessonCatalog(catalog(lesson('first'), entry), links);
      expect(result.problems).toEqual([{ index: 1, id, field, reason }]);
      expect(result.lessons.map((kept) => kept.id)).toEqual(['first']);
    }
  });

  it('names the second step that breaks a rule', () => {
    const cases: [unknown, string, string][] = [
      ['text', 'steps[1]', 'invalid-field'],
      [{ ...step('two'), note: 'x' }, 'steps[1].note', 'unknown-field'],
      [step('Bad Id'), 'steps[1].id', 'invalid-field'],
      [step('one'), 'steps[1].id', 'duplicate-id'],
      [{ ...step('two'), title: 'x'.repeat(41) }, 'steps[1].title', 'invalid-field'],
      [step('two', []), 'steps[1].blocks', 'invalid-field'],
      [step('two', Array.from({ length: 5 }, () => textBlock())), 'steps[1].blocks', 'invalid-field'],
      [step('two', [check(), check()]), 'steps[1].blocks', 'invalid-field'],
    ];
    for (const [second, field, reason] of cases) {
      expect(parseLessonCatalog(catalog(lesson('only', { steps: [step('one'), second] })), links).problems).toEqual([{ index: 0, id: 'only', field, reason }]);
    }
  });

  it('names the block field that breaks a rule', () => {
    const P = 'steps[0].blocks[0]';
    const throwing: LessonCatalogLinks = { termIds: links.termIds, sizeExampleWorks: () => { throw new Error('boom'); } };
    const cases: [unknown, string, string, LessonCatalogLinks?][] = [
      ['x', P, 'invalid-field'],
      [{ kind: 'html' }, `${P}.kind`, 'invalid-field'],
      [{ ...textBlock(), html: '<b>' }, `${P}.html`, 'unknown-field'],
      [textBlock('x'.repeat(201)), `${P}.text`, 'invalid-field'],
      [{ kind: 'picture', picture: { kind: 'svg' }, caption: null }, `${P}.picture`, 'invalid-field'],
      [{ kind: 'picture', picture, caption: '' }, `${P}.caption`, 'invalid-field'],
      [{ kind: 'picture', picture }, `${P}.caption`, 'invalid-field'],
      [{ kind: 'words', termIds: [] }, `${P}.termIds`, 'invalid-field'],
      [{ kind: 'words', termIds: ['a', 'b', 'c', 'd', 'e'] }, `${P}.termIds`, 'invalid-field'],
      [{ kind: 'words', termIds: ['stop', 'stop'] }, `${P}.termIds`, 'invalid-field'],
      [{ kind: 'words', termIds: ['Bad Id'] }, `${P}.termIds`, 'invalid-field'],
      [{ kind: 'words', termIds: ['no-such-word'] }, `${P}.termIds`, 'unknown-word'],
      [example({ accountSize: '1,000' }), `${P}.accountSize`, 'invalid-field'],
      [example({ stopPrice: '-5' }), `${P}.stopPrice`, 'invalid-field'],
      [example(), P, 'example-failed', { termIds: links.termIds, sizeExampleWorks: () => false }],
      [example(), P, 'example-failed', throwing],
      [check({ choices: [{ text: 'Below', right: true }] }), `${P}.choices`, 'invalid-field'],
      [check({ choices: ['a', 'b', 'c', 'd', 'e'].map((text, i) => ({ text, right: i === 0 })) }), `${P}.choices`, 'invalid-field'],
      [check({ choices: [{ text: 'Below', right: false }, { text: 'Above', right: false }] }), `${P}.choices`, 'invalid-field'],
      [check({ choices: [{ text: 'Below', right: true }, { text: 'Above', right: true }] }), `${P}.choices`, 'invalid-field'],
      [check({ choices: [{ text: 'Below', right: true }, { text: 'below', right: false }] }), `${P}.choices`, 'invalid-field'],
      [check({ choices: [{ text: 'Below', right: true, why: 'x' }, { text: 'Above', right: false }] }), `${P}.choices`, 'invalid-field'],
      [check({ question: '' }), `${P}.question`, 'invalid-field'],
      [(({ explanation: _drop, ...rest }) => rest)(check()), `${P}.explanation`, 'invalid-field'],
      [{ kind: 'try', text: 'Go.', tool: 'browser' }, `${P}.tool`, 'invalid-field'],
      [{ kind: 'try', text: 'Go.', tool: 'journal', href: 'https://x' }, `${P}.href`, 'unknown-field'],
    ];
    for (const [block, field, reason, withLinks] of cases) {
      const result = parseLessonCatalog(catalog(lesson('only', { steps: [step('one', [block]), step('two')] })), withLinks ?? links);
      expect(result.problems).toEqual([{ index: 0, id: 'only', field, reason }]);
      expect(result.lessons).toEqual([]);
    }
  });

  it('asks the size-example check with the four numbers of the block', () => {
    const sizeExampleWorks = vi.fn(() => true);
    parseLessonCatalog(catalog(lesson('only', { steps: [step('one', [example({ stopPrice: '97.5' })]), step('two')] })), { termIds: links.termIds, sizeExampleWorks });
    expect(sizeExampleWorks).toHaveBeenCalledWith(expect.objectContaining({ accountSize: '1000', riskPercent: '1', entryPrice: '100', stopPrice: '97.5' }));
  });
});

describe('P25.1 lessonCoverPicture', () => {
  it('finds the first picture in step order, or none', () => {
    const later = { kind: 'candle', direction: 'up' };
    const { lessons } = parseLessonCatalog(catalog(
      lesson('with', { steps: [step('one'), step('two', [textBlock(), { kind: 'picture', picture: later, caption: 'A candle.' }, { kind: 'picture', picture, caption: null }])] }),
      lesson('without'),
    ), links);
    expect(lessonCoverPicture(lessons[0])).toEqual(later);
    expect(lessonCoverPicture(lessons[1])).toBeNull();
  });
});
