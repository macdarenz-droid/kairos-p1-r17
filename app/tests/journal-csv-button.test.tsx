import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JournalRoute } from '../src/app/JournalRoute';
import { NO_JOURNAL_FILTERS } from '../src/application/journal';
import { saveManualTrade } from '../src/application/trades';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { JournalCsvButton } from '../src/features/journal/JournalCsvButton';
import type { FileDeliveryPorts } from '../src/features/journal/fileDelivery';
import { axeViolations } from './fixtures/axe';

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-csv-button-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  expect((await saveManualTrade(db, {
    symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', grossPnlCurrency: 'USDT', openedAt: '2026-10-20T09:00:00.000Z', closedAt: '2026-10-20T10:00:00.000Z',
    executions: [{ type: 'entry', price: '100', quantity: '1', executedAt: '2026-10-20T09:00:00.000Z' }, { type: 'exit', price: '90', quantity: '1', executedAt: '2026-10-20T10:00:00.000Z' }],
  })).ok).toBe(true);
  return db;
}
const now = () => '2026-10-24T12:00:00.000Z';
function ports(overrides: Partial<FileDeliveryPorts> = {}) {
  return { canShare: vi.fn(() => false), share: vi.fn(async () => undefined), download: vi.fn<FileDeliveryPorts['download']>(), ...overrides } satisfies FileDeliveryPorts;
}
const button = () => screen.getByRole('button', { name: /spreadsheet/ });

