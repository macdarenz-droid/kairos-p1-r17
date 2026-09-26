import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { lessonCatalogLinks, readLessonCatalog } from '../src/application/learn/lessons';
import { parseLessonCatalog } from '../src/domain/learn/lessons';
import { LessonStepBlocks } from '../src/features/learn/LessonBlocks';

afterEach(cleanup);

const fixture = { version: 1, lessons: [{
  id: 'replay-fixture', revision: 1, title: 'Replay fixture', summary: 'A sentence.', level: 1, minutes: 2,
  steps: [
    { id: 'one', title: 'One', blocks: [{ kind: 'text', text: 'Some words.' }, { kind: 'try', text: 'Replay a past market.', tool: 'replay' }] },
    { id: 'two', title: 'Two', blocks: [{ kind: 'text', text: 'More.' }] },
  ],
}] };

describe('P27.6 lessons lead to Replay', () => {
  it('opens Replay from a try block', () => {
    const catalog = parseLessonCatalog(fixture, lessonCatalogLinks());
    expect(catalog.problems).toEqual([]);
    render(<MemoryRouter><LessonStepBlocks step={catalog.lessons[0].steps[0]} answer={null} onAnswer={() => {}} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: 'Open Replay' }).getAttribute('href')).toBe('/practice/replay');
  });

  it('ships at least one lesson that leads to Replay', () => {
    const { lessons } = readLessonCatalog();
    expect(lessons.some((lesson) => lesson.steps.some((step) => step.blocks.some((block) => block.kind === 'try' && block.tool === 'replay')))).toBe(true);
  });
});
