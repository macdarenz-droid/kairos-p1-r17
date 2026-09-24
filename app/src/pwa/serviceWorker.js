const KAIROS_SERVICE_WORKER = __KAIROS_SERVICE_WORKER_CONFIG__;
const CACHE_PREFIX = 'kairos-app-shell-';
const CACHE_NAME = `${CACHE_PREFIX}${KAIROS_SERVICE_WORKER.cacheVersion}`;
const APP_SHELL_URL = '/';

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isStaticAssetRequest(request, url) {
  if (!isSameOrigin(url) || request.method !== 'GET') return false;
  return ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination) || url.pathname.startsWith('/assets/');
}

// The build writes this worker's exact file list, so the cached shell always matches the cached scripts.
async function precacheAppShell() {
  const cache = await caches.open(CACHE_NAME);
  await cache.addAll(KAIROS_SERVICE_WORKER.precacheUrls);
}

// No skipWaiting here: a new version waits until the user taps Update.
self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'KAIROS_ACTIVATE_UPDATE') {
    event.waitUntil(self.skipWaiting());
  }
});

async function networkFirstNavigation(request) {
  try {
    return await fetch(request);
  } catch {
    const cached = await (await caches.open(CACHE_NAME)).match(APP_SHELL_URL);
    if (cached) return cached;
    throw new Error('Kairos offline shell is unavailable.');
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  // A host may answer a missing old script with index.html; never cache that page as a script.
  const contentType = response.headers.get('content-type') ?? '';
  if (response.ok && !contentType.includes('text/html')) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.mode === 'navigate' && isSameOrigin(url)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
