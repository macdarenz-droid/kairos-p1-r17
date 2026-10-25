/**
 * The devices of one invite code (D274-D278). "Used on 2 of 3 devices" is counted here, from D1, and nowhere else: a
 * device counts while its row has no `removed_at`. A new device takes a place only through takePlace, one conditional
 * INSERT … SELECT sent in one D1 batch with the code's first-use UPDATE, so two phones at once can't make 4.
 * The device routes (POST /devices, /devices/remove, /devices/check) know a device by its token (receipt.ts), then by its
 * row. Other devices are named only by their row number, never by their activationId. Nothing here logs anything.
 */
import type { ActivationEnv } from './env';
import { hasJsonContentType, isRecord, json, readJson, type Caller, type DeviceStatus, type DeviceView, type Readiness } from './http';
import { readDeviceToken, type DeviceProof } from './receipt';

/** The name stored when an app build sends none, and for the devices that used a code before migration 0002. */
export const OTHER_DEVICE = 'Other device';

/** The coarse names the app may send (D275): a platform and a browser from these lists, or "Other device". No free text. */
const PLATFORMS = ['iPhone', 'iPad', 'Android', 'Mac', 'Windows', 'Linux', 'Chromebook'] as const;
const BROWSERS = ['Safari', 'Chrome', 'Edge', 'Firefox', 'Samsung Internet', 'Opera', 'Other browser'] as const;
const DEVICE_LABELS: ReadonlySet<string> = new Set([...PLATFORMS.flatMap((platform) => BROWSERS.map((browser) => `${platform} · ${browser}`)), OTHER_DEVICE]);

export function isDeviceLabel(value: unknown): value is string {
  return typeof value === 'string' && DEVICE_LABELS.has(value);
}

/** The UTC day of an ISO time, as last_seen_on keeps it (a day, not a time). */
export function dayOf(isoTime: string): string {
  return isoTime.slice(0, 10);
}

/** A device that already has its place, as /activate signs its receipt again. */
export interface PlacedDevice {
  readonly activationId: string;
  readonly activatedAt: string;
}

/** The device in use that a retry with the same request id is asking for (D275), or null. */
export async function deviceForRequest(db: D1Database, codeId: number, requestId: string): Promise<PlacedDevice | null> {
  return db.prepare(`
      SELECT activation_id AS activationId, activated_at AS activatedAt FROM activation_devices
      WHERE code_id = ? AND request_id = ? AND removed_at IS NULL LIMIT 1`)
    .bind(codeId, requestId)
    .first<PlacedDevice>();
}

export interface NewPlace {
  readonly codeId: number;
  /** The new receipt's activationId and issuedAt, already signed. */
  readonly activationId: string;
  readonly issuedAt: string;
  readonly requestId: string | null;
  readonly deviceLabel: string;
  readonly appVersion: string;
  readonly buildId: string;
}

/**
 * Takes one place for a new device, or none. The INSERT adds a row only while fewer than `device_limit` devices are in
 * use, the code is not revoked, and an unused code has not expired (the date limits only the first use). The UPDATE marks
 * a code's first use, and only when that INSERT added this device. D1 runs the batch as one transaction.
 * A clash with a device in use that has the same request id adds nothing (ON CONFLICT DO NOTHING); the caller reads it.
 */
