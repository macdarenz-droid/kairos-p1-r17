import { applyD1Migrations } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { activate, activateDevice, callDevices, send, sha256Hex, signedToken } from './support';

const FIRST = '0001_activation_codes.sql';

/** A code row as the old Worker (worker.js, then T-062a's src/) left it in production. */
interface OldRow {
  readonly code: string;
  readonly status: 'unused' | 'used' | 'revoked';
  readonly expiresAt?: string;
  readonly usedAt?: string;
  readonly activationId?: string;
}

const OLD_ROWS: readonly OldRow[] = [
  { code: 'MIGRATE-UNUSED', status: 'unused' },
  { code: 'MIGRATE-USED', status: 'used', usedAt: '2026-09-02T10:00:00.000Z', activationId: 'b5f8d0b2-6d5e-4f43-9a51-1f3f3b0c6a01' },
  { code: 'MIGRATE-USED-EXPIRED', status: 'used', expiresAt: '2026-09-30T00:00:00.000Z', usedAt: '2026-09-03T11:00:00.000Z', activationId: 'c6a9e1c3-7e6f-4054-8b62-2a4a4c1d7b12' },
  { code: 'MIGRATE-REVOKED', status: 'revoked' },
  { code: 'MIGRATE-EXPIRED', status: 'unused', expiresAt: '2026-01-01T00:00:00.000Z' },
];

async function addOldRows(db: D1Database): Promise<void> {
  for (const row of OLD_ROWS) {
    await db.prepare('INSERT INTO activation_codes (code_hash, status, created_at, expires_at, used_at, activation_id, app_version, build_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(await sha256Hex(row.code), row.status, '2026-09-01T00:00:00.000Z', row.expiresAt ?? null, row.usedAt ?? null, row.activationId ?? null,
        row.usedAt === undefined ? null : '0.9.0', row.usedAt === undefined ? null : 'build-old')
      .run();
  }
}

async function codes(db: D1Database): Promise<Array<Record<string, unknown>>> {
  return (await db.prepare('SELECT * FROM activation_codes ORDER BY id').all<Record<string, unknown>>()).results;
}

async function devices(db: D1Database): Promise<Array<Record<string, unknown>>> {
  return (await db.prepare('SELECT * FROM activation_devices ORDER BY id').all<Record<string, unknown>>()).results;
}

async function runSql(db: D1Database, statements: readonly string[]): Promise<void> {
  // As `wrangler d1 execute --local` runs a file or command: split into statements, sent as one batch.
  await db.batch(statements.map((statement) => db.prepare(statement)));
}

async function health(): Promise<Record<string, unknown>> {
  return (await send({ path: '/health', method: 'GET', contentType: null, origin: null })).json();
}

/** The old device's token, as the app makes it from the receipt the old Worker gave it. */
function oldDeviceToken(row: OldRow): Promise<string> {
  return signedToken({ proofVersion: 1, purpose: 'kairos-activation', receiptVersion: 1, activationId: row.activationId, issuedAt: row.usedAt });
}

