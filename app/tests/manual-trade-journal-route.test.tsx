import 'fake-indexeddb/auto';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { createKairosDatabase, type KairosDatabase } from '../src/data/database';

let db: KairosDatabase | null = null;

async function createTestDatabase(): Promise<KairosDatabase> {
  const instance = createKairosDatabase(`kairos-p10-3-${crypto.randomUUID()}`);
  await instance.open();
  db = instance;
  return instance;
}

afterEach(async () => {
  if (!db) return;
  const active = db;
  db = null;
  active.close();
  await active.delete();
});

describe('P10.3 manual trade journal form', () => {
  it('does not preselect market, direction, or status', async () => {
    const instance = await createTestDatabase();
    render(<JournalRoute db={instance} />);

    expect(screen.getByLabelText(/Market/)).toHaveValue('');
    expect(screen.getByLabelText(/Direction/)).toHaveValue('');
    expect(screen.getByLabelText(/Status/)).toHaveValue('');
  });

  it('surfaces the first missing explicit selection instead of inventing one', async () => {
    const instance = await createTestDatabase();
    render(<JournalRoute db={instance} />);

    fireEvent.change(screen.getByLabelText(/Symbol/), { target: { value: 'BTCUSD' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a market.');
    expect(screen.getByLabelText(/Market/)).toHaveAttribute('aria-invalid', 'true');
  });

  it('shows timestamp fields only when the selected status requires them', async () => {
    const instance = await createTestDatabase();
    render(<JournalRoute db={instance} />);

    expect(screen.queryByLabelText(/Opened/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Closed/, { selector: 'input' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'open' } });
    expect(screen.getByLabelText(/Opened/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Closed/, { selector: 'input' })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'closed' } });
    expect(screen.getByLabelText(/Opened/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Closed/, { selector: 'input' })).toBeInTheDocument();
  });

  it('persists a valid draft trade through the existing P10.1 atomic save command and clears only after success', async () => {
    const instance = await createTestDatabase();
    render(<JournalRoute db={instance} />);

    fireEvent.change(screen.getByLabelText(/Symbol/), { target: { value: 'ethusd' } });
    fireEvent.change(screen.getByLabelText(/Market/), { target: { value: 'crypto' } });
    fireEvent.change(screen.getByLabelText(/Direction/), { target: { value: 'long' } });
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'draft' } });
    fireEvent.change(screen.getByLabelText('Planned entry'), { target: { value: '2500.50' } });
    fireEvent.change(screen.getByLabelText('Planned quantity'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));

    expect(await screen.findByRole('status')).toHaveTextContent('Trade saved to your journal.');
    await waitFor(async () => expect(await instance.trades.count()).toBe(1));
    expect(await instance.tradePlans.count()).toBe(1);
    expect(await instance.trades.toArray()).toEqual([
      expect.objectContaining({ symbol: 'ETHUSD', marketType: 'crypto', side: 'long', status: 'draft', source: 'manual' }),
    ]);
    expect(screen.getByLabelText(/Symbol/)).toHaveValue('');
  });

  it('keeps user-entered data when save validation fails', async () => {
    const instance = await createTestDatabase();
    render(<JournalRoute db={instance} />);

    fireEvent.change(screen.getByLabelText(/Symbol/), { target: { value: 'BTCUSD' } });
    fireEvent.change(screen.getByLabelText(/Market/), { target: { value: 'crypto' } });
    fireEvent.change(screen.getByLabelText(/Direction/), { target: { value: 'long' } });
    fireEvent.change(screen.getByLabelText(/Status/), { target: { value: 'open' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save trade' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Add the opened date and time');
    expect(screen.getByLabelText(/Symbol/)).toHaveValue('BTCUSD');
    expect(await instance.trades.count()).toBe(0);
  });
});
