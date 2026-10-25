import '@testing-library/jest-dom/vitest';
import { cleanup, waitFor, within } from '@testing-library/react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { projectVisualPnlPeriod, type VisualPnlPeriodChoice } from '../src/application/visual-pnl/resultsPeriod';
import { PeriodChooser } from '../src/features/results/PeriodChooser';

const TODAY = '2026-09-20';
function periodOf(choice: VisualPnlPeriodChoice) {
  const projected = projectVisualPnlPeriod(choice, TODAY);
  if (!projected.ok) throw new Error('fixture');
  return projected.period;
}
/** A change as a browser sends it (not wrapped in act): the value set through the element's own setter, then the event. */
function choose(select: HTMLSelectElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

afterEach(cleanup);

describe('the period list', () => {
  it('keeps "Custom" when it is chosen as a new period shows, before that render\'s effects ran', async () => {
    // Outside act, as in the app: React runs a render's effects a moment after it shows (CI's busy machine chose first).
    const acting = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const before = acting.IS_REACT_ACT_ENVIRONMENT;
    acting.IS_REACT_ACT_ENVIRONMENT = false;
    const host = document.body.appendChild(document.createElement('div'));
    const root = createRoot(host);
    try {
      root.render(<PeriodChooser period={periodOf({ kind: 'year', at: null })} todayKey={TODAY} onChoiceChange={() => {}} />);
      await waitFor(() => expect(within(host).getByRole('button', { name: 'Previous year' })).toBeInTheDocument());
      await new Promise(resolve => setTimeout(resolve, 0));
      // All time arrives from the results' read; the moment it shows (its arrows go), the trader picks "Custom".
      const picked = new Promise<void>(resolve => {
        const observer = new MutationObserver(() => {
          if (within(host).queryByRole('button', { name: 'Previous year' }) !== null) return;
          observer.disconnect();
          choose(within(host).getByRole('combobox', { name: 'Period' }) as HTMLSelectElement, 'custom');
          resolve();
        });
        observer.observe(host, { childList: true, subtree: true });
      });
      root.render(<PeriodChooser period={periodOf({ kind: 'all' })} todayKey={TODAY} onChoiceChange={() => {}} />);
      await picked;
      await waitFor(() => expect(within(host).getByLabelText('First day')).toBeInTheDocument());
      await new Promise(resolve => setTimeout(resolve, 20));
      expect(within(host).getByLabelText('First day')).toBeInTheDocument();
      expect((within(host).getByRole('combobox', { name: 'Period' }) as HTMLSelectElement).value).toBe('custom');
    } finally {
      root.unmount();
      host.remove();
      acting.IS_REACT_ACT_ENVIRONMENT = before;
    }
  });
});
