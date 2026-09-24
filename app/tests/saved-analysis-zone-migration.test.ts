import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { commitBackupRestore, exportKairosBackup, prepareBackupRestore } from '../src/application/backup';
import { loadSavedAnalysis, saveSavedAnalysis } from '../src/application/saved-analysis';
import { KAIROS_BACKUP_FORMAT_VERSION, createKairosBackupEnvelope, parseKairosBackup } from '../src/data/backup';
import { KAIROS_DB_SCHEMA_VERSION, createKairosDatabase, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import type { TradeDisciplineId, TradeDisciplineRecord } from '../src/domain/discipline';
import type { SavedAnalysis, SavedAnalysisId } from '../src/domain/saved-records/savedAnalysisContract';
import type { DecimalString, TradeId, TradeRecord } from '../src/domain/trades';
import {
  constructChartTrendLineEdit,
  createLightweightChartsV5TrendLinePaneRenderer,
  hitTestLightweightChartsV5TrendLineSegments,
  type ChartDrawing,
  type LightweightChartsV5TrendLineScreenSegment,
} from '../src/features/chart';

const names: string[] = [];
async function database(label: string): Promise<KairosDatabase> {
  const name = `kairos-zone-${label}-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const anchor = (timestamp: string, price: string) => ({ timestamp, price: price as DecimalString });
const zone: ChartDrawing = { id: 'zone-1', kind: 'zone', start: anchor('2026-09-10T00:00:00.000Z', '65000'), end: anchor('2026-09-08T00:00:00.000Z', '64000.5') };
const line: ChartDrawing = { id: 'line-1', kind: 'trend-line', start: anchor('2026-09-01T00:00:00.000Z', '60000'), end: anchor('2026-09-05T00:00:00.000Z', '62000') };
const market = { venue: 'BINANCE', instrument: 'BTCUSDT', source: 'market-reference' as const };

const tradeId = 'trade-zone' as TradeId;
const trade: TradeRecord = { id: tradeId, symbol: 'BTCUSDT', marketType: 'crypto', side: 'long', status: 'closed', source: 'manual', grossPnlCurrency: 'USDT', openedAt: '2026-09-19T08:00:00.000Z', closedAt: '2026-09-19T09:30:00.000Z', createdAt: '2026-09-19T08:00:00.000Z', updatedAt: '2026-09-19T09:30:00.000Z' };
const discipline: TradeDisciplineRecord = {
  id: 'discipline-zone' as TradeDisciplineId, tradeId,
  preTradeChecklist: [{ key: 'plan-written', answer: 'yes' }], postTradeReview: [{ key: 'followed-plan', answer: 'no' }], mistakes: ['moved-stop'],
  note: 'Moved the stop.', checklistCompletedAt: '2026-09-19T07:55:00.000Z', reviewedAt: '2026-09-19T10:00:00.000Z', createdAt: '2026-09-19T07:55:00.000Z', updatedAt: '2026-09-19T10:00:00.000Z',
};
const savedWithLine = { id: 'analysis-line' as SavedAnalysisId, market, drawings: [line], riskRewards: [] } as unknown as SavedAnalysis;

describe('zones in saved analyses and backups', () => {
  it('keeps the current versions: backup format 6 describing schema 7', () => {
    expect(KAIROS_BACKUP_FORMAT_VERSION).toBe(6);
    expect(KAIROS_DB_SCHEMA_VERSION).toBe(7);
  });

  it('saves and loads a zone with a trend line, byte-equal', async () => {
    const db = await database('save');
    const saved = await saveSavedAnalysis(db, { market, drawings: [zone, line], riskRewards: [] } as never);
    if (!saved.ok) throw new Error(saved.reason);
    const loaded = await loadSavedAnalysis(db, saved.savedAnalysisId);
    if (!loaded.ok) throw new Error(loaded.reason);
    expect(loaded.savedAnalysis.drawings).toEqual([zone, line]);
    expect(loaded.savedAnalysis.drawings[0]).toMatchObject({ kind: 'zone', start: zone.start, end: zone.end });
  });

  it('exports format 6 with schema 7, and the zone survives parsing', async () => {
    const db = await database('export');
    const saved = await saveSavedAnalysis(db, { market, drawings: [zone], riskRewards: [] } as never);
    if (!saved.ok) throw new Error(saved.reason);
    const exported = await exportKairosBackup(db, new Date('2026-09-20T00:00:00.000Z'));
    if (!exported.ok) throw new Error(exported.type);
    const parsed = parseKairosBackup(exported.file.contents);
    expect(parsed).toMatchObject({ formatVersion: 6, databaseSchemaVersion: 7 });
    expect(parsed.payload.savedAnalyses[0].drawings).toEqual([zone]);
  });

  it('reads an old format 5 backup, keeping its discipline record, and restores it', async () => {
    const v5 = { ...createKairosBackupEnvelope({ metadata: [], trades: [trade], savedAnalyses: [savedWithLine], tradeDiscipline: [discipline], exportedAt: new Date('2026-09-20T00:00:00.000Z') }), formatVersion: 5 };
    const text = JSON.stringify(v5);
    const parsed = parseKairosBackup(text);
    expect(parsed).toMatchObject({ formatVersion: 6, databaseSchemaVersion: 7, recordCounts: { trades: 1, savedAnalyses: 1, tradeDiscipline: 1, total: 3 } });
    expect(parsed.payload.tradeDiscipline).toEqual([discipline]);

    const db = await database('restore');
    const prepared = await prepareBackupRestore(db, text);
    if (!prepared.ok) throw new Error(prepared.type);
    const committed = await commitBackupRestore(db, prepared.restore);
    expect(committed.ok).toBe(true);
    expect(await db.tradeDiscipline.toArray()).toEqual([discipline]);
    expect((await db.savedAnalyses.toArray())[0].drawings).toEqual([line]);
  });

  it('refuses a format from the future', () => {
    const future = { ...createKairosBackupEnvelope({ metadata: [] }), formatVersion: 7 };
    expect(() => parseKairosBackup(JSON.stringify(future))).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_FORMAT_VERSION' }));
  });
});

describe('the chart until zones are drawn', () => {
  const zoneSegment: LightweightChartsV5TrendLineScreenSegment = { id: 'zone-1', kind: 'zone', start: { x: 10, y: 10 }, end: { x: 50, y: 50 } };

  it('edits a zone corner and keeps its kind', () => {
    expect(constructChartTrendLineEdit(zone, 'end', anchor('2026-09-09T00:00:00.000Z', '63000'))).toEqual({ ...zone, end: anchor('2026-09-09T00:00:00.000Z', '63000') });
  });

  it('draws nothing for a zone segment and never hits one', () => {
    const context = { save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(), strokeStyle: '', lineWidth: 0 };
    const target = { useBitmapCoordinateSpace: (draw: (scope: unknown) => void) => draw({ context, horizontalPixelRatio: 1, verticalPixelRatio: 1 }) };
    createLightweightChartsV5TrendLinePaneRenderer([zoneSegment], { color: '#fff', lineWidth: 1 }).draw(target as never);
    expect(context.stroke).not.toHaveBeenCalled();
    expect(hitTestLightweightChartsV5TrendLineSegments([zoneSegment], 30, 30, 8)).toBeNull();
  });
});
