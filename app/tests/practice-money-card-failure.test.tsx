import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { loadPracticeMoney, savePracticeMoney } from '../src/application/practice/practiceMoney';
import { createKairosDatabase } from '../src/data/database';
import { PracticeMoneyCard } from '../src/features/practice/PracticeMoneyCard';

vi.mock('../src/application/practice/practiceMoney', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/application/practice/practiceMoney')>()),
  loadPracticeMoney: vi.fn(),
  savePracticeMoney: vi.fn(),
}));

afterEach(() => { cleanup(); vi.mocked(loadPracticeMoney).mockReset(); vi.mocked(savePracticeMoney).mockReset(); });
const db = createKairosDatabase(`kairos-practice-card-failure-${crypto.randomUUID()}`);
const card = () => screen.getByRole('region', { name: 'Your practice money' });

it('says when the money cannot be loaded', async () => {
  vi.mocked(loadPracticeMoney).mockRejectedValue(new Error('storage'));
  render(<PracticeMoneyCard db={db} refreshRevision={0} />);
  expect(await within(card()).findByText('Kairos could not load your practice money. Your stored trades were not changed.')).toBeTruthy();
});

it('says when the money cannot be saved and keeps what was typed', async () => {
  vi.mocked(loadPracticeMoney).mockResolvedValue({ kind: 'not-set' });
  vi.mocked(savePracticeMoney).mockResolvedValue({ ok: false, type: 'storage-error', reason: 'practice-money-save-failed' });
  render(<PracticeMoneyCard db={db} refreshRevision={0} />);
  const amount = await within(card()).findByLabelText(/^Starting amount/) as HTMLInputElement;
  fireEvent.change(amount, { target: { value: '10000' } });
  fireEvent.change(within(card()).getByLabelText(/^Money currency/), { target: { value: 'USDT' } });
  await act(async () => { fireEvent.click(within(card()).getByRole('button', { name: 'Start practising' })); });
  expect(within(card()).getByRole('alert').textContent).toBe('Kairos could not save your practice money. Nothing was changed.');
  expect(amount.value).toBe('10000');
});
