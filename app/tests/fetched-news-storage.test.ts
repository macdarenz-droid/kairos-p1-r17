import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, prepareBackupRestore } from '../src/application/backup';
import {
  deleteEconomicEvent,
  loadEconomicCalendarWeek,
  onlyBigNews,
  saveTypedEconomicEvent,
  type TypedEconomicEventInput,
} from '../src/application/economic-calendar/economicEvents';
import { writeVisualPnlTimeZonePreference } from '../src/application/visual-pnl/timeZonePreference';
import { createKairosDatabaseSnapshot, createKairosDatabaseSnapshotWithReport, serializeKairosBackup } from '../src/data/backup';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';
import { economicEventId, type EconomicEventRecord } from '../src/domain/economic-calendar/economicEvent';

const names: string[] = [];
const opened: Dexie[] = [];
const newName = (label: string) => { const name = `kairos-fetched-news-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const db of opened.splice(0)) db.close(); for (const name of names.splice(0)) await Dexie.delete(name); });
async function current(label: string): Promise<KairosDatabase> {
  const db = createKairosDatabase(newName(label)); opened.push(db); await openKairosDatabase(db); return db;
}

const CPI_BLS: EconomicEventRecord = {
  id: 'bls:3bc656751421b9fb',
  source: 'bls',
  title: 'Consumer Price Index',
  currency: 'USD',
  startsAt: '2026-09-24T12:30:00.000Z',
  impact: null,
  expected: null,
  previous: null,
  actual: null,
  savedAt: '2026-09-24T03:00:00.000Z',
  fetchedAt: '2026-09-24T02:55:00.000Z',
};
const REAL_EARNINGS: EconomicEventRecord = { ...CPI_BLS, id: 'bls:00000000000000e2', title: 'Real Earnings' };
const now = '2026-09-24T04:00:00.000Z';
const savedAt = '2026-09-20T08:00:00.000Z';
const typedRow = (key: string, startsAt = '2026-09-24T09:00:00.000Z'): EconomicEventRecord => ({
  id: economicEventId('typed', key), source: 'typed', title: `News ${key}`, currency: 'EUR', startsAt, impact: 'medium',
  expected: null, previous: null, actual: null, savedAt, fetchedAt: null,
});
const fetchedRow = (index: number): EconomicEventRecord => ({ ...CPI_BLS, id: `bls:${index.toString(16).padStart(16, '0')}` });
const typed: TypedEconomicEventInput = { title: 'US CPI', startsAt: '2026-09-24T20:30', currency: 'USD', impact: 'high', expected: '', previous: '', actual: '' };

describe('T-046d fetched news is stored', () => {
  it('passes integrity and round-trips a backup into a fresh database exactly', async () => {
    const source = await current('source');
    await source.economicEvents.put(CPI_BLS);
    expect(await inspectKairosDatabaseIntegrity(source)).toMatchObject({ ok: true, economicEventRecordCount: 1 });
    const text = serializeKairosBackup(await createKairosDatabaseSnapshot(source));
    const db = await current('restore');
    const prepared = await prepareBackupRestore(db, text);
    if (!prepared.ok) throw new Error(prepared.type);
    expect((await commitBackupRestore(db, prepared.restore)).ok).toBe(true);
    expect(await db.economicEvents.toArray()).toEqual([CPI_BLS]);
  });

  it('checks a fetched row with a size in the secondary tier, and a backup leaves it out', async () => {
    const db = await current('damaged');
    await db.economicEvents.bulkPut([CPI_BLS, { ...CPI_BLS, id: 'bls:bad', impact: 'high' }]);
    const report = await inspectKairosDatabaseIntegrity(db);
    expect(report.checks.find((check) => check.id === 'economic-event-record-shape')).toMatchObject({ ok: false, tier: 'secondary' });
    expect(report.coreOk).toBe(true);
    const snapshot = await createKairosDatabaseSnapshotWithReport(db);
    expect(snapshot.skipped.economicEvents).toBe(1);
    expect(snapshot.envelope.payload.economicEvents).toEqual([CPI_BLS]);
  });
});

describe('T-046d typed news rules with fetched rows beside it', () => {
  it('caps typed news only: fetched rows never use up its room', async () => {
    const full = await current('cap-full');
    await full.economicEvents.bulkPut([...Array.from({ length: 1000 }, (_, i) => typedRow(`t${i}`)), ...Array.from({ length: 5 }, (_, i) => fetchedRow(i))]);
    expect(await saveTypedEconomicEvent(full, typed, { now: () => savedAt, createKey: () => 'new' })).toEqual({ ok: false, type: 'limit-reached', limit: 1000 });

    const room = await current('cap-room');
    await room.economicEvents.bulkPut([...Array.from({ length: 999 }, (_, i) => typedRow(`t${i}`)), ...Array.from({ length: 50 }, (_, i) => fetchedRow(i))]);
    expect((await saveTypedEconomicEvent(room, typed, { now: () => savedAt, createKey: () => 'new' })).ok).toBe(true);
    expect(await room.economicEvents.count()).toBe(1050);
  });

  it('never deletes a fetched row', async () => {
    const db = await current('delete');
    await db.economicEvents.put(CPI_BLS);
    expect(await deleteEconomicEvent(db, CPI_BLS.id)).toEqual({ ok: false, type: 'not-typed' });
    expect(await db.economicEvents.get(CPI_BLS.id)).toEqual(CPI_BLS);
  });

  it("counts only typed news as saved, and big news only keeps what Kairos's list rates big", async () => {
    const db = await current('week');
    await writeVisualPnlTimeZonePreference(createKairosRepositories(db).metadata, 'Asia/Manila', now);
    await db.economicEvents.bulkPut([typedRow('a'), typedRow('b', '2026-09-25T09:00:00.000Z'), CPI_BLS, REAL_EARNINGS]);
    const week = await loadEconomicCalendarWeek(db, { now });
    if (week.kind !== 'ready') throw new Error(week.kind);
    expect(week.savedCount).toBe(2);
    const thursday = week.days.find((day) => day.dayKey === '2026-09-24');
    expect(thursday?.events.map((event) => event.id)).toEqual(expect.arrayContaining([CPI_BLS.id, REAL_EARNINGS.id]));
    expect(onlyBigNews(week.days)).toEqual([{ dayKey: '2026-09-24', events: [CPI_BLS] }]);
  });
});
