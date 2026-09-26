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

function isLearningSourceRequest(request, url) {
  return isSameOrigin(url) && request.method === 'GET' && url.pathname.startsWith(KAIROS_SERVICE_WORKER.learningSourcesPath);
}

// The page is the only writer of the learning-sources cache; the worker only reads it. The query names the
// revision, so only the exact saved revision matches.
async function savedLearningSource(request) {
  const saved = await (await caches.open(KAIROS_SERVICE_WORKER.learningSourcesCache)).match(request.url);
  if (saved) return saved;
  try {
    return await fetch(request);
  } catch {
    return new Response('This learning source is not saved on this device yet. Connect to the internet to open it, or save it for offline in the Kairos Library.', { status: 503, headers: { 'content-type': 'text/plain; charset=utf-8' } });
  }
}

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

  // Before navigations: an offline page load would otherwise answer a PDF with the app shell.
  if (isLearningSourceRequest(request, url)) {
    event.respondWith(savedLearningSource(request));
    return;
  }

  if (request.mode === 'navigate' && isSameOrigin(url)) {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (isStaticAssetRequest(request, url)) {
    event.respondWith(cacheFirstAsset(request));
  }
});
