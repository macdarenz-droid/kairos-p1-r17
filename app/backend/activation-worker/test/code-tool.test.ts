import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  CodeToolError, firstUseBy, formatList, formatMade, makeCodes, readCodes, readCommand, readMade, readWranglerJson, sqlFree, sqlList, sqlMake, sqlRevoke,
} from '../scripts/codeAdmin.mjs';
import { INVITE_CODE_ALPHABET } from '../src/inviteCode.mjs';
import {
  activate, activateDevice, activationBody, addCode, applyMigrations, callDevices, deviceToken, expectReceiptTheAppAccepts, newCode, sha256Hex,
  type Receipt,
} from './support';

beforeAll(applyMigrations);

type Rows = Array<Array<Record<string, unknown>>>;

/**
 * The tool's statements, run the way `wrangler d1 execute --local --json --command` runs them (one D1 batch, each result
 * mapped to { results, success, meta: { duration } }), and read back from that JSON text by the tool's own reader.
 */
async function runLikeWrangler(statements: readonly string[]): Promise<Rows> {
  const results = await env.DB.batch(statements.map((statement) => env.DB.prepare(statement)));
  return readWranglerJson(JSON.stringify(results.map((result) => ({ results: result.results, success: result.success, meta: { duration: result.meta.duration } }))));
}

let labels = 0;

/** A label no other test uses. */
function newLabel(): string {
  labels += 1;
  return `T62C ${labels} ${crypto.randomUUID().slice(0, 8)}`;
}

/** Codes made and stored by the tool, as `npm run codes -- make` does. */
async function makeWithTool(count: number, devices = 3): Promise<{ label: string; made: Array<{ code: string; id: number }> }> {
  const label = newLabel();
  const codes = makeCodes(count);
  const made = await readMade(codes, await runLikeWrangler(await sqlMake(codes, { label, devices, days: null, now: new Date() })));
  return { label, made: made.map(({ code, id }) => ({ code, id: id ?? Number.NaN })) };
}

/** A device's row, found by its receipt (the Worker never names a device by its activationId, the test may). */
async function deviceRow(receipt: Receipt): Promise<{ id: number; code_id: number; removed_by: string | null }> {
  const row = await env.DB.prepare('SELECT id, code_id, removed_by FROM activation_devices WHERE activation_id = ?')
    .bind(receipt.activationId)
    .first<{ id: number; code_id: number; removed_by: string | null }>();
  if (row === null) throw new Error('no such device');
  return row;
}

async function check(receipt: Receipt): Promise<unknown> {
  return (await callDevices('/devices/check', { token: deviceToken(receipt) })).json();
}

