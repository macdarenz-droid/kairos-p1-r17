/**
 * U1: the HTTP edges of the Kairos server. Every answer is JSON with one shape, never an upstream body passed through:
 * ok → { apiVersion: 1, ok: true, data }; failure → { apiVersion: 1, ok: false, error: 'unavailable', reason, retryAfter }.
 * CORS answers only the app's own origins (KAIROS_APP_ORIGINS); CORS is not access control, the router's checks are.
 */
export const KAIROS_API_VERSION = 1 as const;

export type UnavailableReason =
  | 'bad-request' | 'device-not-recognised' | 'origin-not-allowed' | 'not-found' | 'method-not-allowed'
  | 'rate-limited' | 'service-error' | 'source-unavailable' | 'not-set-up';

/** HTTP status and the default wait before "Try again" helps (null: a retry soon will not help). */
export const UNAVAILABLE_REASONS: Readonly<Record<UnavailableReason, { readonly status: number; readonly retryAfter: number | null }>> = Object.freeze({
  'bad-request': { status: 400, retryAfter: null },
  'device-not-recognised': { status: 401, retryAfter: null },
  'origin-not-allowed': { status: 403, retryAfter: null },
  'not-found': { status: 404, retryAfter: null },
  'method-not-allowed': { status: 405, retryAfter: null },
  'rate-limited': { status: 429, retryAfter: 60 },
  'service-error': { status: 500, retryAfter: null },
  'source-unavailable': { status: 502, retryAfter: 30 },
  'not-set-up': { status: 503, retryAfter: null },
});

const PREVIEW_LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/** The exact origins in the comma-separated setting; an entry that is not a bare https origin is ignored. */
export function parseAllowedOrigins(setting: string | undefined): readonly string[] {
  if (typeof setting !== 'string') return [];
  const origins: string[] = [];
  for (const entry of setting.split(',').map((part) => part.trim()).filter((part) => part !== '')) {
    let url: URL;
    try { url = new URL(entry); } catch { continue; }
    if (url.protocol === 'https:' && url.origin === entry && !origins.includes(entry)) origins.push(entry);
  }
  return Object.freeze(origins);
}

/** An allowed origin, or a Pages preview of one: https://<label>.<project>.pages.dev for an allowed https://<project>.pages.dev. */
export function isAllowedOrigin(origin: string | null, allowed: readonly string[]): boolean {
  if (origin === null) return false;
  if (allowed.includes(origin)) return true;
  let url: URL;
  try { url = new URL(origin); } catch { return false; }
  if (url.protocol !== 'https:' || url.origin !== origin) return false;
  const [label, ...rest] = url.hostname.split('.');
  return rest.length === 3 && rest[1] === 'pages' && rest[2] === 'dev' && PREVIEW_LABEL.test(label) && allowed.includes(`https://${rest.join('.')}`);
}

export function baseHeaders(origin: string | null, allowed: readonly string[], cacheControl: string): Headers {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl, 'x-content-type-options': 'nosniff', vary: 'Origin' });
  if (origin !== null && isAllowedOrigin(origin, allowed)) headers.set('access-control-allow-origin', origin);
  return headers;
}

export function okResponse(data: unknown, origin: string | null, allowed: readonly string[], cacheControl: string): Response {
  return new Response(JSON.stringify({ apiVersion: KAIROS_API_VERSION, ok: true, data }), { status: 200, headers: baseHeaders(origin, allowed, cacheControl) });
}

export function unavailableResponse(reason: UnavailableReason, origin: string | null, allowed: readonly string[], retryAfter = UNAVAILABLE_REASONS[reason].retryAfter): Response {
  const headers = baseHeaders(origin, allowed, 'no-store');
  if (retryAfter !== null) headers.set('retry-after', String(retryAfter));
  if (reason === 'method-not-allowed') headers.set('allow', 'GET, OPTIONS');
  return new Response(JSON.stringify({ apiVersion: KAIROS_API_VERSION, ok: false, error: 'unavailable', reason, retryAfter }), { status: UNAVAILABLE_REASONS[reason].status, headers });
}

/** A preflight from an allowed origin: GET only, the two request headers the app sends, kept by the browser for 2 hours. */
export function preflightResponse(origin: string): Response {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': origin,
      'access-control-allow-methods': 'GET, OPTIONS',
      'access-control-allow-headers': 'accept, x-kairos-device',
      'access-control-max-age': '7200',
      'cache-control': 'no-store',
      vary: 'Origin',
    },
  });
}
