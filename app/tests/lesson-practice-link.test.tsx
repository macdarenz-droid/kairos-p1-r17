import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { lessonCatalogLinks, readLessonCatalog } from '../src/application/learn/lessons';
import { parseLessonCatalog } from '../src/domain/learn/lessons';
import { LessonStepBlocks } from '../src/features/learn/LessonBlocks';

afterEach(cleanup);

const fixture = (tool: string) => ({ version: 1, lessons: [{
  id: 'practice-fixture', revision: 1, title: 'Practice fixture', summary: 'A sentence.', level: 1, minutes: 2,
  steps: [
    { id: 'one', title: 'One', blocks: [{ kind: 'text', text: 'Some words.' }, { kind: 'try', text: 'Save a practice trade.', tool }] },
    { id: 'two', title: 'Two', blocks: [{ kind: 'text', text: 'More.' }] },
  ],
}] });

describe('P26.5 lessons lead to Practice', () => {
  it('opens Practice from a try block', () => {
    const catalog = parseLessonCatalog(fixture('practice'), lessonCatalogLinks());
    expect(catalog.problems).toEqual([]);
    render(<MemoryRouter><LessonStepBlocks step={catalog.lessons[0].steps[0]} answer={null} onAnswer={() => {}} /></MemoryRouter>);
    expect(screen.getByText('Save a practice trade.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open Practice' }).getAttribute('href')).toBe('/practice');
  });

  it('still refuses a page outside the list', () => {
    const catalog = parseLessonCatalog(fixture('broker'), lessonCatalogLinks());
    expect(catalog.problems).toEqual([{ index: 0, id: 'practice-fixture', field: 'steps[0].blocks[1].tool', reason: 'invalid-field' }]);
    expect(catalog.lessons).toEqual([]);
  });

  it('ships at least one lesson that leads to Practice', () => {
    const { lessons } = readLessonCatalog();
    expect(lessons.some((lesson) => lesson.steps.some((step) => step.blocks.some((block) => block.kind === 'try' && block.tool === 'practice')))).toBe(true);
  });
});
