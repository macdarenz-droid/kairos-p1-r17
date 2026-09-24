import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { defineSavedAnalysis, type SavedAnalysis } from '../src/domain/saved-records/savedAnalysisContract';
import { SAVED_RECORD_LABEL_MAX_LENGTH, isStoredSavedRecordLabel, normalizeSavedRecordLabel } from '../src/domain/saved-records/savedRecordLabel';
import { defineSavedTimeAssistedSnapshot, type SavedTimeAssistedSnapshot } from '../src/domain/saved-records/savedTimeAssistedSnapshotContract';
import type { TimeAssistedTradeSnapshot } from '../src/application/market-reference';
import { saveSavedAnalysis } from '../src/application/saved-analysis';
import { saveSavedTimeAssistedSnapshot } from '../src/application/saved-time-assisted-snapshot';
import { createKairosBackupEnvelope, parseKairosBackup, prepareKairosRestore, restoreAndVerifyKairosDatabase, serializeKairosBackup } from '../src/data/backup';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase } from '../src/data/database';
import { createKairosRepositories } from '../src/data/repositories';

const names: string[] = [];
const dbName = (label: string) => { const name = `kairos-p25-1-${label}-${crypto.randomUUID()}`; names.push(name); return name; };
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const instrument = { venue: 'binance-spot', symbol: 'ETHUSDT' } as const;
const market = { venue: 'binance-spot', instrument: 'ETHUSDT', source: 'market-reference' } as const;
const snapshot: TimeAssistedTradeSnapshot = { kind: 'snapshot', isEstimate: true, source: 'market-reference', instrument, side: 'long', opening: { kind: 'unavailable', instrument, requestedAt: '2026-09-10T02:13:27Z', reason: 'no-candle' }, closing: null, durationMs: null };
const labelled: SavedAnalysis = defineSavedAnalysis({ id: 'a-labelled', market, drawings: [], riskRewards: [], label: 'Breakout plan' });
const unlabelled: SavedAnalysis = defineSavedAnalysis({ id: 'a-plain', market, drawings: [], riskRewards: [] });
const labelledSnapshot: SavedTimeAssistedSnapshot = defineSavedTimeAssistedSnapshot({ id: 's-labelled', market, side: 'long', openedAt: '2026-09-10T02:13:27Z', openedAtUtc: '2026-09-10T02:13:27.000Z', closedAt: null, closedAtUtc: null, inputTimeZone: 'UTC', opening: snapshot.opening, closing: null, durationMs: null, savedAt: '2026-09-18T03:30:00.000Z', isEstimate: true, source: 'market-reference', label: 'Morning scalp' });

