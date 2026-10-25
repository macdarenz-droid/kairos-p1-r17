/** Test support: invite codes in the test D1, requests the way the app sends them, and the app's receipt rules. */
import { applyD1Migrations } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { expect } from 'vitest';
import type { ActivationEnv } from '../src/env';
import worker from '../src/index';

export const APP = 'https://kairos-p1-r17.pages.dev';
export const BASE = 'https://kairos-activation.example.workers.dev';

export function applyMigrations(): Promise<void> {
  return applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** A code no other test uses, as the owner would store it (upper case). */
export function newCode(): string {
  return `T62A-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
}

/** Stores a code the way the owner does today: only the SHA-256 of its text. */
export async function addCode(code: string, row: { status?: 'unused' | 'revoked'; expiresAt?: string | null } = {}): Promise<void> {
  await env.DB.prepare('INSERT INTO activation_codes (code_hash, status, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(code), row.status ?? 'unused', '2026-10-01T00:00:00.000Z', row.expiresAt ?? null)
    .run();
}

export interface CodeRow {
  readonly status: string;
  readonly used_at: string | null;
  readonly activation_id: string | null;
  readonly app_version: string | null;
  readonly build_id: string | null;
}

export async function codeRow(code: string): Promise<CodeRow | null> {
  return env.DB.prepare('SELECT status, used_at, activation_id, app_version, build_id FROM activation_codes WHERE code_hash = ?')
    .bind(await sha256Hex(code))
    .first<CodeRow>();
}

export const UNUSED: CodeRow = { status: 'unused', used_at: null, activation_id: null, app_version: null, build_id: null };

let address = 0;

/** A fresh network address for each request, so one test's tries never count against another's limit. */
export function nextAddress(): string {
  address += 1;
  return `2001:db8:62a::${address.toString(16)}`;
}

export interface Call {
  readonly method?: string;
  readonly path?: string;
  /** null: no Origin header (curl, a server). */
  readonly origin?: string | null;
  readonly contentType?: string | null;
  readonly body?: string | null;
  readonly address?: string | null;
}

export function request(options: Call = {}): Request {
  const headers = new Headers();
  const origin = options.origin === undefined ? APP : options.origin;
  if (origin !== null) headers.set('origin', origin);
  const contentType = options.contentType === undefined ? 'application/json' : options.contentType;
  if (contentType !== null) headers.set('content-type', contentType);
  const address = options.address === undefined ? nextAddress() : options.address;
  if (address !== null) headers.set('cf-connecting-ip', address);
  const method = options.method ?? 'POST';
  return new Request(`${BASE}${options.path ?? '/activate'}`, { method, headers, body: method === 'GET' || method === 'OPTIONS' ? null : options.body ?? null });
}

/** The body the app posts (RemoteActivationAdapter.ts:138-142). */
export function activationBody(inviteCode: string, extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ inviteCode, appVersion: '1.2.3', buildId: 'build-62a', ...extra });
}

/** Through the deployed entry (wrangler.jsonc's main) with the configured bindings. */
export function send(options: Call = {}): Promise<Response> {
  return exports.default.fetch(request(options));
}

export function activate(code: string, options: Call = {}): Promise<Response> {
  return send({ body: activationBody(code), ...options });
}

/** Straight into the Worker's fetch, with some bindings changed (a missing key, a spy limiter, another origin list). */
export function sendWith(bindings: Partial<ActivationEnv>, options: Call = {}): Promise<Response> {
  return worker.fetch(request(options) as Request<unknown, IncomingRequestCfProperties>, { ...env, ...bindings });
}

function base64UrlBytes(value: string): Uint8Array {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(standard + '='.repeat((4 - (standard.length % 4)) % 4)), (char) => char.charCodeAt(0));
}

function isIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value;
}

/** The app's rules for a signed payload and its receipt (EcdsaActivationReceiptVerifier.ts:33-58 and :89-93). */
function appAcceptsPayload(payloadText: string, receipt: Record<string, unknown>): boolean {
  let parsed: unknown;
  try { parsed = JSON.parse(payloadText); } catch { return false; }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return false;
  const payload = parsed as Record<string, unknown>;
  return payload.proofVersion === 1 && payload.purpose === 'kairos-activation' && payload.receiptVersion === 1
    && typeof payload.activationId === 'string' && payload.activationId.length > 0 && isIsoTimestamp(payload.issuedAt)
    && payload.receiptVersion === receipt.receiptVersion && payload.activationId === receipt.activationId && payload.issuedAt === receipt.issuedAt;
}

async function verifies(payloadText: string, signature: Uint8Array): Promise<boolean> {
  const spki = Uint8Array.from(atob(env.TEST_ACTIVATION_PUBLIC_KEY_SPKI), (char) => char.charCodeAt(0));
  const key = await crypto.subtle.importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, signature, new TextEncoder().encode(payloadText));
}

export interface Receipt {
  readonly receiptVersion: 1;
  readonly activationId: string;
  readonly issuedAt: string;
  readonly verifierPayload: string;
  readonly verifierSignature: string;
}

/** A receipt the app saves: today's fields and key order, the app's payload rules, and an ECDSA P-256 SHA-256 signature (64 bytes, base64url). */
export async function expectReceiptTheAppAccepts(value: unknown): Promise<Receipt> {
  const receipt = value as Receipt;
  expect(Object.keys(receipt)).toEqual(['receiptVersion', 'activationId', 'issuedAt', 'verifierPayload', 'verifierSignature']);
  expect(receipt.receiptVersion).toBe(1);
  expect(receipt.activationId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(isIsoTimestamp(receipt.issuedAt)).toBe(true);
  expect(Object.keys(JSON.parse(receipt.verifierPayload))).toEqual(['proofVersion', 'purpose', 'receiptVersion', 'activationId', 'issuedAt']);
  expect(appAcceptsPayload(receipt.verifierPayload, receipt as unknown as Record<string, unknown>)).toBe(true);
  expect(receipt.verifierSignature).toMatch(/^[A-Za-z0-9_-]+$/);
  const signature = base64UrlBytes(receipt.verifierSignature);
  expect(signature.byteLength).toBe(64);
  expect(await verifies(receipt.verifierPayload, signature)).toBe(true);
  expect(await verifies(receipt.verifierPayload.replace('kairos-activation', 'kairos-activatioN'), signature)).toBe(false);
  return receipt;
}