describe("the owner's code tool (D279, scripts/codeAdmin.mjs)", () => {
  it('makes codes of 16 characters from the alphabet, each one different', () => {
    const codes = makeCodes(100);
    expect(codes).toHaveLength(100);
    expect(new Set(codes).size).toBe(100);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9A-Z]{4}(?:-[0-9A-Z]{4}){3}$/);
      const compact = code.replace(/-/g, '');
      expect(compact).toHaveLength(16);
      for (const character of compact) expect(INVITE_CODE_ALPHABET).toContain(character);
    }

    // A repeat inside one batch is drawn again, so the batch stays unique.
    const draws = [new Uint8Array(16).fill(1), new Uint8Array(16).fill(1), new Uint8Array(16).fill(2)];
    let calls = 0;
    const repeating = (length: number): Uint8Array => {
      expect(length).toBe(16);
      calls += 1;
      return draws[Math.min(calls, draws.length) - 1];
    };
    expect(makeCodes(2, repeating)).toEqual(['1111-1111-1111-1111', '2222-2222-2222-2222']);
    expect(calls).toBe(3);
    // A source that only repeats makes nothing, rather than run forever.
    expect(() => makeCodes(2, () => new Uint8Array(16))).toThrow(CodeToolError);
  });

  it('stores only a fingerprint, shows each code once, and /activate accepts each one typed with dashes or spaces in lower case', async () => {
    const now = new Date();
    const label = newLabel();
    const codes = makeCodes(3);
    const made = await readMade(codes, await runLikeWrangler(await sqlMake(codes, { label, devices: 3, days: 30, now })));
    expect(made.map((entry) => entry.code)).toEqual(codes);
    for (const entry of made) expect(Number.isSafeInteger(entry.id)).toBe(true);

    // D1 holds the SHA-256 of each code's 16 characters, the label, the limit and the first-use date; never the code.
    const rows = (await env.DB.prepare('SELECT * FROM activation_codes WHERE label = ? ORDER BY id').bind(label).all<Record<string, unknown>>()).results;
    expect(rows.map((row) => row.code_hash).sort()).toEqual((await Promise.all(codes.map((code) => sha256Hex(code.replace(/-/g, ''))))).sort());
    const expiresAt = new Date(now.getTime() + 30 * 86_400_000).toISOString();
    expect(firstUseBy(now, 30)).toBe(expiresAt);
    expect(rows.map((row) => [row.status, row.device_limit, row.label, row.created_at, row.expires_at, row.revoked_at]))
      .toEqual(codes.map(() => ['unused', 3, label, now.toISOString(), expiresAt, null]));
    const stored = JSON.stringify(rows);
    for (const code of codes) {
      expect(stored).not.toContain(code);
      expect(stored).not.toContain(code.replace(/-/g, ''));
    }

    const shown = formatMade(made, { label, devices: 3, firstUseBy: expiresAt });
    for (const code of codes) expect(shown.split(code)).toHaveLength(2);
    expect(shown).toContain("Write these down now. Kairos keeps only a fingerprint and can't show them again.");
    expect(shown).not.toMatch(/[0-9a-f]{64}/);

    const typed = [codes[0].toLowerCase(), ` ${codes[1].toLowerCase().replace(/-/g, ' ')} `, codes[2].toLowerCase().replace(/0/g, 'o')];
    for (const text of typed) {
      const response = await activate(text);
      expect(response.status, text).toBe(200);
      await expectReceiptTheAppAccepts((await response.json<{ receipt: unknown }>()).receipt);
    }
    const after = await env.DB.prepare("SELECT COUNT(*) AS used FROM activation_codes WHERE label = ? AND status = 'used'").bind(label).first<{ used: number }>();
    expect(after?.used).toBe(3);
  });

  it('lists a code with "2 of 3", its devices and the removed one, marks codes added by hand, and never shows a fingerprint', async () => {
    const { label, made: [{ code, id }] } = await makeWithTool(1);
    const phone = await activateDevice(code, { requestId: crypto.randomUUID(), deviceLabel: 'iPhone · Safari' });
    const laptop = await activateDevice(code, { requestId: crypto.randomUUID(), deviceLabel: 'Windows · Edge' });
    const tablet = await activateDevice(code, { requestId: crypto.randomUUID(), deviceLabel: 'Android · Chrome' });
    const removed = await callDevices('/devices/remove', { token: deviceToken(phone), deviceId: (await deviceRow(tablet)).id });
    expect(removed.status).toBe(200);

    const shown = formatList((await runLikeWrangler(sqlList({ id })))[0]);
    expect(shown).toContain(label);
    expect(shown).toContain('2 of 3');
    for (const device of ['iPhone · Safari', 'Windows · Edge', 'Android · Chrome']) expect(shown).toContain(device);
    expect(shown).toContain('removed');
    expect(shown).not.toContain('added by hand');
    // The Worker counts the same devices: the tool shows D1's count, as /devices does.
    const listed = await (await callDevices('/devices', { token: deviceToken(laptop) })).json<{ used: number; limit: number }>();
    expect([listed.used, listed.limit]).toEqual([2, 3]);
    const [view] = readCodes((await runLikeWrangler(sqlList({ id })))[0]);
    expect([view.inUse, view.deviceLimit, view.devices.length]).toEqual([2, 3, 3]);
    expect(view.devices.filter((device) => device.removedAt !== null).map((device) => device.removedBy)).toEqual(['trader']);

    // Never a fingerprint, the code, or a device's activationId.
    expect(shown).not.toMatch(/[0-9a-f]{64}/i);
    expect(shown).not.toContain(code);
    for (const receipt of [phone, laptop, tablet]) expect(shown).not.toContain(receipt.activationId);

    // A code made by hand before the tool has no label.
    const handMade = newCode();
    await addCode(handMade);
    const handId = (await env.DB.prepare('SELECT id FROM activation_codes WHERE code_hash = ?').bind(await sha256Hex(handMade)).first<{ id: number }>())?.id;
    const handShown = formatList((await runLikeWrangler(sqlList({ id: handId })))[0]);
    expect(handShown).toContain('added by hand');
    expect(handShown).toContain('0 of 3');
    expect(handShown).not.toMatch(/[0-9a-f]{64}/i);

    // --label finds the codes with that label, in any case, and no other.
    const byLabel = readCodes((await runLikeWrangler(sqlList({ label: label.toLowerCase() })))[0]);
    expect(byLabel.map((entry) => entry.id)).toEqual([id]);
    // Every code, when no filter is given.
    const all = readCodes((await runLikeWrangler(sqlList()))[0]).map((entry) => entry.id);
    expect(all).toContain(id);
    expect(all).toContain(handId);
  });

  it('revoke: a used code takes no new device and its devices hear "revoked"; an unused code is refused too', async () => {
    const { made: [used, unused] } = await makeWithTool(2);
    const phone = await activateDevice(used.code, { requestId: crypto.randomUUID() });
    expect(await check(phone)).toEqual({ ok: true, status: 'active' });

    const now = new Date();
    const revoked = await runLikeWrangler([...sqlRevoke(used.id, now), ...sqlRevoke(unused.id, now)]);
    expect(revoked.map((rows) => rows.length)).toEqual([1, 1]);

    const next = await activate(used.code.toLowerCase());
    expect(next.status).toBe(403);
    expect(await next.json()).toEqual({ ok: false, reason: 'invalid-code' });
    expect(await check(phone)).toEqual({ ok: true, status: 'revoked' });
    const neverUsed = await activate(unused.code);
    expect(neverUsed.status).toBe(403);
    expect(await neverUsed.json()).toEqual({ ok: false, reason: 'invalid-code' });

    // 0001 allows the status 'revoked' only for a code never used, so a used code keeps 'used' and gets revoked_at.
    const rows = await env.DB.prepare('SELECT id, status, revoked_at FROM activation_codes WHERE id IN (?, ?) ORDER BY id').bind(used.id, unused.id).all();
    expect(rows.results).toEqual([
      { id: used.id, status: 'used', revoked_at: now.toISOString() },
      { id: unused.id, status: 'revoked', revoked_at: now.toISOString() },
    ].sort((a, b) => a.id - b.id));
    const [view] = readCodes((await runLikeWrangler(sqlList({ id: used.id })))[0]);
    expect(view.revoked).toBe(true);
    expect(formatList((await runLikeWrangler(sqlList({ id: used.id })))[0])).toContain('revoked');

    // Again: nothing changes.
    expect((await runLikeWrangler(sqlRevoke(used.id, new Date())))[0]).toEqual([]);
    expect((await env.DB.prepare('SELECT revoked_at FROM activation_codes WHERE id = ?').bind(used.id).first())?.revoked_at).toBe(now.toISOString());
  });

  it('free: the freed device hears "removed", and a new device fits in its place', async () => {
    const { made: [{ code, id }] } = await makeWithTool(1, 2);
    const phone = await activateDevice(code, { requestId: crypto.randomUUID() });
    const laptop = await activateDevice(code, { requestId: crypto.randomUUID() });
    const third = await activate(code, { body: activationBody(code, { requestId: crypto.randomUUID() }) });
    expect(await third.json()).toEqual({ ok: false, reason: 'already-used', deviceLimit: 2 });

    const laptopId = (await deviceRow(laptop)).id;
    const freed = await runLikeWrangler(sqlFree(id, laptopId, new Date()));
    expect(freed[0]).toEqual([{ id: laptopId }]);
    expect(await check(laptop)).toEqual({ ok: true, status: 'removed' });
    expect(await check(phone)).toEqual({ ok: true, status: 'active' });
    expect(await deviceRow(laptop)).toEqual({ id: laptopId, code_id: id, removed_by: 'owner' });
    await expectReceiptTheAppAccepts(await activateDevice(code, { requestId: crypto.randomUUID() }));

    // Again, or named with another code's id: nothing changes.
    expect((await runLikeWrangler(sqlFree(id, laptopId, new Date())))[0]).toEqual([]);
    const { made: [other] } = await makeWithTool(1);
    expect((await runLikeWrangler(sqlFree(other.id, (await deviceRow(phone)).id, new Date())))[0]).toEqual([]);
    expect(await check(phone)).toEqual({ ok: true, status: 'active' });
  });

  it('refuses a bad label, count, device count, day count or id before any SQL is made', async () => {
    const codes = makeCodes(1);
    const now = new Date();
    const good = { label: 'Friends', devices: 3, days: null, now };
    for (const count of [0, 101, 2.5, Number.NaN, -1, '3']) expect(() => makeCodes(count as number), String(count)).toThrow(CodeToolError);
    for (const label of ['', 'x'.repeat(41), "Ana's", 'Ana;', 'Ana"', 'Ana\n', 'Ána', '%', "x' OR '1'='1", null, 7]) {
      await expect(sqlMake(codes, { ...good, label: label as string }), String(label)).rejects.toThrow(CodeToolError);
      // null is no filter at all for list.
      if (label !== null) expect(() => sqlList({ label: label as string }), String(label)).toThrow(CodeToolError);
    }
    for (const devices of [0, 11, 2.5, Number.NaN, '3']) await expect(sqlMake(codes, { ...good, devices: devices as number }), String(devices)).rejects.toThrow(CodeToolError);
    for (const days of [0, 366, 1.5, '30']) await expect(sqlMake(codes, { ...good, days: days as number }), String(days)).rejects.toThrow(CodeToolError);
    await expect(sqlMake(codes, { ...good, now: new Date(Number.NaN) })).rejects.toThrow(CodeToolError);
    for (const list of [[], makeCodes(100).concat(makeCodes(1)), ["'); DROP TABLE activation_codes; --"], ['KAIROS-ANA'], [codes[0], codes[0]], [codes[0].toLowerCase()]]) {
      await expect(sqlMake(list, good), JSON.stringify(list).slice(0, 40)).rejects.toThrow(CodeToolError);
    }
    for (const id of [0, -1, 1.5, Number.NaN, '1', '1 OR 1=1', 2 ** 53, null]) {
      expect(() => sqlRevoke(id as number, now), String(id)).toThrow(CodeToolError);
      expect(() => sqlFree(id as number, 1, now), String(id)).toThrow(CodeToolError);
      expect(() => sqlFree(1, id as number, now), String(id)).toThrow(CodeToolError);
      if (id !== null) expect(() => sqlList({ id: id as number }), String(id)).toThrow(CodeToolError);
    }

    // The command line is read with the same checks, before the tool builds any SQL or calls wrangler.
    expect(readCommand(['make', '2', '--label', ' Test ', '--local'])).toEqual({ kind: 'make', where: 'local', count: 2, label: 'Test', devices: 3, days: null });
    expect(readCommand(['make', '5', '--label=Friends', '--devices', '4', '--days', '30'])).toEqual({ kind: 'make', where: 'remote', count: 5, label: 'Friends', devices: 4, days: 30 });
    expect(readCommand(['list', '--remote'])).toEqual({ kind: 'list', where: 'remote', label: null });
    expect(readCommand(['revoke', '12'])).toEqual({ kind: 'revoke', where: 'remote', id: 12 });
    expect(readCommand(['free', '12', '--device', '31', '--local'])).toEqual({ kind: 'free', where: 'local', id: 12, device: 31 });
    expect(readCommand([])).toEqual({ kind: 'help' });
    const refused = [
      ['make', '0', '--label', 'A'], ['make', '101', '--label', 'A'], ['make', '3e1', '--label', 'A'], ['make', '0x10', '--label', 'A'], ['make', '5'],
      ['make', '5', '--label', "Ana's"], ['make', '5', '--label', '   '], ['make', '5', '--label'], ['make', '5', '--label', 'A', '--devices', '11'],
      ['make', '5', '--label', 'A', '--devices', '2.5'], ['make', '5', '--label', 'A', '--days', '366'], ['make', '5', '--label', 'A', '--label', 'B'],
      ['make', '2', '--label', 'A', '--local', '--remote'], ['list', '--devices', '3'], ['list', 'extra'], ['revoke'], ['revoke', '1;'], ['revoke', '-1'],
      ['revoke', '1', '2'], ['free', '3'], ['free', '3', '--device', '0'], ['free', '3', '--device', 'x'], ['delete', '1'], ['make', '2', '--label', 'A', '--yes'],
    ];
    for (const args of refused) expect(() => readCommand(args), args.join(' ')).toThrow(CodeToolError);
  });

  it("reads wrangler's JSON answer: each statement's rows, or its error with no fingerprint in it", () => {
    expect(readWranglerJson('[{"results":[{"id":1}],"success":true,"meta":{"duration":0}},{"results":[],"success":true,"meta":{"duration":0}}]'))
      .toEqual([[{ id: 1 }], []]);
    const hash = 'ab'.repeat(32);
    let error: unknown;
    try {
      readWranglerJson(JSON.stringify({ error: { text: `UNIQUE constraint failed: activation_codes.code_hash ${hash}` } }));
    } catch (caught) {
      error = caught;
    }
    expect(error).toBeInstanceOf(CodeToolError);
    expect((error as Error).message).toContain('UNIQUE constraint failed');
    expect((error as Error).message).not.toContain(hash);
    for (const text of ['', 'not json', '{}', '[{"results":[],"success":false}]', '[{"success":true}]', '[{"results":[1],"success":true}]']) {
      expect(() => readWranglerJson(text), text).toThrow(CodeToolError);
    }
  });
});
