/**
 * POST /activate: one invite code becomes one signed receipt, for up to `device_limit` devices (D274, D275).
 * A code is looked up by the SHA-256 of its compact form and of its exact text (inviteCode.mjs). The receipt is signed
 * first; then one D1 batch takes a place for the device (devices.ts takePlace), so a signing failure never uses a place.
 * A retry with the same requestId within 24 hours gets its device back, signed again, instead of a new place. Old app builds send no
 * requestId or deviceLabel and keep working; the answer keeps its shape. Nothing here logs a code, a hash or an address.
 */
import { isDeviceLabel, OTHER_DEVICE } from './deviceLabels.mjs';
import { deviceForRequest, devicesInUse, takePlace } from './devices';
import type { ActivationEnv } from './env';
import { hasJsonContentType, isRecord, json, readJson, type ActivationReason, type Caller } from './http';
import { inviteCodeHashes, sha256Hex } from './inviteCode.mjs';
import { createSignedReceipt } from './receipt';

/** The body an app build posts (RemoteActivationAdapter.ts); requestId and deviceLabel come from new builds only. */
interface ActivationRequest {
  readonly inviteCode: string;
  readonly appVersion: string;
  readonly buildId: string;
  readonly requestId: string | null;
  readonly deviceLabel: string;
}

const REQUEST_ID = /^[A-Za-z0-9-]{8,64}$/;
/** Printable ASCII, as every app build's version and build id are. */
const BUILD_TEXT = /^[\x20-\x7E]{1,128}$/;
/** A typed code: up to 128 characters and no control characters, so a hand-made code keeps any letters it has. */
const CODE_TEXT = /^[^\p{Cc}]{1,128}$/u;

type Parsed = Readonly<{ ok: true; request: ActivationRequest }> | Readonly<{ ok: false; reason: 'invalid-code' | 'invalid-request' }>;

function trimmedMatch(value: unknown, pattern: RegExp): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return pattern.test(trimmed) ? trimmed : null;
}

/** Today's fields keep today's 400 `invalid-code`; the new optional fields answer `invalid-request`. */
function readRequest(body: unknown): Parsed {
  if (!isRecord(body)) return { ok: false, reason: 'invalid-code' };
  const inviteCode = trimmedMatch(body.inviteCode, CODE_TEXT);
  const appVersion = trimmedMatch(body.appVersion, BUILD_TEXT);
  const buildId = trimmedMatch(body.buildId, BUILD_TEXT);
  if (inviteCode === null || appVersion === null || buildId === null) return { ok: false, reason: 'invalid-code' };
  // Missing means none; anything else, null included, must match.
  const requestId = body.requestId;
  if (requestId !== undefined && (typeof requestId !== 'string' || !REQUEST_ID.test(requestId))) return { ok: false, reason: 'invalid-request' };
  const deviceLabel = body.deviceLabel === undefined ? OTHER_DEVICE : body.deviceLabel;
  if (!isDeviceLabel(deviceLabel)) return { ok: false, reason: 'invalid-request' };
  return { ok: true, request: { inviteCode, appVersion, buildId, requestId: requestId ?? null, deviceLabel } };
}

async function activationRateLimitKey(request: Request): Promise<string> {
  // Activation happens before Kairos has an authenticated user identity. A one-way hash keeps the network identifier
  // out of the limiter key, and one key per address (not one global key) stops one actor from throttling every
  // activation worldwide.
  const connectingIp = request.headers.get('cf-connecting-ip')?.trim();
  const actor = connectingIp !== undefined && connectingIp.length > 0 ? connectingIp : 'unidentified-client';
  return `activation:${await sha256Hex(actor)}`;
}

interface CodeRow {
  readonly id: number;
  readonly status: string;
  readonly expires_at: string | null;
  readonly revoked_at: string | null;
  readonly device_limit: number;
}

