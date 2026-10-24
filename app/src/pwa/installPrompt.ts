/**
 * T-054c (D228): whether Kairos can be installed on this device, and how. Where the browser offers its own install
 * prompt (`beforeinstallprompt`), the event is kept for one "Install" tap. iPhone and iPad Safari have no install API
 * but are the only browsers with `navigator.standalone`, so they get the Home Screen guide. Checked by feature, never
 * by browser name. Started once in `main.tsx`, before the browser fires the event.
 */

export type InstallState = 'installed' | 'can-prompt' | 'ios-guide' | 'unavailable';
export type InstallOutcome = 'accepted' | 'dismissed' | 'unavailable';

/** The browser's install prompt event (Chromium's `BeforeInstallPromptEvent`; not in TypeScript's DOM types). */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<unknown>;
  readonly userChoice: Promise<{ readonly outcome: 'accepted' | 'dismissed' }>;
}

/** The parts of `window` the install owner reads; tests pass a fake. */
export interface InstallWindowPort {
  addEventListener(type: 'beforeinstallprompt' | 'appinstalled', listener: (event: Event) => void): void;
  readonly matchMedia?: (query: string) => { readonly matches: boolean };
  readonly navigator: object;
}

/** What a screen needs: the state, a way to hear it change, and the prompt. */
export interface InstallPort {
  readonly getState: () => InstallState;
  readonly subscribe: (listener: () => void) => () => void;
  readonly prompt: () => Promise<InstallOutcome>;
}

const isPromptEvent = (event: Event): event is InstallPromptEvent =>
  typeof (event as Partial<InstallPromptEvent>).prompt === 'function' && (event as Partial<InstallPromptEvent>).userChoice instanceof Promise;

/** One install owner over a window. */
export function createInstallPrompt(target: InstallWindowPort): InstallPort {
  const listeners = new Set<() => void>();
  let kept: InstallPromptEvent | null = null;
  let installed = (typeof target.matchMedia === 'function' && target.matchMedia('(display-mode: standalone)').matches)
    || (target.navigator as { standalone?: unknown }).standalone === true;
  const appleGuide = 'standalone' in target.navigator;
  const read = (): InstallState => (installed ? 'installed' : kept !== null ? 'can-prompt' : appleGuide ? 'ios-guide' : 'unavailable');
  // A stored snapshot, changed only with a publish, so a screen never reads a state it was not told about.
  let state = read();
  const publish = () => {
    const next = read();
    if (next === state) return;
    state = next;
    for (const listener of listeners) listener();
  };

  target.addEventListener('beforeinstallprompt', event => {
    if (!isPromptEvent(event)) return;
    // Keeps the browser's own banner away: the card is the one place that offers the install.
    event.preventDefault();
    kept = event;
    publish();
  });
  target.addEventListener('appinstalled', () => {
    installed = true;
    kept = null;
    publish();
  });

  return Object.freeze({
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    async prompt(): Promise<InstallOutcome> {
      const event = kept;
      if (event === null || installed) return 'unavailable';
      // The browser shows an event's prompt once.
      kept = null;
      try {
        await event.prompt();
        const { outcome } = await event.userChoice;
        // "accepted" is the install starting; `appinstalled` follows.
        if (outcome === 'accepted') installed = true;
        return outcome;
      } catch {
        return 'unavailable';
      } finally {
        publish();
      }
    },
  });
}

let shared: InstallPort | null = null;
const NOT_STARTED: InstallPort = Object.freeze({ getState: () => 'unavailable' as const, subscribe: () => () => undefined, prompt: async () => 'unavailable' as const });

/** Starts the app's install owner on `window` (once). */
export function startInstallPrompt(target: InstallWindowPort = window): InstallPort {
  shared ??= createInstallPrompt(target);
  return shared;
}

/** The app's install state; before `startInstallPrompt` (tests, a screen rendered alone) it is "unavailable". */
export const getInstallState = (): InstallState => (shared ?? NOT_STARTED).getState();
export const subscribeInstallState = (listener: () => void): (() => void) => (shared ?? NOT_STARTED).subscribe(listener);
/** Shows the browser's install prompt, when it offers one. */
export const promptInstall = (): Promise<InstallOutcome> => (shared ?? NOT_STARTED).prompt();

export const browserInstall: InstallPort = Object.freeze({ getState: getInstallState, subscribe: subscribeInstallState, prompt: promptInstall });
