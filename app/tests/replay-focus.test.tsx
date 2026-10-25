import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { ReplayScreen } from '../src/features/practice/ReplayScreen';
import { fakeReplayMarket } from './fixtures/replayCandles';

const names: string[] = [];
async function database(): Promise<KairosDatabase> { const name = `kairos-replay-focus-${crypto.randomUUID()}`; names.push(name); const db = createKairosDatabase(name); await openKairosDatabase(db); return db; }
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

const NOW = Date.parse('2024-04-01T00:00:00.000Z');

// Records where focus is at the first page change that puts the watched content on screen.
function focusWhenShown(isShown: () => Element | null) {
  const seen: { element: Element | null; focused: Element | null } = { element: null, focused: null };
  const observer = new MutationObserver(() => {
    if (seen.element) return;
    const element = isShown();
    if (element) { seen.element = element; seen.focused = document.activeElement; }
  });
  observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  return { seen, stop: () => observer.disconnect() };
}

async function startReplay(market: string) {
  const fake = fakeReplayMarket({ nowMs: NOW });
  render(<MemoryRouter><ReplayScreen db={await database()} market={fake.market} playStepMs={25} /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText(/^Market/), { target: { value: market } });
  fireEvent.change(screen.getByLabelText(/^Start from/), { target: { value: '2024-03-01T12:00' } });
}

describe('T-038h Replay moves focus in the same update as the new content', () => {
  it('a failed load: the Market field has focus as soon as the error shows', async () => {
    await startReplay('AAPL');
    const watch = focusWhenShown(() => screen.queryByText("Kairos can't find this market on Binance. Check the spelling, for example BTCUSDT."));
    fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
    await waitFor(() => expect(watch.seen.element).not.toBeNull());
    watch.stop();
    expect(watch.seen.focused).toBe(screen.getByLabelText(/^Market/));
  });

  it('a good load: the replay heading has focus as soon as the replay shows', async () => {
    await startReplay('BTCUSDT');
    const watch = focusWhenShown(() => screen.queryByRole('heading', { name: 'BTCUSDT · 1 hour candles' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start replay' }));
    await waitFor(() => expect(watch.seen.element).not.toBeNull());
    watch.stop();
    expect(watch.seen.focused).toBe(watch.seen.element);
  });
});
