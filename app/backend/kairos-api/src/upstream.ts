/**
 * U1: the only way the Kairos server reads another site. A route names its upstream hosts in the route table; this
 * fetcher refuses every other host, never follows a redirect, never forwards the caller's headers, gives up after a time
 * limit and refuses an answer over a byte cap. The Worker is never an open proxy: no request value ever becomes a host.
 */
export const UPSTREAM_TIMEOUT_MS = 8_000;
export const UPSTREAM_MAX_BYTES = 1_048_576;
export const UPSTREAM_USER_AGENT = 'Kairos-api/1 (+https://kairos-p1-r17.pages.dev)';

export type UpstreamResult =
  | Readonly<{ ok: true; status: number; contentType: string; text: string }>
  | Readonly<{ ok: false; failure: 'timeout' | 'network' | 'status' | 'redirect' | 'too-large' | 'content-type'; status: number | null }>;

export interface UpstreamRequest {
  readonly accept: 'application/json' | 'text/csv' | 'application/xml' | 'text/xml' | 'application/rss+xml' | 'text/calendar';
  /** Headers the route adds itself, such as a key read from a Worker secret. Never from the caller. */
  readonly headers?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
  readonly maxBytes?: number;
}

export type UpstreamFetch = (url: string, request: UpstreamRequest) => Promise<UpstreamResult>;

/** A route asked for a host it did not list: a bug, answered as 'service-error' before any network use. */
export class UpstreamHostRefused extends Error {}

export function createUpstreamFetch(allowedHosts: readonly string[], fetchImpl: typeof fetch = (input, init) => fetch(input, init)): UpstreamFetch {
  return async (rawUrl, request) => {
    let url: URL;
    try { url = new URL(rawUrl); } catch { throw new UpstreamHostRefused('not a URL'); }
    if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '' || !allowedHosts.includes(url.hostname)) {
      throw new UpstreamHostRefused(url.hostname);
    }
    const maxBytes = request.maxBytes ?? UPSTREAM_MAX_BYTES;
    const timeout = AbortSignal.timeout(request.timeoutMs ?? UPSTREAM_TIMEOUT_MS);
    let response: Response;
    try {
      response = await fetchImpl(url.href, {
        method: 'GET',
        headers: { ...request.headers, accept: request.accept, 'user-agent': UPSTREAM_USER_AGENT },
        redirect: 'manual',
        signal: timeout,
      });
    } catch (error) {
      return { ok: false, failure: error instanceof DOMException && error.name === 'TimeoutError' ? 'timeout' : 'network', status: null };
    }
    if (response.status >= 300 && response.status < 400) return discard(response, 'redirect');
    if (!response.ok) return discard(response, 'status');
    const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes(request.accept) && !(request.accept.endsWith('xml') && contentType.includes('xml'))) return discard(response, 'content-type');
    const declared = Number.parseInt(response.headers.get('content-length') ?? '', 10);
    if (Number.isFinite(declared) && declared > maxBytes) return discard(response, 'too-large');
    const text = await readCapped(response, maxBytes);
    if (text === null) return { ok: false, failure: 'too-large', status: response.status };
    if (text === undefined) return { ok: false, failure: timedOut(timeout) ? 'timeout' : 'network', status: response.status };
    return { ok: true, status: response.status, contentType, text };
  };
}

/** The time limit ran out, as opposed to any other reason reading stopped. */
function timedOut(signal: AbortSignal): boolean {
  return signal.aborted && signal.reason instanceof DOMException && signal.reason.name === 'TimeoutError';
}

async function discard(response: Response, failure: 'redirect' | 'status' | 'too-large' | 'content-type'): Promise<UpstreamResult> {
  try { await response.body?.cancel(); } catch { /* already closed */ }
  return { ok: false, failure, status: response.status };
}

/** The body as text; null when it passes maxBytes, undefined when reading fails. */
async function readCapped(response: Response, maxBytes: number): Promise<string | null | undefined> {
  if (response.body === null) return '';
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } catch {
    return undefined;
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}
