import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, expect, it, vi } from 'vitest';
import type { LessonCatalog } from '../src/domain/learn/lessons';
import { LessonReaderScreen } from '../src/features/learn/LessonReaderScreen';

vi.mock('../src/application/learn/positionSizePlan', () => ({
  projectPositionSizePlan: () => { throw new Error('broken owner'); },
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps a broken block on its own step', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const catalog: LessonCatalog = { problems: [], lessons: [{
    id: 'broken', revision: 1, title: 'Broken lesson', summary: 'One.', level: 1, minutes: 2, steps: [
      { id: 'one', title: 'Step one', blocks: [{ kind: 'size-example', accountSize: '1000', riskPercent: '1', entryPrice: '100', stopPrice: '95' }] },
      { id: 'two', title: 'Step two', blocks: [{ kind: 'text', text: 'Step two words.' }] },
    ],
  }] };
  const router = createMemoryRouter([{ path: '/library/lessons/:lessonId', element: <LessonReaderScreen catalog={catalog} /> }], { initialEntries: ['/library/lessons/broken'] });
  render(<RouterProvider router={router} />);
  expect(screen.getByText("This part of the lesson can't be shown right now.")).toBeTruthy();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Next' })); });
  expect(screen.getByText('Step two words.')).toBeTruthy();
  expect(screen.queryByText("This part of the lesson can't be shown right now.")).toBeNull();
});
