import {
  KairosBackupValidationError,
  KairosRestorePreflightError,
  preflightKairosRestore,
  type KairosBackupValidationCode,
  type KairosRestorePreflightCode,
} from '../../data/backup';
import type { KairosDatabase } from '../../data/database/KairosDatabase';
import type { DatabaseTradeExecutionRecord, DatabaseTradeFeeRecord, DatabaseTradePlanRecord, DatabaseTradeRecord } from '../../data/database/schema';
import { runKairosAtomicWrite } from '../../data/database/transactions';
import type { TradeDisciplineRecord } from '../../domain/discipline';
import type { TradeSource } from '../../domain/trades';
import { KAIROS_BACKUP_RESTORE_MAX_BYTES } from './restoreBackup';

export const TRADE_IMPORT_SOURCE = 'import' as const;
/** Sources that describe real executions elsewhere; they arrive here as imported. Practice sources keep their meaning. */
export const TRADE_IMPORT_RESTAMPED_SOURCES: readonly TradeSource[] = Object.freeze(['manual', 'import', 'broker-import']);

export interface TradeImportPreview {
  readonly exportedAt: string;
  readonly formatVersion: number;
  readonly newTrades: number;
  readonly newPracticeTrades: number;
  readonly alreadyPresent: number;
  readonly plans: number;
  readonly executions: number;
  readonly fees: number;
  /** Discipline records (checklist and review) that will be added with the new trades. */
  readonly discipline: number;
}

export interface PreparedTradeImport {
  readonly preview: TradeImportPreview;
  readonly trades: readonly DatabaseTradeRecord[];
  readonly plans: readonly DatabaseTradePlanRecord[];
  readonly executions: readonly DatabaseTradeExecutionRecord[];
  readonly fees: readonly DatabaseTradeFeeRecord[];
  readonly discipline: readonly TradeDisciplineRecord[];
}

export type PrepareTradeImportResult =
  | { readonly ok: true; readonly import: PreparedTradeImport }
  | { readonly ok: false; readonly type: 'invalid-input'; readonly reason: 'backup-file-too-large'; readonly byteLength: number }
  | { readonly ok: false; readonly type: 'invalid-backup'; readonly reason: 'backup-unreadable'; readonly code: KairosBackupValidationCode }
  | { readonly ok: false; readonly type: 'incompatible-backup'; readonly reason: 'import-preflight-refused'; readonly code: KairosRestorePreflightCode }
  | { readonly ok: false; readonly type: 'identity-conflict'; readonly reason: 'child-id-present' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'import-prepare-failed' };

export type CommitTradeImportResult =
  | { readonly ok: true; readonly added: Readonly<{ trades: number; plans: number; executions: number; fees: number; discipline: number }>; readonly skipped: number }
  | { readonly ok: false; readonly type: 'identity-conflict'; readonly reason: 'child-id-present' }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'import-commit-failed' };

const restamp = (trade: DatabaseTradeRecord): DatabaseTradeRecord => (TRADE_IMPORT_RESTAMPED_SOURCES.includes(trade.source) ? { ...trade, source: TRADE_IMPORT_SOURCE } : { ...trade });

/**
 * P32.1 trade merge-import application command, step one.
 *
 * Reads a Kairos backup through the released P6 parse and preflight (format,
 * migration, duplicate ids, references) and selects the trades whose ids are
 * not on this device, with their own plans, executions, fees and discipline
 * records. The records are already checked (and converted from format 5/6) by
 * that preflight. A discipline record whose id is already here is left out and
 * never blocks the trades (D8). Nothing is
 * written: the caller shows the preview and only an explicit confirmation
 * reaches `commitTradeImport`.
 */
