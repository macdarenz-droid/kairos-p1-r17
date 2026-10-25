/**
 * The activation Worker's answers and CORS. Every app build reads the answer shape (RemoteActivationAdapter.ts), so it
 * stays: { ok: true, receipt } or { ok: false, reason }, as JSON that is never cached, with `Vary: Origin`.
 * Only the app's exact origins (KAIROS_APP_ORIGINS) get CORS headers. A request with another Origin is refused before any
 * work, so another website can't spend a code or the limiter (D277). A caller with no Origin (curl) is answered (D139).
 */
export type ActivationReason = 'invalid-code' | 'already-used' | 'expired-code' | 'rate-limited' | 'service-error' | 'origin-not-allowed';

export type ActivationAnswer = Readonly<{ ok: true; receipt: unknown }> | Readonly<{ ok: false; reason: ActivationReason }>;

/** Who is asking: the request's Origin and whether it is one of the app's. */
export interface Caller {
  readonly origin: string | null;
  /** true: the Origin is on the exact list. false for no Origin. */
  readonly isApp: boolean;
  /** true: an Origin was sent and it is not the app's. */
  readonly refused: boolean;
}

/** The exact origins in the comma-separated setting; an entry that is not a bare https origin is ignored. */
export function parseAppOrigins(setting: string | undefined): readonly string[] {
  if (typeof setting !== 'string') return [];
  const origins: string[] = [];
  for (const entry of setting.split(',').map((part) => part.trim()).filter((part) => part !== '')) {
    let url: URL;
    try { url = new URL(entry); } catch { continue; }
    if (url.protocol === 'https:' && url.origin === entry && !origins.includes(entry)) origins.push(entry);
  }
  return origins;
}

export function callerOf(request: Request, appOrigins: string | undefined): Caller {
  const origin = request.headers.get('origin');
  const isApp = origin !== null && parseAppOrigins(appOrigins).includes(origin);
  return { origin, isApp, refused: origin !== null && !isApp };
}

function corsHeaders(caller: Caller): Record<string, string> {
  return caller.isApp && caller.origin !== null ? { vary: 'Origin', 'access-control-allow-origin': caller.origin } : { vary: 'Origin' };
}

export function json(caller: Caller, body: ActivationAnswer, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store', ...corsHeaders(caller) },
  });
}

/** A preflight: the app's origin may POST JSON; anyone else (no Origin included) gets an empty 403. */
export function preflight(caller: Caller): Response {
  if (!caller.isApp || caller.origin === null) {
    return new Response(null, { status: 403, headers: { 'cache-control': 'no-store', vary: 'Origin' } });
  }
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': caller.origin,
      'access-control-allow-methods': 'POST, OPTIONS',
      'access-control-allow-headers': 'Accept, Content-Type',
      'cache-control': 'no-store',
      vary: 'Origin',
    },
  });
}

/** Another website, on any path and method: 403, with no CORS header. A preflight keeps its empty 403. */
export function originRefused(caller: Caller, method: string): Response {
  return method === 'OPTIONS' ? preflight(caller) : json(caller, { ok: false, reason: 'origin-not-allowed' }, 403);
}
