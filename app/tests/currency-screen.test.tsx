import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { moreNavigation } from '../src/app/navigation';
import { appRoutes } from '../src/app/routes';
import { loadHomeCurrency } from '../src/application/currency/homeCurrency';
import { findGlossaryEntry, readGlossary } from '../src/application/learn/glossary';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { exchangeRateId, type ExchangeRateRecord } from '../src/domain/calculations/currencyConversion';
import type { DecimalString } from '../src/domain/trades';
import { ThemeProvider } from '../src/design-system/themes';
import { CurrencyScreen } from '../src/features/currency/CurrencyScreen';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-currency-screen-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db); return db;
}

const now = () => '2026-09-20T12:00:00.000Z';
const savedAt = '2026-09-20T08:00:00.000Z';
const rate = (source: 'ecb' | 'typed', from: string, to: string, value: string, day: string, rateDay = day): ExchangeRateRecord =>
  ({ id: exchangeRateId(source, from, to, day), source, from, to, day, rateDay, rate: value as DecimalString, savedAt });
const renderScreen = (db: KairosDatabase) => render(<CurrencyScreen db={db} now={now} />);
const select = () => screen.findByRole('combobox', { name: 'Show my totals in' });
const JARGON = /\b(fills?|executions?|unexecuted|FX)\b|P&L/i;

describe('T-045f the Currency page', () => {
  it('shows the heading and the 31 choices, not chosen by default', async () => {
    renderScreen(await database());
    expect(screen.getByRole('heading', { level: 1, name: 'Your currency' })).toBeInTheDocument();
    const combobox = await select();
    expect(combobox).toHaveValue('');
    const options = within(combobox).getAllByRole('option');
    expect(options).toHaveLength(31);
    expect(options[0]).toHaveTextContent('Not chosen: keep each currency apart');
    expect(within(combobox).getByRole('option', { name: 'EUR · Euro' })).toBeInTheDocument();
    expect(combobox).toHaveAccessibleDescription('The 30 currencies the European Central Bank publishes a daily rate for.');
  });

  it('saves a home currency with a coin, and a fresh render shows it', async () => {
    const db = await database();
    renderScreen(db);
    fireEvent.change(await select(), { target: { value: 'EUR' } });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Count USDT as US dollars, 1 to 1' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save my currency' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Saved. Your totals are shown in EUR (Euro).');
    expect(await loadHomeCurrency(db)).toEqual({ currency: 'EUR', usdStablecoins: ['USDT'] });
    cleanup();
    renderScreen(db);
    await waitFor(async () => expect(await select()).toHaveValue('EUR'));
    expect(screen.getByRole('checkbox', { name: 'Count USDT as US dollars, 1 to 1' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Count USDC as US dollars, 1 to 1' })).not.toBeChecked();
  });

  it('saves "Not chosen" as no home currency', async () => {
    const db = await database();
    renderScreen(db);
    fireEvent.change(await select(), { target: { value: 'EUR' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save my currency' }));
    await screen.findByText('Saved. Your totals are shown in EUR (Euro).');
    fireEvent.change(await select(), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save my currency' }));
    expect(await screen.findByText('Saved. Your totals keep each currency apart.')).toHaveAttribute('role', 'status');
    expect(await loadHomeCurrency(db)).toBeNull();
  });

  it('says so when the save fails', async () => {
    const db = await database();
    vi.spyOn(db.metadata, 'put').mockRejectedValue(new Error('disk full'));
    renderScreen(db);
    fireEvent.change(await select(), { target: { value: 'GBP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save my currency' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Kairos could not save your currency. Nothing was changed.');
  });

  it('lists saved rates with where each came from', async () => {
    const db = await database();
    await db.exchangeRates.bulkPut([
      rate('ecb', 'EUR', 'USD', '1.146', '2026-09-18'),
      rate('ecb', 'EUR', 'USD', '1.146', '2026-09-19', '2026-09-18'),
      rate('typed', 'GBP', 'EUR', '1.17', '2026-09-18'),
    ]);
    renderScreen(db);
    await select();
    const region = screen.getByRole('region', { name: 'Your saved rates' });
    const items = within(region).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent("19 September 2026: 1 EUR = 1.146 USD, the European Central Bank's rate of 18 September 2026 (it sets none at weekends and on its holidays).");
    expect(items[1].textContent?.startsWith('18 September 2026: 1 EUR = 1.146 USD, from the European Central Bank.')).toBe(true);
    expect(items[2].textContent?.startsWith('18 September 2026: 1 GBP = 1.17 EUR, typed by you.')).toBe(true);
  });

  it('says when no rate is saved, and shows only the 20 newest', async () => {
    const empty = await database();
    renderScreen(empty);
    expect(await screen.findByText('No exchange rates saved yet.')).toBeInTheDocument();
    cleanup();
    const db = await database();
    await db.exchangeRates.bulkPut(Array.from({ length: 21 }, (_, index) => rate('typed', 'GBP', 'EUR', '1.17', `2026-08-${String(index + 1).padStart(2, '0')}`)));
    renderScreen(db);
    await select();
    const region = screen.getByRole('region', { name: 'Your saved rates' });
    expect(within(region).getAllByRole('listitem')).toHaveLength(20);
    expect(within(region).getByText('Showing your 20 newest rates of 21.')).toBeInTheDocument();
  });

  it('explains "Exchange rate" on a tap', async () => {
    renderScreen(await database());
    fireEvent.click(screen.getByRole('button', { name: 'What does "Exchange rate" mean?' }));
    const dialog = screen.getByRole('dialog', { name: 'Exchange rate' });
    await waitFor(() => expect(within(dialog).getByText(/each trade keeps the currency you recorded/)).toBeInTheDocument());
  });

  it('says so when it cannot load', async () => {
    const db = await database();
    vi.spyOn(db.metadata, 'get').mockRejectedValue(new Error('broken'));
    renderScreen(db);
    expect(await screen.findByText('Kairos could not load your currency. Your trades are not affected.')).toBeInTheDocument();
  });

  it('uses plain words outside the glossary dialog', async () => {
    const db = await database();
    await db.exchangeRates.put(rate('ecb', 'EUR', 'USD', '1.146', '2026-09-19', '2026-09-18'));
    const { container } = renderScreen(db);
    await select();
    expect(container.textContent).not.toMatch(JARGON);
  });
});

describe('T-045f the word and the route', () => {
  it('adds "Exchange rate" to the trading words', () => {
    expect(readGlossary().problems).toEqual([]);
    expect(findGlossaryEntry('exchange-rate')?.related.map(term => term.id)).toEqual(['result-after-fees']);
  });

  it('opens at /currency and sits right before Settings in More', async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/currency'] });
    render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Your currency' }, { timeout: 10_000 })).toBeInTheDocument();
    const labels = moreNavigation.map(item => item.label);
    expect(labels[labels.indexOf('Settings') - 1]).toBe('Currency');
  });
});