describe('migration 0002 (D276)', () => {
  it('keeps every old code, gives each used code its device as 1 of 3, and sets every limit to 3', async () => {
    const first = env.TEST_MIGRATIONS.filter((migration) => migration.name === FIRST);
    expect(first).toHaveLength(1);
    await applyD1Migrations(env.DB, first);
    await addOldRows(env.DB);
    const before = await codes(env.DB);
    expect(await health()).toMatchObject({ ok: false, database: 'missing' });

    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

    expect(await codes(env.DB)).toEqual(before.map((row) => ({ ...row, device_limit: 3, label: null, revoked_at: null })));
    const used = OLD_ROWS.filter((row) => row.status === 'used');
    expect(await devices(env.DB)).toEqual(used.map((row) => ({
      id: expect.any(Number),
      activation_id: row.activationId,
      code_id: before.find((code) => code.activation_id === row.activationId)?.id,
      request_id: null,
      device_label: 'Other device',
      activated_at: row.usedAt,
      app_version: '0.9.0',
      build_id: 'build-old',
      last_seen_on: null,
      removed_at: null,
      removed_by: null,
    })));
    expect(await health()).toEqual({ ok: true, signingKey: 'ready', database: 'ready' });

    // The device that used the code before keeps working and counts as 1 of 3.
    const token = await oldDeviceToken(used[0]);
    expect(await (await callDevices('/devices/check', { token })).json()).toEqual({ ok: true, status: 'active' });
    expect(await (await callDevices('/devices', { token })).json()).toMatchObject({ used: 1, limit: 3, devices: [{ label: 'Other device', since: used[0].usedAt, lastSeenOn: expect.any(String), thisDevice: true }] });
    // Two more devices fit, even on a used code whose date has passed; a third doesn't.
    for (const row of used) {
      await activateDevice(row.code);
      await activateDevice(row.code);
      expect(await (await activate(row.code)).json()).toEqual({ ok: false, reason: 'already-used', deviceLimit: 3 });
    }
    // The others answer as before.
    expect((await activate('MIGRATE-UNUSED')).status).toBe(200);
    expect(await (await activate('MIGRATE-REVOKED')).json()).toEqual({ ok: false, reason: 'invalid-code' });
    expect(await (await activate('MIGRATE-EXPIRED')).json()).toEqual({ ok: false, reason: 'expired-code' });
  });

  it("CI's deploy SQL marks a hand-made 0001 as applied only when its table exists, and the backfill can run again", async () => {
    const db = env.TEST_HAND_MADE_DB;
    // A database with no activation table: nothing is marked, so wrangler applies 0001 itself.
    await runSql(db, env.TEST_DEPLOY_SQL.mark);
    expect((await db.prepare('SELECT name FROM d1_migrations').all()).results).toEqual([]);

    // Production: 0001's table was made by hand, outside wrangler.
    const [first] = env.TEST_MIGRATIONS.filter((migration) => migration.name === FIRST);
    await runSql(db, first.queries);
    await addOldRows(db);
    await runSql(db, env.TEST_DEPLOY_SQL.mark);
    await runSql(db, env.TEST_DEPLOY_SQL.mark);
    expect((await db.prepare('SELECT name FROM d1_migrations').all()).results).toEqual([{ name: FIRST }]);

    // `wrangler d1 migrations apply` now skips 0001 and applies the rest.
    await applyD1Migrations(db, env.TEST_MIGRATIONS);
    expect((await db.prepare('SELECT name FROM d1_migrations ORDER BY id').all<{ name: string }>()).results.map((row) => row.name))
      .toEqual(env.TEST_MIGRATIONS.map((migration) => migration.name));
    expect(await devices(db)).toHaveLength(2);

    // Between `migrations apply` and the deploy, the old Worker can still use a code without a device row.
    await db.prepare("UPDATE activation_codes SET status = 'used', used_at = ?, activation_id = ?, app_version = '0.9.0', build_id = 'build-old' WHERE code_hash = ? AND status = 'unused'")
      .bind('2026-10-25T09:00:00.000Z', 'd7b0f2d4-8f70-4165-9c73-3b5b5d2e8c23', await sha256Hex('MIGRATE-UNUSED'))
      .run();
    await runSql(db, env.TEST_DEPLOY_SQL.backfill);
    await runSql(db, env.TEST_DEPLOY_SQL.backfill);
    const after = await devices(db);
    expect(after.map((row) => [row.activation_id, row.activated_at, row.device_label])).toEqual([
      ['b5f8d0b2-6d5e-4f43-9a51-1f3f3b0c6a01', '2026-09-02T10:00:00.000Z', 'Other device'],
      ['c6a9e1c3-7e6f-4054-8b62-2a4a4c1d7b12', '2026-09-03T11:00:00.000Z', 'Other device'],
      ['d7b0f2d4-8f70-4165-9c73-3b5b5d2e8c23', '2026-10-25T09:00:00.000Z', 'Other device'],
    ]);
  });
});
