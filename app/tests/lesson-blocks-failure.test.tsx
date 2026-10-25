import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import type { LessonStep } from '../src/domain/learn/lessons';
import { LessonStepBlocks } from '../src/features/learn/LessonBlocks';

vi.mock('../src/application/learn/positionSizePlan', () => ({
  projectPositionSizePlan: () => { throw new Error('broken owner'); },
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it('keeps the rest of the step when one block breaks', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  const step: LessonStep = { id: 'one', title: 'One', blocks: [
    { kind: 'text', text: 'Still here.' },
    { kind: 'size-example', accountSize: '1000', riskPercent: '1', entryPrice: '100', stopPrice: '95' },
  ] };
  render(<MemoryRouter><LessonStepBlocks step={step} answer={null} onAnswer={() => {}} /></MemoryRouter>);
  expect(screen.getByText("This part of the lesson can't be shown right now.")).toBeTruthy();
  expect(screen.getByText('Still here.')).toBeTruthy();
});