export async function takePlace(db: D1Database, place: NewPlace): Promise<boolean> {
  const [inserted] = await db.batch([
    db.prepare(`
        INSERT INTO activation_devices (activation_id, code_id, request_id, device_label, activated_at, app_version, build_id, last_seen_on)
        SELECT ?, c.id, ?, ?, ?, ?, ?, ?
        FROM activation_codes c
        WHERE c.id = ? AND c.status <> 'revoked' AND c.revoked_at IS NULL
          AND (c.status = 'used' OR c.expires_at IS NULL OR c.expires_at > ?)
          AND (SELECT COUNT(*) FROM activation_devices d WHERE d.code_id = c.id AND d.removed_at IS NULL) < c.device_limit
        ON CONFLICT DO NOTHING`)
      .bind(place.activationId, place.requestId, place.deviceLabel, place.issuedAt, place.appVersion, place.buildId, dayOf(place.issuedAt),
        place.codeId, place.issuedAt),
    db.prepare(`
        UPDATE activation_codes
        SET status = 'used', used_at = ?, activation_id = ?, app_version = ?, build_id = ?
        WHERE id = ? AND status = 'unused' AND EXISTS (SELECT 1 FROM activation_devices WHERE activation_id = ?)`)
      .bind(place.issuedAt, place.activationId, place.appVersion, place.buildId, place.codeId, place.activationId),
  ]);
  return inserted.meta.changes === 1;
}

/** How many of its places a code uses now. */
export async function devicesInUse(db: D1Database, codeId: number): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS used FROM activation_devices WHERE code_id = ? AND removed_at IS NULL').bind(codeId).first<{ used: number }>();
  return row?.used ?? 0;
}

/** For GET /health: whether migration 0002's columns and table are there. Reads no row and never answers a value. */
export async function devicesTableReadiness(db: D1Database): Promise<Readiness> {
  try {
    await db.batch([
      db.prepare('SELECT id, activation_id, code_id, request_id, device_label, activated_at, app_version, build_id, last_seen_on, removed_at, removed_by FROM activation_devices LIMIT 0'),
      db.prepare('SELECT device_limit, label, revoked_at FROM activation_codes LIMIT 0'),
    ]);
    return 'ready';
  } catch {
    return 'missing';
  }
}

/** The device that sent a token, with its code's standing. */
interface ThisDevice {
  readonly id: number;
  readonly codeId: number;
  readonly removed: boolean;
  readonly codeRevoked: boolean;
  readonly deviceLimit: number;
}

async function findThisDevice(db: D1Database, proof: DeviceProof): Promise<ThisDevice | null> {
  const row = await db.prepare(`
      SELECT d.id, d.code_id, d.removed_at, c.status, c.revoked_at, c.device_limit
      FROM activation_devices d JOIN activation_codes c ON c.id = d.code_id
      WHERE d.activation_id = ? AND d.activated_at = ? LIMIT 1`)
    .bind(proof.activationId, proof.issuedAt)
    .first<{ id: number; code_id: number; removed_at: string | null; status: string; revoked_at: string | null; device_limit: number }>();
  if (row === null) return null;
  return { id: row.id, codeId: row.code_id, removed: row.removed_at !== null, codeRevoked: row.status === 'revoked' || row.revoked_at !== null, deviceLimit: row.device_limit };
}

/** A revoked code comes first: typing it again can't help. */
function statusOf(device: ThisDevice): DeviceStatus {
  if (device.codeRevoked) return 'revoked';
  return device.removed ? 'removed' : 'active';
}

function isRowId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

async function listDevices(db: D1Database, me: ThisDevice, caller: Caller): Promise<Response> {
  const { results } = await db.prepare(`
      SELECT id, device_label, activated_at, last_seen_on FROM activation_devices
      WHERE code_id = ? AND removed_at IS NULL ORDER BY activated_at, id`)
    .bind(me.codeId)
    .all<{ id: number; device_label: string; activated_at: string; last_seen_on: string | null }>();
  const devices: DeviceView[] = results.map((row) => ({
    id: row.id, label: row.device_label, since: row.activated_at, lastSeenOn: row.last_seen_on, thisDevice: row.id === me.id,
  }));
  return json(caller, { ok: true, used: devices.length, limit: me.deviceLimit, devices });
}

