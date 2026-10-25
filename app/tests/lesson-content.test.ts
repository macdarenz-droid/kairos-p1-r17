import { describe, expect, it } from 'vitest';
import { findLesson, findLessonAfter, lessonCatalogLinks, readLessonCatalog } from '../src/application/learn/lessons';
import { parseLessonCatalog } from '../src/domain/learn/lessons';

const textStep = (id: string) => ({ id, title: `Step ${id}`, blocks: [{ kind: 'text', text: 'Some words.' }] });
const lesson = (id: string, first: unknown[] = textStep('one').blocks) => ({
  id, revision: 1, title: `Lesson ${id}`, summary: 'A sentence.', level: 1, minutes: 2, steps: [{ id: 'one', title: 'One', blocks: first }, textStep('two')],
});
const example = (stopPrice: string) => ({ kind: 'size-example', accountSize: '1000', riskPercent: '1', entryPrice: '100', stopPrice });

describe('P25.2 the shipped lessons', () => {
  it('break no lesson rule and are parsed once', () => {
    expect(readLessonCatalog().problems).toEqual([]);
    expect(readLessonCatalog()).toBe(readLessonCatalog());
    expect(readLessonCatalog().lessons.length).toBeGreaterThan(0);
  });

  it('find each lesson and the one after it', () => {
    const { lessons } = readLessonCatalog();
    lessons.forEach((lesson, index) => {
      expect(findLesson(lesson.id)).toBe(lesson);
      expect(findLessonAfter(lesson.id)).toBe(lessons[index + 1] ?? null);
    });
    expect(findLesson('no-such-lesson')).toBeNull();
    expect(findLessonAfter('no-such-lesson')).toBeNull();
  });

  it('check words against the glossary and size examples against the size owner', () => {
    const links = lessonCatalogLinks();
    const parse = (blocks: unknown[]) => parseLessonCatalog({ version: 1, lessons: [lesson('only', blocks)] }, links).problems;
    expect(parse([{ kind: 'words', termIds: ['stop'] }])).toEqual([]);
    expect(parse([{ kind: 'words', termIds: ['no-such-word'] }])).toEqual([{ index: 0, id: 'only', field: 'steps[0].blocks[0].termIds', reason: 'unknown-word' }]);
    expect(parse([example('95')])).toEqual([]);
    expect(parse([example('100')])).toEqual([{ index: 0, id: 'only', field: 'steps[0].blocks[0]', reason: 'example-failed' }]);
  });

  it('reads from the catalog it is given', () => {
    const fixture = parseLessonCatalog({ version: 1, lessons: [lesson('first'), lesson('second')] }, lessonCatalogLinks());
    expect(findLesson('second', fixture)).toBe(fixture.lessons[1]);
    expect(findLessonAfter('first', fixture)).toBe(fixture.lessons[1]);
    expect(findLessonAfter('second', fixture)).toBeNull();
    expect(findLesson('set-your-stop-first', fixture)).toBeNull();
  });
});
