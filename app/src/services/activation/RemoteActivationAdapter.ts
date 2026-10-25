import type { ActivationAdapter, ActivationDevicesAdapter } from './ActivationAdapter';
import type {
  ActivationDevice,
  ActivationDeviceCheckResult,
  ActivationDeviceFailure,
  ActivationDeviceList,
  ActivationDeviceListResult,
  ActivationDeviceRemoveResult,
  ActivationDeviceStatus,
  ActivationReceipt,
  ActivationRequest,
  ActivationValidationResult,
} from './activationTypes';
import { DEVICE_LABELS, OTHER_DEVICE } from './describeThisDevice';

export interface RemoteActivationAdapterOptions {
  readonly endpoint: string;
  readonly timeoutMs?: number;
  readonly fetchImpl?: typeof fetch;
}

const DEFAULT_ACTIVATION_TIMEOUT_MS = 10_000;
const MAX_ACTIVATION_TIMEOUT_MS = 60_000;
const SERVER_REJECTION_REASONS = new Set([
  'invalid-code',
  'expired-code',
  'already-used',
  'rate-limited',
] as const);
/** A code allows 1 to 10 devices (D274); any other value is not a number Kairos can show. */
const MIN_DEVICE_LIMIT = 1;
const MAX_DEVICE_LIMIT = 10;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && new Date(parsed).toISOString() === value;
}

function parseReceipt(value: unknown): ActivationReceipt | null {
  if (!isRecord(value)
    || value.receiptVersion !== 1
    || typeof value.activationId !== 'string'
    || value.activationId.length === 0
    || !isIsoTimestamp(value.issuedAt)
    || typeof value.verifierPayload !== 'string'
    || value.verifierPayload.length === 0
    || typeof value.verifierSignature !== 'string'
    || value.verifierSignature.length === 0) {
    return null;
  }

  return {
    receiptVersion: 1,
    activationId: value.activationId,
    issuedAt: value.issuedAt,
    verifierPayload: value.verifierPayload,
    verifierSignature: value.verifierSignature,
  };
}

function parseServerResult(value: unknown): ActivationValidationResult | null {
  if (!isRecord(value) || typeof value.ok !== 'boolean') return null;

  if (value.ok) {
    const receipt = parseReceipt(value.receipt);
    return receipt ? { ok: true, receipt } : null;
  }

  if (typeof value.reason !== 'string' || !SERVER_REJECTION_REASONS.has(value.reason as never)) {
    return null;
  }
  if (value.reason === 'already-used') {
    // D275: "all devices used" names the code's limit. A limit Kairos can't read is left out, never guessed.
    const deviceLimit = readDeviceLimit(value.deviceLimit);
    return deviceLimit === null ? { ok: false, reason: 'already-used' } : { ok: false, reason: 'already-used', deviceLimit };
  }
  return { ok: false, reason: value.reason as 'invalid-code' | 'expired-code' | 'rate-limited' };
}

function readDeviceLimit(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) && value >= MIN_DEVICE_LIMIT && value <= MAX_DEVICE_LIMIT ? value : null;
}

function assertHttpsEndpoint(endpoint: string): string {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error('Activation endpoint must be a valid HTTPS URL.');
  }
  if (parsed.protocol !== 'https:') {
    throw new Error('Activation endpoint must use HTTPS.');
  }
  return parsed.toString();
}

function resolveTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_ACTIVATION_TIMEOUT_MS;
  if (!Number.isInteger(value) || value <= 0 || value > MAX_ACTIVATION_TIMEOUT_MS) {
    throw new Error(`Activation timeout must be an integer from 1 to ${MAX_ACTIVATION_TIMEOUT_MS} milliseconds.`);
  }
  return value;
}

function combineSignals(external: AbortSignal | undefined, timeoutMs: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  external?.addEventListener('abort', onAbort, { once: true });
  if (external?.aborted) controller.abort();

  return {
    signal: controller.signal,
    cleanup: () => {
      globalThis.clearTimeout(timeoutId);
      external?.removeEventListener('abort', onAbort);
    },
  };
}

/** The fetch options every route uses: JSON in and out, never cached, no cookies, no redirects. */
function postInit(body: Record<string, unknown>, signal: AbortSignal): RequestInit {
  return {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    signal,
  };
}

/**
 * The device routes' refusals (activation Worker README, "Device routes"), each with the one HTTP status it comes with.
 * A refusal with another status, or one its route never gives, is an answer Kairos can't read.
 */
