/** T-054a: the backup words shared by the page and the reminder card. */

import type { BackupReminder } from './backupReminder';
import type { RunBackupResult } from './runBackup';

const plural = (count: number, noun: string, nouns = `${noun}s`): string => `${count} ${count === 1 ? noun : nouns}`;

/** "today", "1 day ago", "12 days ago". */
export function describeDaysAgo(days: number): string {
  return days === 0 ? 'today' : `${plural(days, 'day')} ago`;
}

/** The reminder card's sentence for why a backup is due. */
export function describeBackupReminder(reminder: BackupReminder): string {
  switch (reminder.reason) {
    case 'never': return 'No backup yet. Save a copy of your journal so you never lose it.';
    case 'old': return `Last backup ${describeDaysAgo(reminder.daysSince ?? 0)}.`;
    case 'many-trades': return `${plural(reminder.tradesSince, 'trade')} since your last backup.`;
    case null: return '';
  }
}

/** The words for a backup that did not happen (a cancelled share needs none). */
export function describeBackupFailure(result: Exclude<RunBackupResult, { ok: true }>): string | null {
  switch (result.reason) {
    case 'cancelled': return null;
    case 'delivery-failed': return 'Your browser did not take the backup file. Nothing was changed.';
    case 'record-failed': return 'The backup file was saved, but Kairos could not note when. Nothing else was changed.';
    case 'export-failed': {
      const failure = result.export;
      switch (failure.type) {
        case 'integrity-error': return `Kairos found a problem in your stored data (${failure.failedChecks.join(', ')}) and did not make a backup.`;
        case 'storage-error': return 'Kairos could not read your data. Nothing was saved.';
        case 'invalid-input': return 'The current time could not be read. Nothing was saved.';
      }
    }
  }
}
