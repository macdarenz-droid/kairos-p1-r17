/** T-054a: the backup words shared by the page and the reminder card (and, T-062e, the crash screen and the invite screen). */

import type { BackupReminder } from './backupReminder';
import type { RunBackupResult } from './runBackup';

const plural = (count: number, noun: string, nouns = `${noun}s`): string => `${count} ${count === 1 ? noun : nouns}`;

/** "today", "yesterday", "12 days ago" (calendar days in the saved time zone). */
export function describeDaysAgo(days: number): string {
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : `${plural(days, 'day')} ago`;
}

/** The reminder card's sentence for why a backup is due. */
export function describeBackupReminder(reminder: BackupReminder): string {
  switch (reminder.reason) {
    case 'never': return 'No backup yet. Save a copy of your journal so you never lose it.';
    case 'old': return `Last backup ${describeDaysAgo(reminder.calendarDaysSince ?? reminder.daysSince ?? 0)}.`;
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

/**
 * The words after "Download a copy of my data" (D230), on the crash screen and the invite screen (D281). `failed` marks
 * a copy that was not made; a file that was handed over but not noted is not a failure.
 */
export function describeDataCopy(result: RunBackupResult): Readonly<{ message: string; failed: boolean }> {
  if (result.ok) return { message: `Downloaded ${result.file.fileName}.`, failed: false };
  if (result.reason === 'record-failed') return { message: describeBackupFailure(result) ?? '', failed: false };
  return { message: 'Kairos could not make a copy. Nothing was changed.', failed: true };
}
