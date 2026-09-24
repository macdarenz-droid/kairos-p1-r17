import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { findGlossaryEntry } from '../src/application/learn/glossary';
import { projectTradePicture, type TradePictureInput } from '../src/application/trade-visualizer';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { parseDecimalString, type DecimalString, type TradeExecutionId, type TradeFeeId, type TradeFeeRecord, type TradeId, type TradePlanId, type TradeRecord } from '../src/domain/trades';
import { TradePictureCard } from '../src/features/journal/TradePictureCard';
import { TradePictureCandleLoaderContext, type TradePictureCandleLoader } from '../src/features/journal/tradePictureCandleQueue';

const names: string[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const name of names.splice(0)) await Dexie.delete(name); });

// The trade picture fixture from tests/trade-picture-card.test.tsx.
function dec(value: string): DecimalString { const parsed = parseDecimalString(value); if (!parsed.ok) throw new Error(value); return parsed.value; }
const tradeId = 'trade-1' as TradeId;
const opened = '2026-09-20T09:00:00.000Z', closed = '2026-09-20T12:00:00.000Z';
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: opened, closedAt: closed, createdAt: opened, updatedAt: closed };
const input: TradePictureInput = {
  trade,
  plans: [{ id: 'p1' as TradePlanId, tradeId, plannedEntryPrice: dec('100'), plannedStopPrice: dec('90'), plannedTargetPrice: dec('130'), plannedQuantity: dec('2'), createdAt: opened, updatedAt: opened }],
  executions: [
    { id: 'e1' as TradeExecutionId, tradeId, type: 'entry', price: dec('100'), quantity: dec('2'), executedAt: opened, createdAt: opened },
    { id: 'x1' as TradeExecutionId, tradeId, type: 'exit', price: dec('120'), quantity: dec('2'), executedAt: closed, createdAt: closed },
  ],
  fees: [{ id: 'f1' as TradeFeeId, tradeId, executionId: null, amount: dec('1'), currency: 'USDT', createdAt: closed } as TradeFeeRecord],
  candles: [
    { openTime: '2026-09-20T08:00:00.000Z', closeTime: '2026-09-20T09:59:59.999Z', open: dec('98'), high: dec('105'), low: dec('95'), close: dec('104') },
    { openTime: '2026-09-20T10:00:00.000Z', closeTime: '2026-09-20T13:59:59.999Z', open: dec('104'), high: dec('125'), low: dec('103'), close: dec('121') },
  ],
  now: '2026-09-24T12:00:00.000Z',
};
const PICTURE_HINTS = ['Result after fees', 'Planned reward', 'Actual result', 'Stop', 'Target', 'Size'];
const CARD_HINTS = ['Entries and exits', 'Fees', 'Result before fees', 'Result after fees'];
const hintName = (label: string) => `What does "${label}" mean?`;

describe('P24.8 "What does this mean?" on the trade picture', () => {
  it('puts a "?" next to each explained word, outside the image', () => {
    render(<MemoryRouter><TradePictureCard model={projectTradePicture(input)} /></MemoryRouter>);
    const image = screen.getByRole('img');
    expect(image.getAttribute('aria-label')).toContain('BTCUSDT');
    for (const label of PICTURE_HINTS) {
      const button = screen.getByRole('button', { name: hintName(label) });
      expect(image.contains(button)).toBe(false);
    }
    cleanup();
    render(<MemoryRouter><TradePictureCard model={projectTradePicture(input)} compact /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: /What does/ })).toBeNull();
  });

  it('explains every word it offers and gives focus back', async () => {
    render(<MemoryRouter><TradePictureCard model={projectTradePicture(input)} /></MemoryRouter>);
    for (const label of PICTURE_HINTS) {
      const button = screen.getByRole('button', { name: hintName(label) });
      button.focus();
      fireEvent.click(button);
      const dialog = screen.getByRole('dialog', { name: label });
      await waitFor(() => expect(within(dialog).getByText(/Traders call it:/)).toBeInTheDocument());
      expect(within(dialog).queryByText("This explanation can't be shown right now.")).toBeNull();
      fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.activeElement).toBe(button);
    }
  });
});

async function journalWithClosedTrade() {
  const name = `kairos-glossary-hint-${crypto.randomUUID()}`; names.push(name);
  const db: KairosDatabase = createKairosDatabase(name); await openKairosDatabase(db);
  const at = '2026-09-20T09:00:00.000Z', end = '2026-09-20T10:00:00.000Z';
  const saved = await saveManualTrade(db, {
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', openedAt: at, closedAt: end, grossPnlCurrency: 'USDT',
    plan: { plannedEntryPrice: '60000', plannedStopPrice: '59000', plannedTargetPrice: '62000', plannedQuantity: '0.1' },
    executions: [{ type: 'entry', price: '60000', quantity: '0.1', executedAt: at }, { type: 'exit', price: '61500', quantity: '0.1', executedAt: end }],
  });
  if (!saved.ok) throw new Error('fixture');
  const offline: TradePictureCandleLoader = async () => null;
  render(<TradePictureCandleLoaderContext.Provider value={offline}><MemoryRouter><JournalRoute db={db} /></MemoryRouter></TradePictureCandleLoaderContext.Provider>);
  return screen.findByRole('button', { name: 'Open the BTCUSDT trade picture' });
}

describe('P24.8 "What does this mean?" on the trade card', () => {
  it('explains the card words in place and links to all trading words', async () => {
    await journalWithClosedTrade();
    for (const label of CARD_HINTS) expect(screen.getByRole('button', { name: hintName(label) })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: hintName('Result after fees') }));
    const dialog = screen.getByRole('dialog', { name: 'Result after fees' });
    const entry = findGlossaryEntry('result-after-fees')!;
    await waitFor(() => expect(within(dialog).getByText(entry.term.explanation)).toBeInTheDocument());
    expect(within(dialog).getByRole('link', { name: 'See all trading words' }).getAttribute('href')).toBe('/library/words?term=result-after-fees');
  });

  it('closes only the explanation when it was opened over the trade picture', async () => {
    const open = await journalWithClosedTrade();
    fireEvent.click(open);
    const trade = screen.getByRole('dialog', { name: 'BTCUSDT trade' });
    fireEvent.click(within(trade).getByRole('button', { name: hintName('Stop') }));
    expect(screen.getAllByRole('dialog')).toHaveLength(2);
    const hint = screen.getByRole('dialog', { name: 'Stop' });
    await waitFor(() => expect(within(hint).getByText(/Traders call it:/)).toBeInTheDocument());
    await act(async () => { fireEvent.keyDown(hint, { key: 'Escape' }); });
    expect(screen.queryByRole('dialog', { name: 'Stop' })).toBeNull();
    expect(screen.getByRole('dialog', { name: 'BTCUSDT trade' })).toBeInTheDocument();
  });
});
