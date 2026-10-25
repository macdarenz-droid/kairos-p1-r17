/**
 * T-062e: the invite screen's words (D281, D282), in one place. Each reason the server or the network gives has its
 * own sentence, instead of one sentence for all; "Lost access?" has its four steps; and a journal still on this device
 * says when it was last backed up.
 */
import type { ActivationSnapshot } from '../../services/activation';

/** D274: a code's devices unless the owner chose another number; used only where the server gave none. */
const USUAL_DEVICE_LIMIT = 3;

const devices = (count: number): string => `${count} ${count === 1 ? 'device' : 'devices'}`;

/** What went wrong with the last try, in plain words; null when nothing did. */
export function describeActivationProblem(snapshot: Pick<ActivationSnapshot, 'reason' | 'deviceLimit' | 'message'>): string | null {
  switch (snapshot.reason) {
    case 'invalid-code': return "Kairos doesn't know this code. Check it and try again.";
    case 'expired-code': return 'This code has expired. Ask the person who gave it to you for a new one.';
    case 'already-used': return snapshot.deviceLimit === undefined
      ? 'This code is already used on all its devices.'
      : `This code is already used on ${devices(snapshot.deviceLimit)}.`;
    case 'rate-limited': return 'Too many tries. Wait a minute, then try again.';
    case 'network-unavailable': return 'Kairos needs the internet to check your code the first time.';
    case 'service-error': return "Kairos couldn't check your code right now. Try again in a few minutes.";
    // This device's own checks (its storage, its saved proof) bring their own note.
    case undefined: return snapshot.message;
  }
}

/**
 * "Lost access? Here's what to do" (D281). The number is the code's own limit when the server named it, else the usual 3.
 * More › Profile › Your devices arrives with T-062f.
 */
export function lostAccessSteps(deviceLimit: number | undefined): readonly string[] {
  const limit = deviceLimit ?? USUAL_DEVICE_LIMIT;
  return [
    `Type your invite code again. One code works on up to ${devices(limit)}.`,
    'Kairos opens with an empty journal. To bring yours back: More › Backup and restore › Replace everything with a backup, then choose your latest backup file.',
    `All ${limit} in use? On a device you still use: More › Profile › Your devices › Remove. No device left? Ask the person who gave you the code to free one.`,
    "Your journal lives only on your devices and in your backup files. The Kairos server never has a copy. Add Kairos to your Home Screen and keep a backup, so this doesn't happen again.",
  ];
}

/** This device's journal, as the invite screen reads it (built in main.tsx from loadBackupReminder). */
export interface JournalOnThisDevice {
  /** When the last backup was made on this device (UTC ISO), or null when there was none. */
  readonly lastBackupAt: string | null;
  /** Trades created after that backup; every trade when there was none. */
  readonly tradesSince: number;
  /** The saved time zone the date is shown in; null: the phone's. */
  readonly timeZone: string | null;
}

/** Whether there is a journal worth a copy: trades not yet backed up, or a backup made before. */
export function hasJournal(journal: JournalOnThisDevice): boolean {
  return journal.tradesSince > 0 || journal.lastBackupAt !== null;
}

/**
 * "3 Oct", day first as in D281's words, in the saved time zone, else the phone's (also for a saved zone this browser
 * doesn't know).
 */
function shortDay(iso: string, timeZone: string | null): string {
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  try {
    return new Intl.DateTimeFormat('en-GB', timeZone === null ? options : { ...options, timeZone }).format(new Date(iso));
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).format(new Date(iso));
  }
}

const tradesSince = (count: number): string => (count === 0 ? 'no trades since' : count === 1 ? '1 trade since' : `${count} trades since`);

/** "Your journal is still on this device. Last backup: 3 Oct (12 trades since)." or "… No backup yet." (D281). */
export function describeJournalOnThisDevice(journal: JournalOnThisDevice): string {
  const backup = journal.lastBackupAt === null
    ? 'No backup yet.'
    : `Last backup: ${shortDay(journal.lastBackupAt, journal.timeZone)} (${tradesSince(journal.tradesSince)}).`;
  return `Your journal is still on this device. ${backup}`;
}