describe('P25.1 saved record label foundation', () => {
  it('normalises a label: trimmed, blank means absent, non-string or over-long is invalid, and the stored form is exactly the normalised form', () => {
    expect(normalizeSavedRecordLabel(undefined)).toEqual({ kind: 'absent' });
    expect(normalizeSavedRecordLabel('   ')).toEqual({ kind: 'absent' });
    expect(normalizeSavedRecordLabel('  Breakout plan ')).toEqual({ kind: 'label', label: 'Breakout plan' });
    expect(normalizeSavedRecordLabel(42)).toEqual({ kind: 'invalid', reason: 'not-a-string' });
    expect(normalizeSavedRecordLabel('x'.repeat(SAVED_RECORD_LABEL_MAX_LENGTH + 1))).toEqual({ kind: 'invalid', reason: 'too-long' });
    expect(normalizeSavedRecordLabel('x'.repeat(SAVED_RECORD_LABEL_MAX_LENGTH))).toEqual({ kind: 'label', label: 'x'.repeat(SAVED_RECORD_LABEL_MAX_LENGTH) });
    expect(isStoredSavedRecordLabel(undefined)).toBe(true);
    expect(isStoredSavedRecordLabel('Breakout plan')).toBe(true);
    for (const bad of ['', ' padded', 'padded ', 'x'.repeat(SAVED_RECORD_LABEL_MAX_LENGTH + 1), 7, null]) expect(isStoredSavedRecordLabel(bad)).toBe(false);
  });

  it('keeps the released contracts valid without a label and carries an optional label on both', () => {
    expect('label' in unlabelled).toBe(false);
    expect(labelled.label).toBe('Breakout plan');
    expect(labelledSnapshot.label).toBe('Morning scalp');
  });

  it('stores the normalised label through both save commands, omits a blank label, and rejects an over-long label before any write', async () => {
    const db = createKairosDatabase(dbName('save'));
    await openKairosDatabase(db);
    const a = await saveSavedAnalysis(db, { market, drawings: [], riskRewards: [], label: '  Breakout plan ' });
    expect(a.ok).toBe(true);
    const plain = await saveSavedAnalysis(db, { market, drawings: [], riskRewards: [], label: '   ' });
    expect(plain.ok).toBe(true);
    const s = await saveSavedTimeAssistedSnapshot(db, { snapshot, inputTimeZone: 'UTC', label: ' Morning scalp ' });
    expect(s.ok).toBe(true);
    if (!a.ok || !plain.ok || !s.ok) return;
    expect((await db.savedAnalyses.get(a.savedAnalysisId))?.label).toBe('Breakout plan');
    expect('label' in ((await db.savedAnalyses.get(plain.savedAnalysisId)) ?? {})).toBe(false);
    expect(s.record.label).toBe('Morning scalp');
    expect((await db.savedTimeAssistedSnapshots.get(s.savedTimeAssistedSnapshotId))?.label).toBe('Morning scalp');
    expect(await saveSavedAnalysis(db, { market, drawings: [], riskRewards: [], label: 'x'.repeat(SAVED_RECORD_LABEL_MAX_LENGTH + 1) })).toEqual({ ok: false, type: 'invalid-input', reason: 'saved-analysis-label-invalid' });
    expect(await saveSavedTimeAssistedSnapshot(db, { snapshot, inputTimeZone: 'UTC', label: 'x'.repeat(SAVED_RECORD_LABEL_MAX_LENGTH + 1) })).toEqual({ ok: false, type: 'invalid-input', reason: 'label-invalid' });
    expect(await db.savedAnalyses.count()).toBe(2);
    expect(await db.savedTimeAssistedSnapshots.count()).toBe(1);
    await expect(inspectKairosDatabaseIntegrity(db)).resolves.toMatchObject({ ok: true, savedAnalysisRecordCount: 2, savedTimeAssistedSnapshotRecordCount: 1 });
    db.close();
  });

  it('accepts labelled records in backup V4 without a format bump, rejects a malformed stored label, and preserves labels through a verified restore', async () => {
    const envelope = createKairosBackupEnvelope({ metadata: [], savedAnalyses: [labelled, unlabelled], savedTimeAssistedSnapshots: [labelledSnapshot] });
    const parsed = parseKairosBackup(serializeKairosBackup(envelope));
    expect(parsed).toMatchObject({ formatVersion: 5, databaseSchemaVersion: 7 });
    expect(parsed.payload.savedAnalyses.map(record => record.label)).toEqual(['Breakout plan', undefined]);
    expect(parsed.payload.savedTimeAssistedSnapshots[0]?.label).toBe('Morning scalp');
    expect(() => parseKairosBackup(JSON.stringify({ ...envelope, payload: { ...envelope.payload, savedAnalyses: [{ ...labelled, label: ' padded' }, unlabelled] } }))).toThrowError(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    expect(() => parseKairosBackup(JSON.stringify({ ...envelope, payload: { ...envelope.payload, savedTimeAssistedSnapshots: [{ ...labelledSnapshot, label: 7 }] } }))).toThrowError(expect.objectContaining({ code: 'INVALID_PAYLOAD' }));
    const db = createKairosDatabase(dbName('restore'));
    await openKairosDatabase(db);
    const verified = await restoreAndVerifyKairosDatabase(db, await prepareKairosRestore(db, serializeKairosBackup(envelope)));
    expect(verified.integrity.ok).toBe(true);
    const repos = createKairosRepositories(db);
    expect((await repos.savedAnalyses.get('a-labelled'))?.label).toBe('Breakout plan');
    expect((await repos.savedTimeAssistedSnapshots.get('s-labelled'))?.label).toBe('Morning scalp');
    db.close();
  });

  it('fails integrity closed on a malformed stored label', async () => {
    const db = createKairosDatabase(dbName('integrity'));
    await openKairosDatabase(db);
    await db.savedAnalyses.put({ ...labelled, label: '' });
    const report = await inspectKairosDatabaseIntegrity(db);
    expect(report.ok).toBe(false);
    expect(report.checks.find(check => check.id === 'saved-analysis-record-shape')).toMatchObject({ ok: false });
    db.close();
  });
});
