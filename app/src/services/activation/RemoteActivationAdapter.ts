import type { ActivationAdapter } from './ActivationAdapter';
import type {
  ActivationReceipt,
  ActivationRequest,
  ActivationValidationResult,
} from './activationTypes';

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
  return { ok: false, reason: value.reason as 'invalid-code' | 'expired-code' | 'already-used' | 'rate-limited' };
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

/**
 * Network implementation of the P7.1 server-authority boundary.
 * The endpoint is injected by deployment configuration; this module contains
 * no invite authority, reusable validation credential, or production service URL.
 */
export class RemoteActivationAdapter implements ActivationAdapter {
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
      const response = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          inviteCode: request.inviteCode,
          appVersion: request.appVersion,
          buildId: request.buildId,
        }),
        cache: 'no-store',
        credentials: 'omit',
        redirect: 'error',
        signal,
      });

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
}
