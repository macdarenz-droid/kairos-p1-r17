/**
 * U1: the app's one client for the Kairos server (backend/kairos-api). Transport and strict decoding only: which route
 * to ask and what an answer means for the trader belong to application owners. GET only, no credentials, no redirects,
 * a 20-second limit, and the server's cache-control decides freshness (cache: 'default'). The address comes from the
 * build setting VITE_KAIROS_API_URL; without a valid one every call answers 'not-set-up' and never uses the network.
 */
import type { StoredActivationReceiptLoadResult } from '../activation/ActivationReceiptRepository';
import type { ActivationReceipt } from '../activation/activationTypes';

/** A request still running after this long is given up and reads as 'transport-failed'. */
export const KAIROS_API_REQUEST_TIMEOUT_MS = 20_000;
export const KAIROS_API_DEVICE_HEADER = 'x-kairos-device';

export type KairosApiFailure =
  | Readonly<{ ok: false; reason: 'not-set-up' }>
  | Readonly<{ ok: false; reason: 'transport-failed' }>
  | Readonly<{ ok: false; reason: 'invalid-response'; status: number }>
  | Readonly<{ ok: false; reason: 'unavailable'; serverReason: string; retryAfterSeconds: number | null; status: number }>;
export type KairosApiResult<T> = Readonly<{ ok: true; value: T }> | KairosApiFailure;
export type KairosApiQuery = Readonly<Record<string, string>>;

export interface KairosApiClient {
  /** false when this build has no valid server address. */
  readonly setUp: boolean;
  request<T>(path: string, query: KairosApiQuery, decode: (data: unknown) => T | null, options?: { readonly signal?: AbortSignal }): Promise<KairosApiResult<T>>;
}

export interface KairosApiClientOptions {
  readonly baseUrl: string | null;
  /** This device's activation receipt, read at each request; null sends no device header. */
  readonly readReceipt?: () => Promise<ActivationReceipt | null>;
  readonly fetchImpl?: typeof fetch;
}

/** The server's origin from the build setting, or null when it is missing or not a bare https origin. */
export function parseKairosApiBaseUrl(raw: string | undefined): string | null {
  const candidate = raw?.trim() ?? '';
  if (candidate === '') return null;
  let url: URL;
  try { url = new URL(candidate); } catch { return null; }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== '/') return null;
  return url.origin;
}

/** v1.<base64url of the receipt's signed payload>.<its signature>; the server checks the signature. Null when unusable. */
export function kairosDeviceToken(receipt: ActivationReceipt): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(receipt.verifierSignature) || receipt.verifierPayload === '') return null;
  let binary = '';
  for (const byte of new TextEncoder().encode(receipt.verifierPayload)) binary += String.fromCharCode(byte);
  const token = `v1.${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${receipt.verifierSignature}`;
  return token.length <= 1024 ? token : null;
}

/** Reads the receipt stored on this device (ActivationReceiptRepository.load); a missing or damaged one reads as null. */
export function storedReceiptReader(repository: { load(): Promise<StoredActivationReceiptLoadResult> }): () => Promise<ActivationReceipt | null> {
  return async () => {
    const stored = await repository.load();
    return stored.status === 'stored' ? stored.receipt : null;
  };
}

const PATH = /^\/[a-z0-9-]+(?:\/[a-z0-9-]+)*$/;
const NOT_SET_UP = Object.freeze({ ok: false as const, reason: 'not-set-up' as const });
const TRANSPORT_FAILED = Object.freeze({ ok: false as const, reason: 'transport-failed' as const });
const invalid = (status: number) => Object.freeze({ ok: false as const, reason: 'invalid-response' as const, status });
/** The device token from the stored receipt; a missing, damaged or unreadable receipt reads as null. */
async function readDeviceToken(readReceipt: (() => Promise<ActivationReceipt | null>) | undefined): Promise<string | null> {
  try {
    const receipt = readReceipt ? await readReceipt() : null;
    return receipt ? kairosDeviceToken(receipt) : null;
  } catch { return null; }
}
/** Settles (with null) once the signal aborts; the request then answers 'transport-failed' without the network. */
function untilAborted(signal: AbortSignal): Promise<null> {
  return new Promise((resolve) => {
    if (signal.aborted) resolve(null);
    else signal.addEventListener('abort', () => resolve(null), { once: true });
  });
}
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