export async function prepareTradeImport(db: KairosDatabase, serializedBackup: string): Promise<PrepareTradeImportResult> {
  const byteLength = new TextEncoder().encode(serializedBackup).byteLength;
  if (byteLength > KAIROS_BACKUP_RESTORE_MAX_BYTES) return { ok: false, type: 'invalid-input', reason: 'backup-file-too-large', byteLength };
  let incoming;
  try {
    incoming = preflightKairosRestore(serializedBackup).incoming;
  } catch (error) {
    if (error instanceof KairosBackupValidationError) return { ok: false, type: 'invalid-backup', reason: 'backup-unreadable', code: error.code };
    if (error instanceof KairosRestorePreflightError) return { ok: false, type: 'incompatible-backup', reason: 'import-preflight-refused', code: error.code };
    return { ok: false, type: 'storage-error', reason: 'import-prepare-failed' };
  }
  try {
    const selection = await db.transaction('r', [db.trades, db.tradePlans, db.tradeExecutions, db.tradeFees, db.tradeDiscipline], async () => {
      const present = new Set((await db.trades.toCollection().primaryKeys()) as string[]);
      const trades = incoming.payload.trades.filter(trade => !present.has(trade.id)).map(restamp);
      const selected = new Set(trades.map(trade => trade.id));
      const plans = incoming.payload.tradePlans.filter(plan => selected.has(plan.tradeId)).map(plan => ({ ...plan }));
      const executions = incoming.payload.tradeExecutions.filter(execution => selected.has(execution.tradeId)).map(execution => ({ ...execution }));
      const fees = incoming.payload.tradeFees.filter(fee => selected.has(fee.tradeId)).map(fee => ({ ...fee }));
      const [planKeys, executionKeys, feeKeys, disciplineKeys] = await Promise.all([db.tradePlans.toCollection().primaryKeys(), db.tradeExecutions.toCollection().primaryKeys(), db.tradeFees.toCollection().primaryKeys(), db.tradeDiscipline.toCollection().primaryKeys()]);
      const presentDisciplineIds = new Set(disciplineKeys as string[]);
      const discipline = incoming.payload.tradeDiscipline.filter(record => selected.has(record.tradeId) && !presentDisciplineIds.has(record.id)).map(record => structuredClone(record));
      const conflict = plans.some(plan => (planKeys as string[]).includes(plan.id)) || executions.some(execution => (executionKeys as string[]).includes(execution.id)) || fees.some(fee => (feeKeys as string[]).includes(fee.id));
      return { trades, plans, executions, fees, discipline, conflict, alreadyPresent: incoming.payload.trades.length - trades.length };
    });
    if (selection.conflict) return { ok: false, type: 'identity-conflict', reason: 'child-id-present' };
    const preview: TradeImportPreview = Object.freeze({
      exportedAt: incoming.exportedAt,
      formatVersion: incoming.formatVersion,
      newTrades: selection.trades.filter(trade => trade.source === TRADE_IMPORT_SOURCE).length,
      newPracticeTrades: selection.trades.filter(trade => trade.source !== TRADE_IMPORT_SOURCE).length,
      alreadyPresent: selection.alreadyPresent,
      plans: selection.plans.length,
      executions: selection.executions.length,
      fees: selection.fees.length,
      discipline: selection.discipline.length,
    });
    return { ok: true, import: Object.freeze({ preview, trades: Object.freeze(selection.trades), plans: Object.freeze(selection.plans), executions: Object.freeze(selection.executions), fees: Object.freeze(selection.fees), discipline: Object.freeze(selection.discipline) }) };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'import-prepare-failed' };
  }
}

/**
 * P32.1 trade merge-import application command, step two: the confirmed write.
 * Every selected trade id is re-checked inside the transaction; a trade that
 * appeared meanwhile is skipped with its children, a child id that appeared
 * meanwhile refuses the whole import, and nothing already on the device is
 * ever replaced. A discipline record is added only for an added trade, and
 * only when neither its id nor its trade already has one here.
 */
export async function commitTradeImport(db: KairosDatabase, prepared: PreparedTradeImport): Promise<CommitTradeImportResult> {
  try {
    return await runKairosAtomicWrite(db, ['trades', 'tradePlans', 'tradeExecutions', 'tradeFees', 'tradeDiscipline'], async ({ repositories }): Promise<CommitTradeImportResult> => {
      const write = { trades: [] as DatabaseTradeRecord[], plans: [] as DatabaseTradePlanRecord[], executions: [] as DatabaseTradeExecutionRecord[], fees: [] as DatabaseTradeFeeRecord[], discipline: [] as TradeDisciplineRecord[] };
      let skipped = 0;
      for (const trade of prepared.trades) {
        if (await repositories.trades.get(trade.id)) { skipped += 1; continue; }
        write.trades.push(trade);
      }
      const selected = new Set(write.trades.map(trade => trade.id));
      for (const plan of prepared.plans) if (selected.has(plan.tradeId)) { if (await repositories.tradePlans.get(plan.id)) return { ok: false, type: 'identity-conflict', reason: 'child-id-present' }; write.plans.push(plan); }
      for (const execution of prepared.executions) if (selected.has(execution.tradeId)) { if (await repositories.tradeExecutions.get(execution.id)) return { ok: false, type: 'identity-conflict', reason: 'child-id-present' }; write.executions.push(execution); }
      for (const fee of prepared.fees) if (selected.has(fee.tradeId)) { if (await repositories.tradeFees.get(fee.id)) return { ok: false, type: 'identity-conflict', reason: 'child-id-present' }; write.fees.push(fee); }
      for (const record of prepared.discipline) {
        if (!selected.has(record.tradeId)) continue;
        if (await repositories.tradeDiscipline.get(record.id) || await repositories.tradeDiscipline.getByTradeId(record.tradeId)) continue;
        write.discipline.push(record);
      }
      for (const trade of write.trades) await repositories.trades.put(trade);
      for (const plan of write.plans) await repositories.tradePlans.put(plan);
      for (const execution of write.executions) await repositories.tradeExecutions.put(execution);
      for (const fee of write.fees) await repositories.tradeFees.put(fee);
      for (const record of write.discipline) await repositories.tradeDiscipline.put(record);
      return { ok: true, added: Object.freeze({ trades: write.trades.length, plans: write.plans.length, executions: write.executions.length, fees: write.fees.length, discipline: write.discipline.length }), skipped };
    });
  } catch {
    return { ok: false, type: 'storage-error', reason: 'import-commit-failed' };
  }
}
