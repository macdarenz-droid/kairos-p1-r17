import { upgradeLegacyTradeDisciplineRecord } from '../../domain/discipline';
import { KAIROS_DB_SCHEMA_VERSION } from '../database/schema';
import { KAIROS_BACKUP_FORMAT_NAME, KAIROS_BACKUP_FORMAT_VERSION, type KairosBackupEnvelope, type KairosCurrentBackupEnvelope } from './backupFormat';
import { KairosBackupValidationError, validateKairosBackupEnvelope } from './backupValidation';
/**
 * Formats 1–11 become the current restore model (format 12, schema 14). Formats 5–6 discipline records are converted and
 * formats 7–11 copied; formats 9–11 exchange rates and formats 10–11 news events are copied, older formats carry none. Every
 * other record is copied as it is: no older trade carries U11's optional fields, no older discipline record U12's "Before
 * you save" note, and none is filled in (D237, D240, D243).
 */
function migrateToCurrent(envelope:KairosBackupEnvelope):KairosCurrentBackupEnvelope {
 if(envelope.formatVersion===KAIROS_BACKUP_FORMAT_VERSION)return envelope;
 const metadata=envelope.payload.metadata.map(record=>({...record}));
 const base=envelope.formatVersion===1?{metadata,trades:[],tradePlans:[],tradeExecutions:[],tradeFees:[],savedAnalyses:[],savedTimeAssistedSnapshots:[]}:envelope.formatVersion===2?{...envelope.payload,savedAnalyses:[],savedTimeAssistedSnapshots:[]}:envelope.formatVersion===3?{...envelope.payload,savedTimeAssistedSnapshots:[]}:envelope.payload;
 const tradeDiscipline=envelope.formatVersion===5||envelope.formatVersion===6?envelope.payload.tradeDiscipline.map(record=>upgradeLegacyTradeDisciplineRecord(structuredClone(record))):envelope.formatVersion===7||envelope.formatVersion===8||envelope.formatVersion===9||envelope.formatVersion===10||envelope.formatVersion===11?envelope.payload.tradeDiscipline.map(record=>structuredClone(record)):[];
 const exchangeRates=envelope.formatVersion===9||envelope.formatVersion===10||envelope.formatVersion===11?envelope.payload.exchangeRates.map(record=>({...record})):[];
 const economicEvents=envelope.formatVersion===10||envelope.formatVersion===11?envelope.payload.economicEvents.map(record=>structuredClone(record)):[];
 const payload=Object.freeze({metadata:Object.freeze(metadata),trades:Object.freeze(base.trades.map(record=>({...record}))),tradePlans:Object.freeze(base.tradePlans.map(record=>({...record}))),tradeExecutions:Object.freeze(base.tradeExecutions.map(record=>({...record}))),tradeFees:Object.freeze(base.tradeFees.map(record=>({...record}))),savedAnalyses:Object.freeze(base.savedAnalyses.map(record=>structuredClone(record))),savedTimeAssistedSnapshots:Object.freeze(base.savedTimeAssistedSnapshots.map(record=>structuredClone(record))),tradeDiscipline:Object.freeze(tradeDiscipline),exchangeRates:Object.freeze(exchangeRates),economicEvents:Object.freeze(economicEvents)});
 return Object.freeze({formatName:KAIROS_BACKUP_FORMAT_NAME,formatVersion:KAIROS_BACKUP_FORMAT_VERSION,appVersion:envelope.appVersion,buildId:envelope.buildId,exportedAt:envelope.exportedAt,databaseSchemaVersion:KAIROS_DB_SCHEMA_VERSION,recordCounts:Object.freeze({metadata:payload.metadata.length,trades:payload.trades.length,tradePlans:payload.tradePlans.length,tradeExecutions:payload.tradeExecutions.length,tradeFees:payload.tradeFees.length,savedAnalyses:payload.savedAnalyses.length,savedTimeAssistedSnapshots:payload.savedTimeAssistedSnapshots.length,tradeDiscipline:payload.tradeDiscipline.length,exchangeRates:payload.exchangeRates.length,economicEvents:payload.economicEvents.length,total:payload.metadata.length+payload.trades.length+payload.tradePlans.length+payload.tradeExecutions.length+payload.tradeFees.length+payload.savedAnalyses.length+payload.savedTimeAssistedSnapshots.length+payload.tradeDiscipline.length+payload.exchangeRates.length+payload.economicEvents.length}),payload});
}
export function serializeKairosBackup(envelope:KairosBackupEnvelope):string{validateKairosBackupEnvelope(envelope);return JSON.stringify(envelope);}
export function parseKairosBackup(serialized:string):KairosCurrentBackupEnvelope{let parsed:unknown;try{parsed=JSON.parse(serialized)}catch{throw new KairosBackupValidationError('INVALID_JSON','Backup is not valid JSON.')}const validated=validateKairosBackupEnvelope(parsed);const migrated=migrateToCurrent(validated);return validateKairosBackupEnvelope(migrated) as KairosCurrentBackupEnvelope;}
