import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlossaryHint } from '../src/features/learn/GlossaryHint';

vi.mock('../src/application/learn/glossary', () => ({
  findGlossaryEntry: (id: string) => {
    if (id === 'broken-word') return { get term() { throw new Error('broken'); }, related: [] };
    return null;
  },
}));

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('P24.8 a hint that cannot explain', () => {
  for (const termId of ['missing-word', 'broken-word']) {
    it(`keeps the page when ${termId} cannot be shown`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<><p>Journal still here</p><GlossaryHint termId={termId} label="Some word" /></>);
      fireEvent.click(screen.getByRole('button', { name: 'What does "Some word" mean?' }));
      expect(await screen.findByText("This explanation can't be shown right now.")).toBeTruthy();
      expect(screen.getByText('Journal still here')).toBeTruthy();
    });
  }
});