export function createKairosApiClient({ baseUrl, readReceipt, fetchImpl = globalThis.fetch.bind(globalThis) }: KairosApiClientOptions): KairosApiClient {
  return Object.freeze({
    setUp: baseUrl !== null,
    async request<T>(path: string, query: KairosApiQuery, decode: (data: unknown) => T | null, options?: { readonly signal?: AbortSignal }): Promise<KairosApiResult<T>> {
      if (baseUrl === null) return NOT_SET_UP;
      if (!PATH.test(path)) throw new TypeError(`Not a Kairos server path: ${path}`);
      const search = new URLSearchParams(Object.entries(query).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))).toString();
      // The time limit and the caller's signal abort one controller (ecbReferenceRates.ts:55-60), set up before the
      // receipt is read, so a stuck device read still ends in time and the caller can still stop it.
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), KAIROS_API_REQUEST_TIMEOUT_MS);
      const onAbort = () => controller.abort();
      options?.signal?.addEventListener('abort', onAbort, { once: true });
      if (options?.signal?.aborted) controller.abort();
      try {
        const token = await Promise.race([readDeviceToken(readReceipt), untilAborted(controller.signal)]);
        if (controller.signal.aborted) return TRANSPORT_FAILED;
        const headers: Record<string, string> = { accept: 'application/json' };
        if (token !== null) headers[KAIROS_API_DEVICE_HEADER] = token;
        let response: Response;
        try {
          response = await fetchImpl(`${baseUrl}${path}${search === '' ? '' : `?${search}`}`, { method: 'GET', headers, signal: controller.signal, credentials: 'omit', redirect: 'error', cache: 'default' });
        } catch {
          return TRANSPORT_FAILED;
        }
        const status = response.status;
        if (!/^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '')) return invalid(status);
        let text: string;
        try { text = await response.text(); } catch { return TRANSPORT_FAILED; }
        let body: unknown;
        try { body = JSON.parse(text); } catch { return invalid(status); }
        if (!isRecord(body) || body.apiVersion !== 1 || typeof body.ok !== 'boolean') return invalid(status);
        if (body.ok) {
          if (status !== 200 || !('data' in body)) return invalid(status);
          const value = decode(body.data);
          return value === null ? invalid(status) : Object.freeze({ ok: true as const, value });
        }
        const retryAfter = body.retryAfter;
        if (body.error !== 'unavailable' || typeof body.reason !== 'string' || !/^[a-z][a-z-]{0,39}$/.test(body.reason)) return invalid(status);
        if (retryAfter !== null && !(typeof retryAfter === 'number' && Number.isInteger(retryAfter) && retryAfter >= 1 && retryAfter <= 86_400)) return invalid(status);
        return Object.freeze({ ok: false as const, reason: 'unavailable' as const, serverReason: body.reason, retryAfterSeconds: retryAfter, status });
      } finally {
        globalThis.clearTimeout(timeoutId);
        options?.signal?.removeEventListener('abort', onAbort);
      }
    },
  });
}

export type KairosApiDeviceCheck = 'recognised' | 'not-sent' | 'not-recognised' | 'not-checked';
export type KairosApiReadiness = 'ready' | 'missing';

export interface KairosApiHealth {
  readonly serverTime: string;
  readonly device: KairosApiDeviceCheck;
  readonly checks: Readonly<{ deviceKey: KairosApiReadiness; cache: KairosApiReadiness; limits: KairosApiReadiness }>;
}

const DEVICE_CHECKS: readonly KairosApiDeviceCheck[] = ['recognised', 'not-sent', 'not-recognised', 'not-checked'];
const isReadiness = (value: unknown): value is KairosApiReadiness => value === 'ready' || value === 'missing';

/** The /health answer's data, or null when any part is missing or not one of the known values. */
export function decodeKairosApiHealth(data: unknown): KairosApiHealth | null {
  if (!isRecord(data) || data.service !== 'kairos-api') return null;
  const { serverTime, device, checks } = data;
  if (typeof serverTime !== 'string' || Number.isNaN(Date.parse(serverTime)) || new Date(Date.parse(serverTime)).toISOString() !== serverTime) return null;
  if (typeof device !== 'string' || !DEVICE_CHECKS.includes(device as KairosApiDeviceCheck)) return null;
  if (!isRecord(checks) || !isReadiness(checks.deviceKey) || !isReadiness(checks.cache) || !isReadiness(checks.limits)) return null;
  return Object.freeze({
    serverTime,
    device: device as KairosApiDeviceCheck,
    checks: Object.freeze({ deviceKey: checks.deviceKey, cache: checks.cache, limits: checks.limits }),
  });
}

export interface KairosApiHealthPort {
  readonly setUp: boolean;
  checkHealth(options?: { readonly signal?: AbortSignal }): Promise<KairosApiResult<KairosApiHealth>>;
}

export function createKairosApiHealthPort(client: KairosApiClient): KairosApiHealthPort {
  return Object.freeze({
    setUp: client.setUp,
    checkHealth: (options?: { readonly signal?: AbortSignal }) => client.request('/health', {}, decodeKairosApiHealth, options),
  });
}
