import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMemoryRouter, MemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { LibraryRoute } from '../src/app/LibraryRoute';
import { appRoutes } from '../src/app/routes';
import { createKairosDatabase, openKairosDatabase } from '../src/data/database';
import { ThemeProvider } from '../src/design-system/themes';
import { CalculatorsScreen } from '../src/features/learn/CalculatorsScreen';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
afterEach(async () => { cleanup(); for (const name of names.splice(0)) await Dexie.delete(name); });
beforeAll(async () => { await import('../src/features/learn/CalculatorsScreen'); }, 30_000);

const BOXES = ['Money in your account', "Most you're willing to lose (%)", 'Entry price', 'Stop price'];
const calculator = () => screen.getByRole('region', { name: 'How much can I buy?' });
const headline = () => calculator().querySelector('.kairos-calculator__headline')!;
const details = () => within(calculator()).queryAllByRole('listitem').map((item) => item.textContent);
function fill(...values: string[]) {
  render(<MemoryRouter><CalculatorsScreen /></MemoryRouter>);
  values.forEach((value, index) => fireEvent.change(within(calculator()).getByRole('textbox', { name: BOXES[index] }), { target: { value } }));
}
const ROUNDED = 'The size is rounded down to 8 decimal places, so the loss at your stop is never more than you chose. Your exchange may only allow bigger steps.';
const BORROWED = 'That is more than the money in your account, so you would need borrowed money (leverage) for it.';
const BUY = 'Your stop is below your entry, so this is a buy (long) trade.';

describe('P24.6 "How much can I buy?"', () => {
  it('asks for all four boxes when empty', () => {
    fill();
    expect(headline().textContent).toBe('Fill in all four boxes to see the answer.');
    expect(within(calculator()).queryByRole('img')).toBeNull();
    expect(calculator().querySelector('.kairos-form-field__error')).toBeNull();
  });

  it('shows the size, the picture and the numbers for a buy', () => {
    fill('1000', '1', '100', '95');
    expect(headline().textContent).toBe('You can buy up to 2');
    expect(within(calculator()).getByRole('img', { name: 'If the price reaches your stop at 95, you lose 10.' })).toBeTruthy();
    expect(details()).toEqual([
      'If the price reaches your stop, you lose 10.', 'The most you chose to lose: 10 (1% of 1000).', 'At your entry price this trade is worth 200.', BUY, 'Fees are not included.',
    ]);
  });

  it('shows a sell when the stop is above the entry', () => {
    fill('1000', '1', '100', '105');
    expect(headline().textContent).toBe('You can sell up to 2');
    expect(details()).toContain('Your stop is above your entry, so this is a sell (short) trade.');
  });

  it('says when the size was rounded down', () => {
    fill('100', '1', '100', '97');
    expect(headline().textContent).toBe('You can buy up to 0.33333333');
    expect(details()).toContain(ROUNDED);
    expect(details()).toContain('If the price reaches your stop, you lose 0.99999999.');
  });

  it('says when the trade needs borrowed money', () => {
    fill('1000', '1', '100', '99.9');
    expect(details()).toContain('At your entry price this trade is worth 10000.');
    expect(details()).toContain(BORROWED);
    expect(details()).not.toContain(ROUNDED);
  });

  it('marks the wrong boxes in plain words', () => {
    fill('abc');
    expect(within(calculator()).getByText('Use digits and a dot, like 1000.50.')).toBeTruthy();
    expect(headline().textContent).toBe('Check the boxes marked above.');
    cleanup();
    fill('1000', '0');
    expect(within(calculator()).getByText('Use a number above 0.')).toBeTruthy();
    cleanup();
    fill('', '150');
    expect(within(calculator()).getByText('Use 100 or less.')).toBeTruthy();
    expect(calculator().querySelectorAll('.kairos-form-field__error')).toHaveLength(1);
    cleanup();
    fill('1000', '1', '100', '100');
    expect(within(calculator()).getByText('The stop must be a different price from the entry.')).toBeTruthy();
    cleanup();
    fill('1', '0.0001', '100000', '1');
    expect(headline().textContent).toBe("The amount you're willing to lose is too small for this stop: you could buy or sell less than 0.00000001.");
  });

  it('opens at /library/calculators and is linked from the Library', async () => {
    const router = createMemoryRouter(appRoutes, { initialEntries: ['/library/calculators'] });
    render(<ThemeProvider><RouterProvider router={router} /></ThemeProvider>);
    expect(await screen.findByRole('heading', { level: 1, name: 'Calculators' })).toBeTruthy();
    cleanup();
    const name = `kairos-calculators-library-${crypto.randomUUID()}`; names.push(name);
    const db = createKairosDatabase(name); await openKairosDatabase(db);
    render(<MemoryRouter><LibraryRoute db={db} /></MemoryRouter>);
    expect(screen.getByRole('link', { name: /^Calculators/ }).getAttribute('href')).toBe('/library/calculators');
    await waitFor(() => expect(screen.getByRole('region', { name: 'Library' }).getAttribute('data-library-status')).toBe('ready'));
  });
});
