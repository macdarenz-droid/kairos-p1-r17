import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findGlossaryEntry } from '../src/application/learn/glossary';
import { lessonCatalogLinks } from '../src/application/learn/lessons';
import type { LearnPictureSpec } from '../src/domain/learn/learnPicture';
import { parseLessonCatalog, type LessonStep } from '../src/domain/learn/lessons';
import { describeLearnPicture } from '../src/features/learn/LearnPicture';
import { LessonStepBlocks } from '../src/features/learn/LessonBlocks';

afterEach(cleanup);

/** A real parsed step holding these blocks. */
function stepOf(blocks: unknown[]): LessonStep {
  const catalog = parseLessonCatalog({ version: 1, lessons: [{
    id: 'fixture', revision: 1, title: 'Fixture', summary: 'A sentence.', level: 1, minutes: 2,
    steps: [{ id: 'one', title: 'One', blocks }, { id: 'two', title: 'Two', blocks: [{ kind: 'text', text: 'More.' }] }],
  }] }, lessonCatalogLinks());
  expect(catalog.problems).toEqual([]);
  return catalog.lessons[0].steps[0];
}
function Harness({ step, onAnswer }: { readonly step: LessonStep; readonly onAnswer?: (choice: number) => void }) {
  const [answer, setAnswer] = useState<number | null>(null);
  return <LessonStepBlocks step={step} answer={answer} onAnswer={(choice) => { onAnswer?.(choice); setAnswer(choice); }} />;
}
const show = (step: LessonStep, onAnswer?: (choice: number) => void) => render(<MemoryRouter><Harness step={step} onAnswer={onAnswer} /></MemoryRouter>);
const example = (stopPrice: string) => ({ kind: 'size-example', accountSize: '1000', riskPercent: '1', entryPrice: '100', stopPrice });
const check = {
  kind: 'check', question: 'You buy at 100. Where does your stop go?',
  choices: [{ text: 'Below 100', right: true }, { text: 'Above 100', right: false }], explanation: 'On a buy you lose when the price falls.',
};

describe('P25.3 LessonStepBlocks', () => {
  it('shows text, pictures and captions', () => {
    const spec: LearnPictureSpec = { kind: 'risk-box', side: 'long', target: false, highlight: 'stop' };
    const candle: LearnPictureSpec = { kind: 'candle', direction: 'up' };
    const { container } = show(stepOf([
      { kind: 'text', text: 'A stop keeps a bad trade small.' },
      { kind: 'picture', picture: spec, caption: 'Your entry and your stop.' },
      { kind: 'picture', picture: candle, caption: null },
    ]));
    expect(screen.getByText('A stop keeps a bad trade small.')).toBeTruthy();
    expect(screen.getByRole('img', { name: describeLearnPicture(spec) })).toBeTruthy();
    expect(screen.getByText('Your entry and your stop.')).toBeTruthy();
    expect(screen.getByRole('img', { name: describeLearnPicture(candle) })).toBeTruthy();
    expect(container.querySelectorAll('figcaption')).toHaveLength(1);
  });

  it('explains each word in place', async () => {
    show(stepOf([{ kind: 'words', termIds: ['stop', 'long'] }]));
    expect(screen.getByText('Words to know:')).toBeTruthy();
    const [stop, long] = ['stop', 'long'].map((id) => findGlossaryEntry(id)!.term.plainWords);
    expect(screen.getByRole('button', { name: `What does "${long}" mean?` })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: `What does "${stop}" mean?` }));
    const dialog = screen.getByRole('dialog', { name: stop });
    await waitFor(() => expect(within(dialog).getByText(/Traders call it:/)).toBeTruthy());
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('draws the size example from the size owner', () => {
    const { container } = show(stepOf([example('95')]));
    expect(screen.getByRole('img', { name: 'If the price reaches the stop at 95, you lose 10.' })).toBeTruthy();
    expect(container.querySelector('figcaption')!.textContent).toBe('With 1000 in your account, willing to lose 1%, entry 100 and stop 95: buy up to 2, and lose 10 at the stop, before fees.');
    cleanup();
    const second = show(stepOf([example('105')]));
    expect(second.container.querySelector('figcaption')!.textContent).toContain('sell up to 2');
    cleanup();
    const byHand: LessonStep = { id: 'hand', title: 'By hand', blocks: [{ kind: 'size-example', accountSize: '1000', riskPercent: '1', entryPrice: '100', stopPrice: '100' }] };
    show(byHand);
    expect(screen.getByText("This example can't be shown right now.")).toBeTruthy();
  });

  it('answers a wrong choice with the right one, once', () => {
    const onAnswer = vi.fn();
    show(stepOf([check]), onAnswer);
    const group = screen.getByRole('group', { name: check.question });
    expect(within(group).getAllByRole('button')).toHaveLength(2);
    const feedback = group.querySelector('.kairos-lesson-check__feedback')!;
    expect(feedback.textContent).toBe('');
    fireEvent.click(within(group).getByRole('button', { name: 'Above 100' }));
    expect(onAnswer).toHaveBeenCalledWith(1);
    expect(feedback.textContent).toBe(`Not quite. The right answer is "Below 100". ${check.explanation}`);
    const chosen = within(group).getByRole('button', { name: /Above 100/ });
    expect(chosen.getAttribute('aria-pressed')).toBe('true');
    expect(chosen.textContent).toContain('Your answer');
    expect(within(group).getByRole('button', { name: /Below 100/ }).textContent).toContain('Right answer');
    fireEvent.click(within(group).getByRole('button', { name: /Below 100/ }));
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(feedback.textContent).toContain('Not quite.');
  });

  it('answers the right choice', () => {
    show(stepOf([check]));
    fireEvent.click(screen.getByRole('button', { name: 'Below 100' }));
    expect(screen.getByRole('group', { name: check.question }).querySelector('.kairos-lesson-check__feedback')!.textContent).toBe(`Right. ${check.explanation}`);
  });

  it('links "Try it" to a page from the closed list', () => {
    show(stepOf([{ kind: 'try', text: 'Work out a trade.', tool: 'calculators' }, { kind: 'try', text: 'Log a trade.', tool: 'journal' }]));
    expect(screen.getByText('Work out a trade.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Open the calculators' }).getAttribute('href')).toBe('/library/calculators');
    expect(screen.getByRole('link', { name: 'Open the Journal' }).getAttribute('href')).toBe('/journal');
  });
});
