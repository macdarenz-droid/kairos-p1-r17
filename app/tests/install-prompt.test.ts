import { describe, expect, it, vi } from 'vitest';
import { createInstallPrompt, type InstallPromptEvent, type InstallWindowPort } from '../src/pwa/installPrompt';

/** A window with the given navigator and display mode, whose events the test fires. */
function fakeWindow(navigator: object, standaloneDisplay = false) {
  const listeners = new Map<string, Array<(event: Event) => void>>();
  const port: InstallWindowPort = {
    addEventListener: (type, listener) => { listeners.set(type, [...(listeners.get(type) ?? []), listener]); },
    matchMedia: query => ({ matches: standaloneDisplay && query === '(display-mode: standalone)' }),
    navigator,
  };
  const fire = (type: string, event: Event = new Event(type)) => { for (const listener of listeners.get(type) ?? []) listener(event); };
  return { port, fire };
}
/** The browser's install prompt event, answering with `outcome`. */
function promptEvent(outcome: 'accepted' | 'dismissed' | 'throws') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as InstallPromptEvent;
  const prompt = vi.fn(async () => { if (outcome === 'throws') throw new DOMException('shown already', 'InvalidStateError'); });
  Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: outcome === 'throws' ? 'dismissed' : outcome }) });
  return { event, prompt };
}

describe('T-054c the install owner', () => {
  it('reads each state from the browser', () => {
    expect(createInstallPrompt(fakeWindow({}).port).getState()).toBe('unavailable');
    expect(createInstallPrompt(fakeWindow({ standalone: false }).port).getState()).toBe('ios-guide');
    expect(createInstallPrompt(fakeWindow({ standalone: true }).port).getState()).toBe('installed');
    expect(createInstallPrompt(fakeWindow({}, true).port).getState()).toBe('installed');
    expect(createInstallPrompt({ addEventListener: () => undefined, navigator: {} }).getState()).toBe('unavailable');
  });

  it('keeps the browser\'s prompt (its banner held back) and says it can prompt', () => {
    const browser = fakeWindow({});
    const install = createInstallPrompt(browser.port);
    const heard = vi.fn();
    install.subscribe(heard);
    const { event } = promptEvent('dismissed');
    browser.fire('beforeinstallprompt', event);
    expect(event.defaultPrevented).toBe(true);
    expect(install.getState()).toBe('can-prompt');
    expect(heard).toHaveBeenCalledTimes(1);
    // An event without a prompt is not the browser's install prompt.
    const plain = fakeWindow({});
    const other = createInstallPrompt(plain.port);
    const bare = new Event('beforeinstallprompt', { cancelable: true });
    plain.fire('beforeinstallprompt', bare);
    expect(bare.defaultPrevented).toBe(false);
    expect(other.getState()).toBe('unavailable');
  });

  it('"accepted" is installed; the prompt is shown once', async () => {
    const browser = fakeWindow({});
    const install = createInstallPrompt(browser.port);
    const { event, prompt } = promptEvent('accepted');
    browser.fire('beforeinstallprompt', event);
    expect(await install.prompt()).toBe('accepted');
    expect(prompt).toHaveBeenCalledTimes(1);
    expect(install.getState()).toBe('installed');
    expect(await install.prompt()).toBe('unavailable');
    expect(prompt).toHaveBeenCalledTimes(1);
  });

  it('"dismissed" spends the prompt, and a prompt that throws is unavailable', async () => {
    const browser = fakeWindow({});
    const install = createInstallPrompt(browser.port);
    browser.fire('beforeinstallprompt', promptEvent('dismissed').event);
    expect(await install.prompt()).toBe('dismissed');
    expect(install.getState()).toBe('unavailable');
    browser.fire('beforeinstallprompt', promptEvent('throws').event);
    expect(install.getState()).toBe('can-prompt');
    expect(await install.prompt()).toBe('unavailable');
    expect(install.getState()).toBe('unavailable');
  });

  it('hears the app installed, from the prompt or the browser\'s own menu', () => {
    const browser = fakeWindow({ standalone: false });
    const install = createInstallPrompt(browser.port);
    const heard = vi.fn();
    const stop = install.subscribe(heard);
    browser.fire('appinstalled');
    expect(install.getState()).toBe('installed');
    expect(heard).toHaveBeenCalledTimes(1);
    stop();
    browser.fire('beforeinstallprompt', promptEvent('accepted').event);
    expect(install.getState()).toBe('installed');
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