async function removeDevice(db: D1Database, me: ThisDevice, deviceId: number, proof: DeviceProof, caller: Caller): Promise<Response> {
  // One statement, so a device removed or a code revoked a moment ago can't remove anyone.
  const result = await db.prepare(`
      UPDATE activation_devices SET removed_at = ?, removed_by = 'trader'
      WHERE id = ? AND code_id = ? AND removed_at IS NULL
        AND EXISTS (SELECT 1 FROM activation_devices me WHERE me.id = ? AND me.removed_at IS NULL)
        AND EXISTS (SELECT 1 FROM activation_codes c WHERE c.id = ? AND c.status <> 'revoked' AND c.revoked_at IS NULL)`)
    .bind(new Date().toISOString(), deviceId, me.codeId, me.id, me.codeId)
    .run();
  if (result.meta.changes === 1) return json(caller, { ok: true });

  const now = await findThisDevice(db, proof);
  if (now === null) return json(caller, { ok: false, reason: 'device-not-recognised' }, 401);
  const status = statusOf(now);
  if (status !== 'active') return json(caller, { ok: false, reason: status === 'revoked' ? 'code-revoked' : 'device-removed' }, 403);
  const target = await db.prepare('SELECT removed_at FROM activation_devices WHERE id = ? AND code_id = ?')
    .bind(deviceId, me.codeId)
    .first<{ removed_at: string | null }>();
  if (target === null) return json(caller, { ok: false, reason: 'device-not-found' }, 404);
  // Removed already (asked twice, or by the owner): the device is out either way.
  if (target.removed_at !== null) return json(caller, { ok: true });
  return json(caller, { ok: false, reason: 'service-error' }, 503);
}

async function checkDevice(db: D1Database, me: ThisDevice, caller: Caller): Promise<Response> {
  const status = statusOf(me);
  if (status === 'active') {
    // At most one write a day: the row changes only when the day does.
    const today = dayOf(new Date().toISOString());
    await db.prepare('UPDATE activation_devices SET last_seen_on = ? WHERE id = ? AND removed_at IS NULL AND (last_seen_on IS NULL OR last_seen_on <> ?)')
      .bind(today, me.id, today)
      .run();
  }
  return json(caller, { ok: true, status });
}

export type DeviceRoute = 'list' | 'remove' | 'check';

/**
 * POST /devices `{ token }`, /devices/remove `{ token, deviceId }` and /devices/check `{ token }`, after the origin, path
 * and method checks (index.ts). The limit is 10 calls a minute per device (`device:<activationId>`), counted once the
 * token's signature holds. Throws only on a bug, a D1 failure or a missing signing key; the entry answers 500.
 */
export async function handleDeviceRoute(route: DeviceRoute, request: Request, env: ActivationEnv, caller: Caller): Promise<Response> {
  if (!hasJsonContentType(request)) return json(caller, { ok: false, reason: 'service-error' }, 415);
  const body = await readJson(request);
  if (!isRecord(body)) return json(caller, { ok: false, reason: 'invalid-request' }, 400);
  const deviceId = body.deviceId;
  if (route === 'remove' && !isRowId(deviceId)) return json(caller, { ok: false, reason: 'invalid-request' }, 400);

  const proof = await readDeviceToken(body.token, env.KAIROS_ACTIVATION_PRIVATE_KEY);
  if (proof === null) return json(caller, { ok: false, reason: 'device-not-recognised' }, 401);
  const limited = await env.ACTIVATION_RATE_LIMITER.limit({ key: `device:${proof.activationId}` });
  if (!limited.success) return json(caller, { ok: false, reason: 'rate-limited' }, 429);
  const me = await findThisDevice(env.DB, proof);
  if (me === null) return json(caller, { ok: false, reason: 'device-not-recognised' }, 401);

  if (route === 'check') return checkDevice(env.DB, me, caller);
  if (route === 'remove' && deviceId === me.id) return json(caller, { ok: false, reason: 'cannot-remove-this-device' }, 400);
  const status = statusOf(me);
  if (status !== 'active') return json(caller, { ok: false, reason: status === 'revoked' ? 'code-revoked' : 'device-removed' }, 403);
  return route === 'list' ? listDevices(env.DB, me, caller) : removeDevice(env.DB, me, deviceId as number, proof, caller);
}
