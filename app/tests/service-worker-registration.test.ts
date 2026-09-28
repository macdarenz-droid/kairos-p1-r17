import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeWorker extends EventTarget {
  state = 'installing';
  postMessage = vi.fn();
  reach(state: string) { this.state = state; this.dispatchEvent(new Event('statechange')); }
}

class FakeRegistration extends EventTarget {
  waiting: FakeWorker | null = null;
  installing: FakeWorker | null = null;
  update = vi.fn(async () => undefined);
}

class FakeContainer extends EventTarget {
  controller: object | null = null;
  registration = new FakeRegistration();
  register = vi.fn(async () => this.registration);
}

let container: FakeContainer;

beforeEach(() => {
  vi.resetModules();
  container = new FakeContainer();
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker');
  Reflect.deleteProperty(document, 'visibilityState');
});

async function load() {
  return import('../src/pwa/serviceWorkerRegistration');
}

describe('service worker registration', () => {
  it('offers a waiting worker as an update', async () => {
    container.controller = {};
    container.registration.waiting = new FakeWorker();
    const module = await load();
    await module.registerKairosServiceWorker({ reload: vi.fn() });
    expect(module.getServiceWorkerStatus()).toEqual({ state: 'update-available', hasWaitingUpdate: true });
  });

  it('offers an update found later, but not the first install', async () => {
    container.controller = {};
    const module = await load();
    await module.registerKairosServiceWorker({ reload: vi.fn() });
    const worker = new FakeWorker();
    container.registration.installing = worker;
    container.registration.dispatchEvent(new Event('updatefound'));
    worker.reach('installed');
    expect(module.getServiceWorkerStatus().state).toBe('update-available');

    vi.resetModules();
    container = new FakeContainer();
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: container });
    const fresh = await load();
    const first = new FakeWorker();
    container.registration.installing = first;
    await fresh.registerKairosServiceWorker({ reload: vi.fn() });
    first.reach('installed');
    expect(fresh.getServiceWorkerStatus().hasWaitingUpdate).toBe(false);
  });

  it('asks the waiting worker to take over and reloads once', async () => {
    container.controller = {};
    const waiting = new FakeWorker();
    container.registration.waiting = waiting;
    const reload = vi.fn();
    const module = await load();
    await module.registerKairosServiceWorker({ reload });
    expect(module.activateWaitingServiceWorker()).toBe(true);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'KAIROS_ACTIVATE_UPDATE' });
    container.dispatchEvent(new Event('controllerchange'));
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('does not reload when another tab took the update', async () => {
    const reload = vi.fn();
    const module = await load();
    await module.registerKairosServiceWorker({ reload });
    container.dispatchEvent(new Event('controllerchange'));
    expect(reload).not.toHaveBeenCalled();
    expect(module.activateWaitingServiceWorker()).toBe(false);
  });

  it('checks for updates when the page becomes visible', async () => {
    const module = await load();
    await module.registerKairosServiceWorker({ reload: vi.fn() });
    container.registration.update.mockRejectedValueOnce(new Error('offline'));
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(container.registration.update).toHaveBeenCalledTimes(1);
  });
});
