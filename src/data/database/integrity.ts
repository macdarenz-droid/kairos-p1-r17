import type { KairosDatabase } from './KairosDatabase';
import { KAIROS_DB_SCHEMA_VERSION, KAIROS_V2_STORES } from './schema';
import { validateTradeRecord, parsePositiveDecimalString } from '../../domain/trades';

export type DatabaseIntegrityCheckId = 'database-open'|'schema-version'|'store-set'|'metadata-primary-key'|'metadata-record-shape'|'trade-primary-keys'|'trade-record-shape'|'trade-reference-integrity';
export interface DatabaseIntegrityCheck { readonly id: DatabaseIntegrityCheckId; readonly ok: boolean; readonly detail: string; }
export interface DatabaseIntegrityReport { readonly ok:boolean; readonly schemaVersion:number; readonly checkedAt:string; readonly metadataRecordCount:number; readonly tradeRecordCount:number; readonly checks:readonly DatabaseIntegrityCheck[]; }
export class DatabaseIntegrityError extends Error { constructor(public readonly report:DatabaseIntegrityReport){ const failed=report.checks.filter(c=>!c.ok).map(c=>c.id).join(', '); super(`Kairos database integrity check failed: ${failed || 'unknown invariant'}.`); this.name='DatabaseIntegrityError'; } }
const check=(id:DatabaseIntegrityCheckId,ok:boolean,detail:string):DatabaseIntegrityCheck=>Object.freeze({id,ok,detail});
function iso(v:unknown):v is string { if(typeof v!=='string'||!v)return false; const p=Date.parse(v); return Number.isFinite(p)&&new Date(p).toISOString()===v; }
function metadata(v:unknown){ if(typeof v!=='object'||v===null||Array.isArray(v))return false; const x=v as Record<string,unknown>; return typeof x.key==='string'&&!!x.key&&typeof x.value==='string'&&iso(x.updatedAt); }
export async function inspectKairosDatabaseIntegrity(db:KairosDatabase):Promise<DatabaseIntegrityReport>{
 const checks:DatabaseIntegrityCheck[]=[]; const open=db.isOpen(); checks.push(check('database-open',open,open?'Database connection is open.':'Database connection is not open.'));
 checks.push(check('schema-version',db.verno===KAIROS_DB_SCHEMA_VERSION,`Expected schema v${KAIROS_DB_SCHEMA_VERSION}; found v${db.verno}.`));
 const names=db.tables.map(t=>t.name).sort(); const expected=Object.keys(KAIROS_V2_STORES).sort(); checks.push(check('store-set',JSON.stringify(names)===JSON.stringify(expected),`Expected ${expected.join(', ')}; found ${names.join(', ')||'none'}.`));
 const mt=db.tables.find(t=>t.name==='metadata'); checks.push(check('metadata-primary-key',mt?.schema.primKey.keyPath==='key',`Expected metadata primary key "key"; found ${String(mt?.schema.primKey.keyPath??'missing')}.`));
 const tradeTables=['trades','tradePlans','tradeExecutions','tradeFees'].map(n=>db.tables.find(t=>t.name===n)); checks.push(check('trade-primary-keys',tradeTables.every(t=>t?.schema.primKey.keyPath==='id'),'All trade stores must use stable id primary keys.'));
 let metadataRecordCount=0, tradeRecordCount=0; let metadataOk=false, shapeOk=false, refsOk=false;
 if(open&&mt&&tradeTables.every(Boolean)){
   const ms=await mt.toArray(); metadataRecordCount=ms.length; metadataOk=ms.every(metadata);
   const trades=await db.trades.toArray(), plans=await db.tradePlans.toArray(), executions=await db.tradeExecutions.toArray(), fees=await db.tradeFees.toArray(); tradeRecordCount=trades.length;
   shapeOk=trades.every(t=>validateTradeRecord(t).ok)&&plans.every(p=>p.plannedQuantity===null||parsePositiveDecimalString(p.plannedQuantity).ok)&&executions.every(e=>parsePositiveDecimalString(e.price).ok&&parsePositiveDecimalString(e.quantity).ok)&&fees.every(f=>parsePositiveDecimalString(f.amount).ok);
   const ids=new Set(trades.map(t=>t.id)); const execIds=new Set(executions.map(e=>e.id)); refsOk=plans.every(p=>ids.has(p.tradeId))&&executions.every(e=>ids.has(e.tradeId))&&fees.every(f=>ids.has(f.tradeId)&&(f.executionId===null||execIds.has(f.executionId)));
 }
 checks.push(check('metadata-record-shape',metadataOk,metadataOk?`Validated ${metadataRecordCount} metadata record(s).`:'Metadata record contract failed.'));
 checks.push(check('trade-record-shape',shapeOk,shapeOk?'Trade persistence record shapes are valid.':'Trade persistence record shape failed.'));
 checks.push(check('trade-reference-integrity',refsOk,refsOk?'Trade references are internally consistent.':'Trade reference integrity failed.'));
 return Object.freeze({ok:checks.every(c=>c.ok),schemaVersion:db.verno,checkedAt:new Date().toISOString(),metadataRecordCount,tradeRecordCount,checks:Object.freeze(checks)});
}
export async function assertKairosDatabaseIntegrity(db:KairosDatabase){const report=await inspectKairosDatabaseIntegrity(db);if(!report.ok)throw new DatabaseIntegrityError(report);return report;}
