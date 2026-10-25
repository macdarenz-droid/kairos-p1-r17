import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { YourDevicesCard, type YourDevicesPort } from '../src/features/activation/YourDevicesCard';
import type { ActivationDeviceList, ActivationDeviceListResult, ActivationDeviceRemoveResult } from '../src/services/activation';
import { axeViolations } from './fixtures/axe';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const TOKEN = 'v1.eyJhIjoxfQ.c2lnbmF0dXJl';
const NOW = () => new Date('2026-10-24T10:00:00.000Z');
const thisPhone = { id: 1, label: 'iPhone · Safari', since: '2026-10-03T08:00:00.000Z', lastSeenOn: '2026-10-24', thisDevice: true };
const android = { id: 4, label: 'Android · Chrome', since: '2025-12-20T09:00:00.000Z', lastSeenOn: '2026-10-20', thisDevice: false };
const TWO: ActivationDeviceList = { used: 2, limit: 3, devices: [thisPhone, android] };
const ONE: ActivationDeviceList = { used: 1, limit: 3, devices: [thisPhone] };

function port(lists: readonly ActivationDeviceListResult[], removal: ActivationDeviceRemoveResult = { ok: true }, token: string | null = TOKEN) {
  let reads = 0;
  return {
    readToken: vi.fn(async () => token),
    listDevices: vi.fn(async () => lists[Math.min(reads++, lists.length - 1)]!),
    removeDevice: vi.fn(async () => removal),
  } satisfies YourDevicesPort;
}

const mount = (devices: YourDevicesPort) => render(<YourDevicesCard port={devices} timeZone="UTC" now={NOW} />);
const card = () => screen.getByRole('article', { name: 'Your devices' });

describe('T-062f "Your devices" (D283)', () => {
  it('says how many of the code\'s devices are used, with one row per device', async () => {
    const devices = port([{ ok: true, list: TWO }]);
    mount(devices);

    expect(await screen.findByText('This code is used on 2 of 3 devices.')).toBeInTheDocument();
    expect(devices.listDevices).toHaveBeenCalledWith(TOKEN, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    const rows = within(card()).getAllByRole('listitem');
    expect(rows.map((row) => row.textContent)).toEqual([
      'iPhone · Safarisince 3 Oct · last used todayThis device',
      'Android · Chromesince 20 Dec 2025 · last used 20 OctRemove',
    ]);
  });

  it('"This device" has no Remove', async () => {
    mount(port([{ ok: true, list: TWO }]));
    const [mine, other] = await within(await screen.findByRole('list')).findAllByRole('listitem');
    expect(within(mine!).queryByRole('button')).not.toBeInTheDocument();
    expect(within(mine!).getByText('This device')).toBeInTheDocument();
    expect(within(other!).getByRole('button', { name: 'Remove' })).toHaveAccessibleDescription('Android · Chrome since 20 Dec 2025 · last used 20 Oct');
  });

  it('Remove asks first, then the list reads again', async () => {
    const devices = port([{ ok: true, list: TWO }, { ok: true, list: ONE }]);
    mount(devices);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));

    const dialog = screen.getByRole('alertdialog', { name: 'Remove Android · Chrome?' });
    expect(dialog).toHaveAccessibleDescription('It goes back to the invite screen the next time it opens online. Its journal stays on it.');
    expect(devices.removeDevice).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Keep it' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(devices.removeDevice).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' })); });

    expect(devices.removeDevice).toHaveBeenCalledWith(TOKEN, 4);
    expect(await screen.findByText('This code is used on 1 of 3 devices.')).toBeInTheDocument();
    expect(devices.listDevices).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByText('Android · Chrome')).not.toBeInTheDocument();
    // The Remove button went with its row; focus goes to the new count, never to the page.
    await waitFor(() => expect(screen.getByText('This code is used on 1 of 3 devices.')).toHaveFocus());
  });

  it('a removal that fails says so, and changes nothing', async () => {
    const devices = port([{ ok: true, list: TWO }], { ok: false, reason: 'network-unavailable' });
    mount(devices);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' })); });

    expect(await screen.findByRole('alert')).toHaveTextContent("Kairos couldn't remove Android · Chrome right now. Nothing was changed. Try again in a moment.");
    expect(screen.getByText('This code is used on 2 of 3 devices.')).toBeInTheDocument();
    expect(devices.listDevices).toHaveBeenCalledTimes(1);
  });

  it('a removal whose device can\'t be read from storage is a failed removal, not "not activated"', async () => {
    const devices = port([{ ok: true, list: TWO }]);
    devices.readToken.mockResolvedValueOnce(TOKEN).mockRejectedValueOnce(new Error('storage closed'));
    mount(devices);
    fireEvent.click(await screen.findByRole('button', { name: 'Remove' }));
    await act(async () => { fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Remove' })); });

    expect(await screen.findByRole('alert')).toHaveTextContent("Kairos couldn't remove Android · Chrome right now.");
    expect(devices.removeDevice).not.toHaveBeenCalled();
    expect(screen.queryByText("This device isn't activated, so Kairos can't show your devices.")).not.toBeInTheDocument();
    expect(screen.getByText('This code is used on 2 of 3 devices.')).toBeInTheDocument();
  });

  it('offline or failed: "unavailable" with "Try again", and never a count of 0', async () => {
    const devices = port([{ ok: false, reason: 'network-unavailable' }, { ok: true, list: TWO }]);
    mount(devices);

    expect(await screen.findByRole('alert')).toHaveTextContent('Your devices are unavailable right now.');
    expect(card().textContent).not.toMatch(/\d+ of \d+/);
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    await act(async () => { fireEvent.click(retry); });

    expect(await screen.findByText('This code is used on 2 of 3 devices.')).toHaveFocus();
    expect(devices.listDevices).toHaveBeenCalledTimes(2);
  });

  it.each([
    [{ ok: false, reason: 'service-error' } as const, 'Your devices are unavailable right now.'],
    [{ ok: false, reason: 'device-not-recognised' } as const, 'Your devices are unavailable right now.'],
    [{ ok: false, reason: 'device-removed' } as const, 'This device was removed from your invite code. Your journal stays on this device.'],
    [{ ok: false, reason: 'code-revoked' } as const, 'This invite code no longer works. Your journal stays on this device.'],
  ])('says what it knows when the list is %o', async (answer, words) => {
    mount(port([answer]));
    expect(await screen.findByText(words)).toBeInTheDocument();
    expect(card().textContent).not.toMatch(/\d+ of \d+/);
  });

  it('a device that isn\'t activated asks the server nothing', async () => {
    const devices = port([{ ok: true, list: TWO }], { ok: true }, null);
    mount(devices);
    expect(await screen.findByText("This device isn't activated, so Kairos can't show your devices.")).toBeInTheDocument();
    expect(devices.listDevices).not.toHaveBeenCalled();
  });

  it('passes axe at 390 px, with the list and with Remove asking', async () => {
    window.innerWidth = 390;
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(390);
    const { container } = mount(port([{ ok: true, list: TWO }]));
    await screen.findByText('This code is used on 2 of 3 devices.');
    expect(await axeViolations(container)).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
