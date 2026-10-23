import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EcbReferenceRatesPort } from '../src/application/currency/ecbRates';
import { saveHomeCurrency } from '../src/application/currency/homeCurrency';
import { saveManualTrade, type SaveManualTradeInput } from '../src/application/trades';
import { writeVisualPnlTimeZonePreference, type VisualPnlPeriodChoice } from '../src/application/visual-pnl';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import type { DecimalString } from '../src/domain/trades';
import { ResultsDashboard } from '../src/features/results/ResultsDashboard';
import type { EcbReferenceRateRequest, EcbReferenceRatesResult } from '../src/services/exchange-rates/ecbReferenceRates';

const NOW = '2026-09-20T12:00:00.000Z';
const now = () => NOW;
const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });

function trade(symbol: string, currency: string, exit: string): SaveManualTradeInput {
  const openedAt = '2026-09-18T09:00:00.000Z', closedAt = '2026-09-18T10:00:00.000Z';
  return {
    symbol, marketType: 'stock', side: 'long', status: 'closed', openedAt, closedAt, grossPnlCurrency: currency,
    plan: { plannedEntryPrice: null, plannedStopPrice: null, plannedTargetPrice: null, plannedQuantity: null },
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: openedAt }, { type: 'exit', price: exit, quantity: '1', executedAt: closedAt }],
    fees: [],
  } as SaveManualTradeInput;
}
/** EUR home; a EUR trade and a trade in `other`, closed 18 September, with no rate saved for `other`. */
async function database(other = 'USD'): Promise<KairosDatabase> {
  const name = `kairos-results-rates-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  expect((await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'UTC', NOW)).ok).toBe(true);
  for (const input of [trade('SAP.DE', 'EUR', '110'), trade(other === 'USD' ? 'AAPL' : 'DANGCEM', other, '125')]) {
    const saved = await saveManualTrade(db, input);
    if (!saved.ok) throw new Error(`fixture: ${JSON.stringify(saved)}`);
  }
  expect((await saveHomeCurrency(db, { currency: 'EUR', usdStablecoins: [] }, { now })).ok).toBe(true);
  return db;
}
const USD_RATE: EcbReferenceRatesResult = { ok: true, rates: [{ currency: 'USD', day: '2026-09-18', rate: '1.25' as DecimalString }, { currency: 'USD', day: '2026-09-19', rate: '1.26' as DecimalString }] };
function port(...answers: (EcbReferenceRatesResult | Promise<EcbReferenceRatesResult>)[]) {
  const requests: EcbReferenceRateRequest[] = [];
  const signals: (AbortSignal | undefined)[] = [];
  const rates: EcbReferenceRatesPort = {
    acquireRates: async (request, options) => { requests.push(request); signals.push(options?.signal); return answers.length > 1 ? answers.shift()! : answers[0]!; },
  };
  return { rates, requests, signals };
}
function Host({ db, rates, revision = 0 }: { readonly db: KairosDatabase; readonly rates: EcbReferenceRatesPort | null; readonly revision?: number }) {
  const [choice, setChoice] = useState<VisualPnlPeriodChoice>({ kind: 'month', at: null });
  return <ResultsDashboard db={db} scope="real" now={now} choice={choice} onChoiceChange={setChoice} renderTradeLink={() => null} refreshRevision={revision} rates={rates} />;
}
const show = (db: KairosDatabase, rates: EcbReferenceRatesPort | null) => render(<MemoryRouter><Host db={db} rates={rates} /></MemoryRouter>);
const region = () => screen.findByRole('region', { name: 'Your results' });
const resultTile = (found: HTMLElement) => within(found).getByText('Result after fees').closest('.kairos-stat') as HTMLElement;

describe('T-051f missing bank rates are fetched on their own', () => {
  it('asks the bank once, shows the result in EUR, and never asks again for the same rate', async () => {
    const db = await database();
    const { rates, requests } = port(USD_RATE);
    const view = show(db, rates);
    const found = await region();
    expect(await within(found).findByText('Got 1 exchange rate from the European Central Bank.')).toBeInTheDocument();
    // 10 EUR, plus 25 USD at 1 EUR = 1.25 USD.
    await waitFor(() => expect(resultTile(found)).toHaveTextContent('+30 EUR'));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ currencies: ['USD'], toDay: '2026-09-20' });
    view.rerender(<MemoryRouter><Host db={db} rates={rates} revision={1} /></MemoryRouter>);
    await waitFor(() => expect(found).not.toHaveAttribute('aria-busy'));
    expect(requests).toHaveLength(1);
  });

  it('says when the bank has no rate for that day yet, and keeps the result not available', async () => {
    const db = await database();
    const { rates, requests } = port({ ok: true, rates: [] });
    show(db, rates);
    const found = await region();
    expect(await within(found).findByText(/^The European Central Bank has no rate for 18 September 2026 yet\./)).toBeInTheDocument();
    expect(within(resultTile(found)).getByText('Not available: 1 trade still needs an exchange rate to count in EUR.')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it('shows "Unavailable · Try again" when the bank cannot be reached, and a retry that saves puts focus on the note', async () => {
    const db = await database();
    const { rates, requests } = port({ ok: false, reason: 'transport-failed' }, USD_RATE);
    show(db, rates);
    const found = await region();
    const notice = await within(found).findByText('The missing exchange rates could not be fetched. Check your connection, then try again.', { exact: false });
    expect(notice.closest('.kairos-error-state')).toHaveTextContent('Unavailable');
    const retry = within(found).getByRole('button', { name: 'Try again' });
    retry.focus();
    fireEvent.click(retry);
    expect(await within(found).findByText('Got 1 exchange rate from the European Central Bank.')).toBeInTheDocument();
    expect(within(found).queryByText(/^Unavailable/)).toBeNull();
    await waitFor(() => expect(resultTile(found)).toHaveTextContent('+30 EUR'));
    expect(requests).toHaveLength(2);
    await waitFor(() => expect(within(found).getByRole('link', { name: 'See your rates' })).toHaveFocus());
  });

  it('keeps focus on the new "Try again" when the retry fails too', async () => {
    const db = await database();
    const { rates, requests } = port({ ok: false, reason: 'transport-failed' });
    show(db, rates);
    const found = await region();
    const retry = await within(found).findByRole('button', { name: 'Try again' });
    retry.focus();
    await act(async () => { fireEvent.click(retry); });
    await waitFor(() => expect(requests).toHaveLength(2));
    await waitFor(() => expect(within(found).getByRole('button', { name: 'Try again' })).toHaveFocus());
  });

  it('asks nothing offline, and asks once when the phone is back online', async () => {
    const db = await database();
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { rates, requests } = port(USD_RATE);
    show(db, rates);
    const found = await region();
    expect(await within(found).findByText('The missing exchange rates need a connection.', { exact: false })).toBeInTheDocument();
    expect(requests).toHaveLength(0);
    online.mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    expect(await within(found).findByText('Got 1 exchange rate from the European Central Bank.')).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });

  it('asks nothing for a rate the bank does not publish, and keeps the link to add it', async () => {
    const db = await database('NGN');
    const { rates, requests } = port(USD_RATE);
    show(db, rates);
    const found = await region();
    await waitFor(() => expect(found).toHaveAttribute('data-results-status', 'ready'));
    expect(within(found).getByRole('link', { name: 'Add the missing rates' })).toHaveAttribute('href', '/currency');
    await act(async () => { await Promise.resolve(); });
    expect(requests).toHaveLength(0);
  });

  it('asks nothing without a port', async () => {
    const db = await database();
    show(db, null);
    const found = await region();
    await waitFor(() => expect(found).toHaveAttribute('data-results-status', 'ready'));
    expect(within(found).queryByText(/Getting the missing exchange rates/)).toBeNull();
    expect(within(found).getByRole('link', { name: 'Add the missing rates' })).toHaveAttribute('href', '/currency');
    expect(within(resultTile(found)).getByText('Not available: 1 trade still needs an exchange rate to count in EUR.')).toBeInTheDocument();
  });

  it('stops the request when the screen closes', async () => {
    const db = await database();
    const { rates, signals } = port(new Promise<EcbReferenceRatesResult>(() => undefined));
    const view = show(db, rates);
    const found = await region();
    expect(await within(found).findByText('Getting the missing exchange rates…')).toBeInTheDocument();
    expect(signals[0]?.aborted).toBe(false);
    view.unmount();
    expect(signals[0]?.aborted).toBe(true);
  });
});
