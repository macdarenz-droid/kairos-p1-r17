const CACHE_PREFIX = 'kairos-app-shell-';
const CACHE_VERSION = 'v1';
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const APP_SHELL_URL = '/';

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isStaticAssetRequest(request, url) {
  if (!isSameOrigin(url) || request.method !== 'GET') return false;
  return ['script', 'style', 'image', 'font', 'manifest'].includes(request.destination) || url.pathname.startsWith('/assets/');
}

async function discoverAndCacheAppShell() {
  const response = await fetch(APP_SHELL_URL, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Kairos app shell fetch failed: ${response.status}`);

  const cache = await caches.open(CACHE_NAME);
  await cache.put(APP_SHELL_URL, response.clone());

  const html = await response.text();
  const discovered = new Set(['/manifest.webmanifest']);
  const attributePattern = /(?:src|href)=["']([^"']+)["']/g;
  for (const match of html.matchAll(attributePattern)) {
    const candidate = new URL(match[1], self.location.origin);
    if (candidate.origin === self.location.origin) discovered.add(candidate.pathname + candidate.search);
  }

  await cache.addAll([...discovered]);
}

self.addEventListener('install', (event) => {
  event.waitUntil(discoverAndCacheAppShell());
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
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(APP_SHELL_URL, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(APP_SHELL_URL);
    if (cached) return cached;
    throw new Error('Kairos offline shell is unavailable.');
  }
}

async function cacheFirstAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  const response = await fetch(request);
  if (response.ok) {
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