describe('T-060f "Download as a spreadsheet"', () => {
  it('stays focused and busy while it builds, hands the file to the share sheet, then says it saved it', async () => {
    const db = await database();
    let finish: () => void = () => undefined;
    const share = vi.fn((_data: { files: File[]; title: string }) => new Promise<void>(resolve => { finish = resolve; }));
    const device = ports({ canShare: vi.fn(() => true), share });
    render(<JournalCsvButton db={db} scope="real" filters={NO_JOURNAL_FILTERS} timeZone="UTC" empty={false} filtered={false} ports={device} now={now} />);
    button().focus();
    fireEvent.click(button());
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    expect(button()).toHaveTextContent('Making the spreadsheet…');
    expect(button()).toHaveAttribute('aria-busy', 'true');
    expect(button()).toHaveFocus();
    // A second tap while it builds does nothing.
    fireEvent.click(button());
    const sent = share.mock.calls[0]![0];
    expect(sent.title).toBe('kairos-journal-2026-10-24.csv');
    expect(sent.files[0]!.type).toBe('text/csv');
    // UTF-8 with a byte-order mark for Excel (reading the file as text drops the mark, so its bytes are checked).
    expect([...new Uint8Array(await sent.files[0]!.arrayBuffer()).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    const text = await sent.files[0]!.text();
    expect(text.split('\r\n')[0]).toBe('Opened,Closed,Time zone,Symbol,Market,Direction,Status,Made by,Quantity,Average entry,Average exit,Price currency,Planned stop,Planned target,Result before fees,Fees,Fees currency,Result after fees,Result currency,× what you risked,Strategy,Mistakes,Tags,Where you traded,Leverage,Why I\'m taking it,Note');
    expect(text.split('\r\n')[1]).toMatch(/^2026-10-20 09:00,2026-10-20 10:00,UTC,BTCUSDT,Crypto,Long,Closed,By hand,1,100,90,USDT,/);
    await act(async () => { finish(); });
    expect(await screen.findByText('Saved kairos-journal-2026-10-24.csv.')).toBeInTheDocument();
    expect(button()).toHaveTextContent('Download as a spreadsheet');
    expect(button()).toHaveFocus();
    expect(device.download).not.toHaveBeenCalled();
  });

  it('downloads when the device has no share sheet; closing a share sheet says nothing', async () => {
    const db = await database();
    const device = ports();
    const { unmount } = render(<JournalCsvButton db={db} scope="practice" filters={NO_JOURNAL_FILTERS} timeZone="UTC" empty={false} filtered={false} ports={device} now={now} />);
    fireEvent.click(button());
    await waitFor(() => expect(device.download).toHaveBeenCalledTimes(1));
    expect(vi.mocked(device.download).mock.calls[0]![1]).toBe('kairos-practice-2026-10-24.csv');
    expect(await screen.findByText('Saved kairos-practice-2026-10-24.csv.')).toBeInTheDocument();
    unmount();

    const closed = ports({ canShare: vi.fn(() => true), share: vi.fn(async () => { throw new DOMException('closed', 'AbortError'); }) });
    render(<JournalCsvButton db={db} scope="real" filters={NO_JOURNAL_FILTERS} timeZone="UTC" empty={false} filtered={false} ports={closed} now={now} />);
    fireEvent.click(button());
    await waitFor(() => expect(button()).toHaveTextContent('Download as a spreadsheet'));
    expect(closed.share).toHaveBeenCalledTimes(1);
    expect(screen.queryByText(/^Saved /)).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('a failure says so with "Try again", which takes focus; trying again hands the same file over at once and moves focus back', async () => {
    const db = await database();
    let fail = true;
    const device = ports({ download: vi.fn(() => { if (fail) throw new Error('blocked'); }) });
    render(<JournalCsvButton db={db} scope="real" filters={NO_JOURNAL_FILTERS} timeZone="UTC" empty={false} filtered={false} ports={device} now={now} />);
    fireEvent.click(button());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kairos made kairos-journal-2026-10-24.csv but could not save it. Your trades were not changed.');
    // Review r1: the file is not made again (a big journal would outlast the tap): the trade deleted meanwhile is still in it.
    await db.trades.clear();
    const retry = within(alert).getByRole('button', { name: 'Try again' });
    await waitFor(() => expect(retry).toHaveFocus());
    fail = false;
    fireEvent.click(retry);
    expect(button()).toHaveFocus();
    expect(await screen.findByText('Saved kairos-journal-2026-10-24.csv.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(button()).toHaveFocus();
    expect(await (vi.mocked(device.download).mock.calls[1]![0] as Blob).text()).toContain('BTCUSDT');
  });

  it('review r1: when the trades can\'t be read it says it could not make the spreadsheet, and "Try again" reads again', async () => {
    const db = await database();
    const device = ports();
    const read = vi.spyOn(db, 'transaction').mockImplementationOnce((() => Promise.reject(new Error('storage'))) as never);
    render(<JournalCsvButton db={db} scope="real" filters={NO_JOURNAL_FILTERS} timeZone="UTC" empty={false} filtered={false} ports={device} now={now} />);
    fireEvent.click(button());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Kairos could not make the spreadsheet. Your trades were not changed.');
    read.mockRestore();
    fireEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Saved kairos-journal-2026-10-24.csv.')).toBeInTheDocument();
    expect(device.download).toHaveBeenCalledTimes(1);
  });

  it('review r1: a share sheet the browser won\'t open (the tap was too long ago) downloads the file instead', async () => {
    const db = await database();
    const device = ports({ canShare: vi.fn(() => true), share: vi.fn(async () => { throw new DOMException('no activation', 'NotAllowedError'); }) });
    render(<JournalCsvButton db={db} scope="real" filters={NO_JOURNAL_FILTERS} timeZone="UTC" empty={false} filtered={false} ports={device} now={now} />);
    fireEvent.click(button());
    expect(await screen.findByText('Saved kairos-journal-2026-10-24.csv.')).toBeInTheDocument();
    expect(device.share).toHaveBeenCalledTimes(1);
    expect(device.download).toHaveBeenCalledTimes(1);
  });

  it('review r1: what it said about one list goes when the filters change', async () => {
    const db = await database();
    const device = ports();
    const { rerender } = render(<JournalCsvButton db={db} scope="real" filters={NO_JOURNAL_FILTERS} timeZone="UTC" empty={false} filtered={false} ports={device} now={now} />);
    fireEvent.click(button());
    expect(await screen.findByText('Saved kairos-journal-2026-10-24.csv.')).toBeInTheDocument();
    rerender(<JournalCsvButton db={db} scope="real" filters={{ ...NO_JOURNAL_FILTERS, side: 'long' }} timeZone="UTC" empty={false} filtered ports={device} now={now} />);
    await waitFor(() => expect(screen.queryByText('Saved kairos-journal-2026-10-24.csv.')).toBeNull());
  });

  it('with no trade it says "Nothing to download" and why, and cannot be pressed', async () => {
    const db = await database();
    const device = ports();
    const { rerender } = render(<JournalCsvButton db={db} scope="real" filters={NO_JOURNAL_FILTERS} timeZone="UTC" empty filtered={false} ports={device} now={now} />);
    expect(screen.getByRole('button', { name: 'Nothing to download' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nothing to download' })).toHaveAccessibleDescription('There are no trades here yet.');
    rerender(<JournalCsvButton db={db} scope="real" filters={NO_JOURNAL_FILTERS} timeZone="UTC" empty filtered ports={device} now={now} />);
    expect(screen.getByRole('button', { name: 'Nothing to download' })).toHaveAccessibleDescription('None of your trades match these filters.');
    expect(device.download).not.toHaveBeenCalled();
  });

  it('sits under the Journal list\'s heading and follows the list: nothing to download when no trade matches', async () => {
    const db = await database();
    const router = createMemoryRouter([{ path: '/journal', element: <JournalRoute db={db} /> }], { initialEntries: ['/journal'] });
    render(<RouterProvider router={router} />);
    const history = await screen.findByRole('region', { name: 'Trade history' });
    expect(await within(history).findByRole('button', { name: 'Download as a spreadsheet' })).toBeInTheDocument();
    expect(await axeViolations(history)).toEqual([]);
    await act(async () => { await router.navigate('/journal?q=zzz', { replace: true }); });
    expect(await within(history).findByRole('button', { name: 'Nothing to download' })).toBeDisabled();
  });
});