/** The code a person typed, by either hash. Should both match different codes, the exact text wins: it is what was typed. */
async function findCode(db: D1Database, typed: string): Promise<CodeRow | null> {
  const { compact, exact } = await inviteCodeHashes(typed);
  return db.prepare(`
      SELECT id, status, expires_at, revoked_at, device_limit FROM activation_codes
      WHERE code_hash IN (?, ?) ORDER BY code_hash = ? DESC LIMIT 1`)
    .bind(exact, compact ?? exact, exact)
    .first<CodeRow>();
}

/** A revoked code reads the same as an unknown one (D280). An unused code was revoked by status, a used one by revoked_at. */
function isRevoked(code: CodeRow): boolean {
  return code.status === 'revoked' || code.revoked_at !== null;
}

function hasExpired(code: CodeRow, now: string): boolean {
  return code.status === 'unused' && typeof code.expires_at === 'string' && code.expires_at.length > 0 && code.expires_at <= now;
}

/** Why no place was taken, read again after the batch. */
async function whyNoPlace(db: D1Database, codeId: number, now: string): Promise<{ reason: ActivationReason; deviceLimit?: number }> {
  const code = await db.prepare('SELECT id, status, expires_at, revoked_at, device_limit FROM activation_codes WHERE id = ?').bind(codeId).first<CodeRow>();
  if (code === null || isRevoked(code)) return { reason: 'invalid-code' };
  if (hasExpired(code, now)) return { reason: 'expired-code' };
  if (await devicesInUse(db, code.id) >= code.device_limit) return { reason: 'already-used', deviceLimit: code.device_limit };
  // A place was free, yet none was taken: no reason can be told, so none is guessed.
  return { reason: 'service-error' };
}

/** After the origin, path and method checks (index.ts). Throws only on a bug or a D1 failure; the entry answers 500. */
export async function handleActivate(request: Request, env: ActivationEnv, caller: Caller): Promise<Response> {
  // Abuse protection only. D1 stays the authority for places; the limiter is never used for counting.
  const limited = await env.ACTIVATION_RATE_LIMITER.limit({ key: await activationRateLimitKey(request) });
  if (!limited.success) return json(caller, { ok: false, reason: 'rate-limited' }, 429);
  if (!hasJsonContentType(request)) return json(caller, { ok: false, reason: 'service-error' }, 415);
  const parsed = readRequest(await readJson(request));
  if (!parsed.ok) return json(caller, { ok: false, reason: parsed.reason }, 400);
  const body = parsed.request;

  const code = await findCode(env.DB, body.inviteCode);
  if (code === null || isRevoked(code)) return json(caller, { ok: false, reason: 'invalid-code' }, 403);
  const signAgain = async (device: { activationId: string; activatedAt: string }) =>
    json(caller, { ok: true, receipt: await createSignedReceipt(env.KAIROS_ACTIVATION_PRIVATE_KEY, device.activationId, device.activatedAt) });
  const issuedAt = new Date().toISOString();
  if (body.requestId !== null) {
    const known = await deviceForRequest(env.DB, code.id, body.requestId, issuedAt);
    if (known !== null) return signAgain(known);
  }

  const activationId = crypto.randomUUID();
  // Sign before taking a place. If signing fails, no place is used and the app gets no receipt.
  const receipt = await createSignedReceipt(env.KAIROS_ACTIVATION_PRIVATE_KEY, activationId, issuedAt);
  const placed = await takePlace(env.DB, {
    codeId: code.id, activationId, issuedAt, requestId: body.requestId, deviceLabel: body.deviceLabel, appVersion: body.appVersion, buildId: body.buildId,
  });
  if (placed) return json(caller, { ok: true, receipt });

  // The same request at the same moment took the place first: answer with that device.
  if (body.requestId !== null) {
    const known = await deviceForRequest(env.DB, code.id, body.requestId, issuedAt);
    if (known !== null) return signAgain(known);
  }
  const refusal = await whyNoPlace(env.DB, code.id, issuedAt);
  return json(caller, { ok: false, ...refusal }, refusal.reason === 'service-error' ? 503 : 403);
}