const DEVICE_REFUSAL_STATUS: Readonly<Record<string, number>> = Object.freeze({
  'device-not-recognised': 401,
  'device-removed': 403,
  'code-revoked': 403,
  'device-not-found': 404,
  'cannot-remove-this-device': 400,
});
const LIST_REFUSALS: ReadonlySet<string> = new Set(['device-not-recognised', 'device-removed', 'code-revoked']);
const REMOVE_REFUSALS: ReadonlySet<string> = new Set([...LIST_REFUSALS, 'device-not-found', 'cannot-remove-this-device']);
const CHECK_REFUSALS: ReadonlySet<string> = new Set(['device-not-recognised']);
const DEVICE_STATUSES: ReadonlySet<string> = new Set<ActivationDeviceStatus>(['active', 'removed', 'revoked']);
const KNOWN_LABELS: ReadonlySet<string> = new Set(DEVICE_LABELS);
/**
 * A device name as plausible text: 1 to 128 characters with no control character (the Worker itself accepts only names
 * on its fixed list, isDeviceLabel in deviceLabels.mjs). A name off this build's copy of the list (one the Worker added
 * later) shows as "Other device", so an older build keeps the list and Remove; it never shows text Kairos doesn't know.
 */
const LABEL_TEXT = /^[^\p{Cc}]{1,128}$/u;

/** What a device route answered: its HTTP status and JSON body, or nothing (no connection, a time-out, a refused redirect). */
type DeviceAnswer = Readonly<{ reached: true; status: number; json: boolean; payload: unknown }> | Readonly<{ reached: false }>;

/**
 * Why a device route gave nothing usable: too many calls and server trouble by their HTTP status (as /activate), else the
 * route's own refusal when its body and status agree, else an answer Kairos can't read ('service-error').
 */
function deviceFailure<R extends string>(answer: Extract<DeviceAnswer, { reached: true }>, refusals: ReadonlySet<string>): R | 'rate-limited' | 'service-error' {
  if (answer.status === 429) return 'rate-limited';
  if (answer.status >= 500) return 'service-error';
  const { payload } = answer;
  if (answer.json && isRecord(payload) && payload.ok === false && typeof payload.reason === 'string'
    && refusals.has(payload.reason) && DEVICE_REFUSAL_STATUS[payload.reason] === answer.status) {
    return payload.reason as R;
  }
  return 'service-error';
}

/** A body that says ok, with a 200 and JSON; anything else is never read as success. */
function okBody(answer: DeviceAnswer): Record<string, unknown> | null {
  if (!answer.reached || answer.status !== 200 || !answer.json || !isRecord(answer.payload) || answer.payload.ok !== true) return null;
  return answer.payload;
}

/** A calendar day as YYYY-MM-DD that really exists (2026-02-30 does not). */
function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && isIsoTimestamp(`${value}T00:00:00.000Z`);
}

function parseDevice(value: unknown): ActivationDevice | null {
  if (!isRecord(value)) return null;
  const { id, label, since, lastSeenOn, thisDevice } = value;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0) return null;
  if (typeof label !== 'string' || !LABEL_TEXT.test(label)) return null;
  if (!isIsoTimestamp(since) || (lastSeenOn !== null && !isDay(lastSeenOn)) || typeof thisDevice !== 'boolean') return null;
  return Object.freeze({ id, label: KNOWN_LABELS.has(label) ? label : OTHER_DEVICE, since, lastSeenOn, thisDevice });
}

/**
 * /devices' list, or null when any part is off: a count that isn't the list's length, more than the limit (D274: 1 to
 * 10), a device twice, or not exactly one "this device". A count Kairos can't trust is never shown.
 */
function parseDeviceList(body: Record<string, unknown>): ActivationDeviceList | null {
  const { used, limit, devices } = body;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < MIN_DEVICE_LIMIT || limit > MAX_DEVICE_LIMIT) return null;
  if (typeof used !== 'number' || !Number.isInteger(used) || used < 0 || used > limit) return null;
  if (!Array.isArray(devices) || devices.length !== used) return null;
  const parsed: ActivationDevice[] = [];
  for (const entry of devices) {
    const device = parseDevice(entry);
    if (device === null || parsed.some((other) => other.id === device.id)) return null;
    parsed.push(device);
  }
  if (parsed.filter((device) => device.thisDevice).length !== 1) return null;
  return Object.freeze({ used, limit, devices: Object.freeze(parsed) });
}

/**
 * Network implementation of the P7.1 server-authority boundary.
 * The endpoint is injected by deployment configuration; this module contains
 * no invite authority, reusable validation credential, or production service URL.
 */
