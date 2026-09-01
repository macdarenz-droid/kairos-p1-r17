export type ServiceWorkerUpdateState = 'unsupported' | 'idle' | 'checking' | 'ready' | 'update-available' | 'error';

export interface ServiceWorkerStatus {
  readonly state: ServiceWorkerUpdateState;
  readonly hasWaitingUpdate: boolean;
}

type StatusListener = (status: ServiceWorkerStatus) => void;

const listeners = new Set<StatusListener>();
let currentStatus: ServiceWorkerStatus = { state: 'idle', hasWaitingUpdate: false };
let currentRegistration: ServiceWorkerRegistration | null = null;

function publish(status: ServiceWorkerStatus) {
  currentStatus = status;
  for (const listener of listeners) listener(status);
}

export function getServiceWorkerStatus(): ServiceWorkerStatus {
  return currentStatus;
}

export function subscribeServiceWorkerStatus(listener: StatusListener): () => void {
  listeners.add(listener);
  listener(currentStatus);
  return () => listeners.delete(listener);
}

function observeInstallingWorker(registration: ServiceWorkerRegistration) {
  const worker = registration.installing;
  if (!worker) return;

  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed' && navigator.serviceWorker.controller) {
      publish({ state: 'update-available', hasWaitingUpdate: true });
    }
  });
}

export async function registerKairosServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    publish({ state: 'unsupported', hasWaitingUpdate: false });
    return null;
  }

  publish({ state: 'checking', hasWaitingUpdate: false });
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    currentRegistration = registration;

    if (registration.waiting) {
      publish({ state: 'update-available', hasWaitingUpdate: true });
    } else {
      publish({ state: 'ready', hasWaitingUpdate: false });
    }

    registration.addEventListener('updatefound', () => observeInstallingWorker(registration));
    return registration;
  } catch {
    publish({ state: 'error', hasWaitingUpdate: false });
    return null;
  }
}

export function activateWaitingServiceWorker(): boolean {
  const waiting = currentRegistration?.waiting;
  if (!waiting) return false;
  waiting.postMessage({ type: 'KAIROS_ACTIVATE_UPDATE' });
  return true;
}
