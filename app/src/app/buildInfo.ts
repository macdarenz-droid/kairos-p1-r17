import { KAIROS_BACKUP_FORMAT_VERSION } from '../data/backup/backupFormat';
import { KAIROS_DB_SCHEMA_VERSION } from '../data/database/schema';

export const APP_VERSION = __KAIROS_APP_VERSION__;
export const BUILD_ID = import.meta.env.VITE_BUILD_ID?.trim() || 'dev-local';

export const buildInfo = Object.freeze({
  appName: 'Kairos Trading Journal',
  appVersion: APP_VERSION,
  buildId: BUILD_ID,
  databaseSchemaVersion: KAIROS_DB_SCHEMA_VERSION,
  backupFormatVersion: KAIROS_BACKUP_FORMAT_VERSION,
});