export class RemoteActivationAdapter implements ActivationAdapter, ActivationDevicesAdapter {
  private readonly endpoint: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: RemoteActivationAdapterOptions) {
    this.endpoint = assertHttpsEndpoint(options.endpoint);
    this.timeoutMs = resolveTimeout(options.timeoutMs);
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
  }

  async validateInvite(
    request: ActivationRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ActivationValidationResult> {
    const { signal, cleanup } = combineSignals(options?.signal, this.timeoutMs);

    try {
      const response = await this.fetchImpl(this.endpoint, postInit({
        inviteCode: request.inviteCode,
        appVersion: request.appVersion,
        buildId: request.buildId,
        // D275: sent when given; the Worker reads none as an old build.
        ...(request.requestId === undefined ? {} : { requestId: request.requestId }),
        ...(request.deviceLabel === undefined ? {} : { deviceLabel: request.deviceLabel }),
      }, signal));

      if (!response.ok) {
        if (response.status === 429) return { ok: false, reason: 'rate-limited' };
        if (response.status >= 500) return { ok: false, reason: 'service-error' };
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        return { ok: false, reason: 'service-error' };
      }

      const result = parseServerResult(payload);
      return result ?? { ok: false, reason: 'service-error' };
    } catch {
      return { ok: false, reason: 'network-unavailable' };
    } finally {
      cleanup();
    }
  }

  /** POST /devices `{ token }` next to /activate (D277). */
  async listDevices(token: string, options?: { signal?: AbortSignal }): Promise<ActivationDeviceListResult> {
    const answer = await this.postDeviceRoute('devices', { token }, options?.signal);
    if (!answer.reached) return { ok: false, reason: 'network-unavailable' };
    const body = okBody(answer);
    if (body === null) return { ok: false, reason: deviceFailure<ActivationDeviceFailure>(answer, LIST_REFUSALS) };
    const list = parseDeviceList(body);
    return list === null ? { ok: false, reason: 'service-error' } : { ok: true, list };
  }

  /** POST /devices/remove `{ token, deviceId }`: another device of the same code, never this one (the Worker refuses it). */
  async removeDevice(token: string, deviceId: number, options?: { signal?: AbortSignal }): Promise<ActivationDeviceRemoveResult> {
    if (!Number.isSafeInteger(deviceId) || deviceId <= 0) throw new RangeError('A device is named by its row number, a whole number above 0.');
    const answer = await this.postDeviceRoute('devices/remove', { token, deviceId }, options?.signal);
    if (!answer.reached) return { ok: false, reason: 'network-unavailable' };
    if (okBody(answer) !== null) return { ok: true };
    return { ok: false, reason: deviceFailure<ActivationDeviceFailure | 'device-not-found' | 'cannot-remove-this-device'>(answer, REMOVE_REFUSALS) };
  }

  /** POST /devices/check `{ token }` (D278): only a 200 that names one of the three states says anything. */
  async checkDevice(token: string, options?: { signal?: AbortSignal }): Promise<ActivationDeviceCheckResult> {
    const answer = await this.postDeviceRoute('devices/check', { token }, options?.signal);
    if (!answer.reached) return { ok: false, reason: 'network-unavailable' };
    const body = okBody(answer);
    if (body === null) return { ok: false, reason: deviceFailure<'device-not-recognised'>(answer, CHECK_REFUSALS) };
    return typeof body.status === 'string' && DEVICE_STATUSES.has(body.status)
      ? { ok: true, status: body.status as ActivationDeviceStatus }
      : { ok: false, reason: 'service-error' };
  }

  /** The device routes sit next to /activate: `new URL('devices', endpoint)`, with /activate's fetch options and time limit. */
  private async postDeviceRoute(route: 'devices' | 'devices/remove' | 'devices/check', body: Record<string, unknown>, external: AbortSignal | undefined): Promise<DeviceAnswer> {
    const { signal, cleanup } = combineSignals(external, this.timeoutMs);
    try {
      let response: Response;
      try {
        response = await this.fetchImpl(new URL(route, this.endpoint).toString(), postInit(body, signal));
      } catch {
        return { reached: false };
      }
      const json = /^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '');
      let payload: unknown;
      try {
        payload = json ? await response.json() : undefined;
      } catch {
        // A body cut off by the time limit is no answer; one that isn't JSON is an answer Kairos can't read.
        if (signal.aborted) return { reached: false };
        return { reached: true, status: response.status, json: false, payload: undefined };
      }
      return { reached: true, status: response.status, json, payload };
    } finally {
      cleanup();
    }
  }
}
