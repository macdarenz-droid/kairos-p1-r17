/**
 * POST /activate: one invite code becomes one signed receipt. D1 decides: one conditional UPDATE moves the code from
 * unused to used. The receipt is signed before that UPDATE, so a signing failure never uses a code up. A code is stored
 * and looked up only as the SHA-256 of its trimmed, upper-case text. Nothing here logs a code, a hash or an address.
 */
import type { ActivationEnv } from './env';
import { json, type Caller } from './http';
import { createSignedReceipt } from './receipt';

const encoder = new TextEncoder();

/** The body every app build posts (RemoteActivationAdapter.ts). */
interface ActivationRequest {
  readonly inviteCode: string;
  readonly appVersion: string;
  readonly buildId: string;
}

type Rejection = 'invalid-code' | 'already-used' | 'expired-code' | 'service-error';

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function isActivationRequest(body: unknown): body is ActivationRequest {
  if (body === null || typeof body !== 'object') return false;
  const record = body as Record<string, unknown>;
  return typeof record.inviteCode === 'string' && record.inviteCode.trim().length > 0
    && typeof record.appVersion === 'string' && record.appVersion.trim().length > 0
    && typeof record.buildId === 'string' && record.buildId.trim().length > 0;
}

async function activationRateLimitKey(request: Request): Promise<string> {
  // Activation happens before Kairos has an authenticated user identity. A one-way hash keeps the network identifier
  // out of the limiter key, and one key per address (not one global key) stops one actor from throttling every
  // activation worldwide.
  const connectingIp = request.headers.get('cf-connecting-ip')?.trim();
  const actor = connectingIp !== undefined && connectingIp.length > 0 ? connectingIp : 'unidentified-client';
  return `activation:${await sha256Hex(actor)}`;
}

/** Why the UPDATE changed no row. A revoked code reads the same as an unknown one. */
async function classifyRejection(db: D1Database, codeHash: string, now: string): Promise<Rejection> {
  const row = await db.prepare('SELECT status, expires_at FROM activation_codes WHERE code_hash = ? LIMIT 1')
    .bind(codeHash)
    .first<{ status: string; expires_at: string | null }>();
  if (row === null) return 'invalid-code';
  if (row.status === 'used') return 'already-used';
  if (row.status === 'revoked') return 'invalid-code';
  if (typeof row.expires_at === 'string' && row.expires_at.length > 0 && row.expires_at <= now) return 'expired-code';
  // Unused and not expired, yet the UPDATE changed nothing: no reason can be told, so none is guessed.
  return 'service-error';
}

/** After the origin, path and method checks (index.ts). Throws only on a bug or a D1 failure; the entry answers 500. */
export async function handleActivate(request: Request, env: ActivationEnv, caller: Caller): Promise<Response> {
  // Abuse protection only. D1 stays the authority for one-time use; the limiter is never used for counting.
  const limited = await env.ACTIVATION_RATE_LIMITER.limit({ key: await activationRateLimitKey(request) });
  if (!limited.success) return json(caller, { ok: false, reason: 'rate-limited' }, 429);

  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().includes('application/json')) return json(caller, { ok: false, reason: 'service-error' }, 415);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(caller, { ok: false, reason: 'invalid-code' }, 400);
  }
  if (!isActivationRequest(body)) return json(caller, { ok: false, reason: 'invalid-code' }, 400);

  const codeHash = await sha256Hex(body.inviteCode.trim().toUpperCase());
  const activationId = crypto.randomUUID();
  const issuedAt = new Date().toISOString();

  // Sign before using the code up. If signing fails, the code stays unused and the app gets no receipt.
  const receipt = await createSignedReceipt(env.KAIROS_ACTIVATION_PRIVATE_KEY, activationId, issuedAt);

  const result = await env.DB.prepare(`
      UPDATE activation_codes
      SET status = 'used', used_at = ?, activation_id = ?, app_version = ?, build_id = ?
      WHERE code_hash = ? AND status = 'unused' AND (expires_at IS NULL OR expires_at > ?)
    `)
    .bind(issuedAt, activationId, body.appVersion.trim(), body.buildId.trim(), codeHash, issuedAt)
    .run();

  if (result.meta.changes !== 1) {
    const reason = await classifyRejection(env.DB, codeHash, issuedAt);
    return json(caller, { ok: false, reason }, reason === 'service-error' ? 503 : 403);
  }
  return json(caller, { ok: true, receipt });
}
