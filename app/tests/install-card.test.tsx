import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeRoute } from '../src/app/HomeRoute';
import { installCardMetadataKey, loadInstallCardHidden } from '../src/application/setup/deviceKeeping';
import { skipSetup } from '../src/application/setup/setupState';
import { createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { InstallCard } from '../src/features/install/InstallCard';
import { createInstallPrompt, startInstallPrompt, type InstallPromptEvent, type InstallWindowPort } from '../src/pwa/installPrompt';
import { axeViolations } from './fixtures/axe';

vi.mock('../src/app/HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime', () => ({
  HomeDashboardLiveCryptoBubbleConfiguredBrowserRadiusScaleTextEvidenceRuntime: () => null,
}));

const names: string[] = [];
const opened: Dexie[] = [];
afterEach(async () => { cleanup(); vi.restoreAllMocks(); for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function database(): Promise<KairosDatabase> {
  const name = `kairos-install-card-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); opened.push(db); await openKairosDatabase(db);
  return db;
}
const now = () => '2026-10-23T10:00:00.000Z';

function browser(navigator: object) {
  const listeners = new Map<string, Array<(event: Event) => void>>();
  const port: InstallWindowPort = {
    addEventListener: (type, listener) => { listeners.set(type, [...(listeners.get(type) ?? []), listener]); },
    matchMedia: () => ({ matches: false }),
    navigator,
  };
  const fire = (type: string, event: Event = new Event(type)) => act(() => { for (const listener of listeners.get(type) ?? []) listener(event); });
  return { port, fire, install: createInstallPrompt(port) };
}
function offerPrompt(outcome: 'accepted' | 'dismissed') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as InstallPromptEvent;
  const prompt = vi.fn(async () => undefined);
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome }) });
  return { event, prompt };
}
const card = (name: string) => screen.findByRole('region', { name });
/** The card between two buttons; the host's `onHidden` focuses "After". */
function harness(db: KairosDatabase, install: ReturnType<typeof browser>['install']) {
  const after = () => screen.getByRole('button', { name: 'After' }).focus();
  return render(<><button type="button">Before</button><InstallCard db={db} now={now} install={install} onHidden={after} /><button type="button">After</button></>);
}

describe('T-054c the install card', () => {
  it('offers "Install" where the browser has its prompt, and moves focus on after it', async () => {
    const db = await database();
    const phone = browser({});
    const { event, prompt } = offerPrompt('dismissed');
    harness(db, phone.install);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(screen.queryByRole('region')).toBeNull();
    await phone.fire('beforeinstallprompt', event);
    const shown = await card('Install Kairos');
    expect(within(shown).getByText('It opens like an app, works offline, and keeps your journal safer.')).toBeInTheDocument();
    const install = within(shown).getByRole('button', { name: 'Install' });
    install.focus();
    await act(async () => { fireEvent.click(install); });
    expect(prompt).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Install Kairos' })).toBeNull());
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
  });

  it('on iPhone and iPad Safari shows the three-step Home Screen guide, with pictures and no "Install"', async () => {
    const db = await database();
    const { container } = harness(db, browser({ standalone: false }).install);
    const shown = await card('Add Kairos to your Home Screen');
    expect(within(shown).getByText("Safari can clear the data of sites you don't add.")).toBeInTheDocument();
    const steps = within(within(shown).getByRole('list', { name: 'How to add Kairos' })).getAllByRole('listitem');
    expect(steps.map(step => step.textContent)).toEqual(['1Tap Share.', '2Choose "Add to Home Screen".', '3Tap "Add". Kairos is now on your Home Screen.']);
    expect(steps.map(step => step.querySelector('svg')?.getAttribute('data-icon'))).toEqual(['share', 'plus', 'home']);
    expect(within(shown).queryByRole('button', { name: 'Install' })).toBeNull();
    expect(await axeViolations(container)).toEqual([]);
  });

  it('"Not now" is kept across a reload and moves focus on', async () => {
    const db = await database();
    harness(db, browser({ standalone: false }).install);
    const notNow = within(await card('Add Kairos to your Home Screen')).getByRole('button', { name: 'Not now' });
    notNow.focus();
    await act(async () => { fireEvent.click(notNow); });
    await waitFor(() => expect(screen.queryByRole('region')).toBeNull());
    expect(screen.getByRole('button', { name: 'After' })).toHaveFocus();
    expect(await loadInstallCardHidden(db)).toBe(true);
    cleanup();
    harness(db, browser({ standalone: false }).install);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('a failed "Not now" says so and keeps the card, with focus on "Not now"', async () => {
    const db = await database();
    harness(db, browser({ standalone: false }).install);
    const notNow = within(await card('Add Kairos to your Home Screen')).getByRole('button', { name: 'Not now' });
    notNow.focus();
    vi.spyOn(db, 'transaction').mockRejectedValue(new Error('quota'));
    await act(async () => { fireEvent.click(notNow); });
    expect(await screen.findByRole('alert')).toHaveTextContent('Kairos could not save "Not now". Nothing was changed; press it again to try once more.');
    expect(notNow).toHaveFocus();
  });

  it('is gone once installed, and never shows when installed or where nothing works', async () => {
    const db = await database();
    const phone = browser({ standalone: false });
    harness(db, phone.install);
    await card('Add Kairos to your Home Screen');
    await phone.fire('appinstalled');
    expect(screen.queryByRole('region')).toBeNull();
    cleanup();
    harness(db, browser({ standalone: true }).install);
    harness(db, browser({}).install);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 50)); });
    expect(screen.queryByRole('region')).toBeNull();
    // A damaged "Not now" reads as not set.
    await db.metadata.put({ key: installCardMetadataKey, value: 'not json', updatedAt: now() });
    expect(await loadInstallCardHidden(db)).toBe(false);
  });

  it('shows on Home below Getting started, which hands focus to it after "Hide"', async () => {
    const db = await database();
    await skipSetup(db, { now });
    startInstallPrompt(browser({ standalone: false }).port);
    render(<RouterProvider router={createMemoryRouter([{ path: '/', element: <HomeRoute db={db} now={now} /> }], { initialEntries: ['/'] })} />);
    const install = await card('Add Kairos to your Home Screen');
    const started = await card('Getting started');
    expect(started.compareDocumentPosition(install) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const hide = within(started).getByRole('button', { name: 'Hide' });
    hide.focus();
    await act(async () => { fireEvent.click(hide); });
    await waitFor(() => expect(within(install).getByRole('button', { name: 'Not now' })).toHaveFocus());
    await act(async () => { fireEvent.click(within(install).getByRole('button', { name: 'Not now' })); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Live Market' })).toHaveFocus());
  });
});
