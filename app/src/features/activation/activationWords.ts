/**
 * T-062e: the invite screen's words (D281, D282), in one place. Each reason the server or the network gives has its
 * own sentence, instead of one sentence for all; "Lost access?" has its four steps; and a journal still on this device
 * says when it was last backed up.
 * T-062f: the words when the daily check ends this device's invite (D278), and Profile's "This device is activated"
 * line and "Your devices" card (D283). Never "activation receipt", "activation id" or "revoked" on screen.
 */
import type { ActivationDevice, ActivationDeviceList, ActivationEnded, ActivationSnapshot } from '../../services/activation';

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
    // D278: the daily check ended this device's invite, and this start found no receipt.
    case 'device-removed': return 'This device was removed from your invite code. Your journal is still on this device.';
    case 'code-revoked': return 'This invite code no longer works.';
    // This device's own checks (its storage, its saved proof) bring their own note.
    case undefined: return snapshot.message;
  }
}

/**
 * D278: the note when the daily check ends this device's invite during a session. The session carries on; the next
 * start asks for a code.
 */
export function describeSessionEnded(ended: ActivationEnded): string {
  return ended === 'removed'
    ? 'This device was removed from your invite code. Kairos will ask for your code the next time it opens. Your journal stays on this device.'
    : 'This invite code no longer works. Kairos will ask for an invite code the next time it opens. Your journal stays on this device.';
}

/**
 * "Lost access? Here's what to do" (D281). The number is the code's own limit when the server named it, else the usual 3.
 * A code for one device gets its own words: its one place can't be freed from that same device (a device never removes
 * itself, D277), so only the person who gave the code can free it.
 */
export function lostAccessSteps(deviceLimit: number | undefined): readonly string[] {
  const limit = deviceLimit ?? USUAL_DEVICE_LIMIT;
  const oneDevice = limit === 1;
  return [
    oneDevice
      ? 'Type your invite code again. This code works on one device only.'
      : `Type your invite code again. One code works on up to ${devices(limit)}.`,
    'Kairos opens with an empty journal. To bring yours back: More › Backup and restore › Replace everything with a backup, then choose your latest backup file.',
    oneDevice
      ? 'Already in use on another device? Ask the person who gave you the code to free it.'
      : `All ${limit} in use? On a device you still use: More › Profile › Your devices › Remove. No device left? Ask the person who gave you the code to free one.`,
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

const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
const DAY_MONTH_YEAR: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' };
const YEAR: Intl.DateTimeFormatOptions = { year: 'numeric' };

/** Day first, as in D281's words, in the saved time zone, else the phone's (also for a saved zone this browser doesn't know). */
function formatIn(at: Date, options: Intl.DateTimeFormatOptions, timeZone: string | null): string {
  try {
    return new Intl.DateTimeFormat('en-GB', timeZone === null ? options : { ...options, timeZone }).format(at);
  } catch {
    return new Intl.DateTimeFormat('en-GB', options).format(at);
  }
}

/** "3 Oct". */
function shortDay(iso: string, timeZone: string | null): string {
  return formatIn(new Date(iso), DAY_MONTH, timeZone);
}

/** "3 Oct", with the year when it isn't the year of `now` ("3 Oct 2025"); with `now` null, always with the year. */
function dayOf(at: Date, timeZone: string | null, now: Date | null): string {
  const withYear = now === null || formatIn(at, YEAR, timeZone) !== formatIn(now, YEAR, timeZone);
  return formatIn(at, withYear ? DAY_MONTH_YEAR : DAY_MONTH, timeZone);
}

const tradesSince = (count: number): string => (count === 0 ? 'no trades since' : count === 1 ? '1 trade since' : `${count} trades since`);

/** "Last backup: 3 Oct (12 trades since)." or "No backup yet.": alone where D278's words already say the journal is here. */
export function describeLastBackup(journal: JournalOnThisDevice): string {
  return journal.lastBackupAt === null
    ? 'No backup yet.'
    : `Last backup: ${shortDay(journal.lastBackupAt, journal.timeZone)} (${tradesSince(journal.tradesSince)}).`;
}

/** "Your journal is still on this device. Last backup: 3 Oct (12 trades since)." or "… No backup yet." (D281). */
export function describeJournalOnThisDevice(journal: JournalOnThisDevice): string {
  return `Your journal is still on this device. ${describeLastBackup(journal)}`;
}

/** Profile's "This device" card (D283): "This device is activated (since 3 Oct 2026).", from when the server activated it. */
export function describeActivatedSince(issuedAt: string, timeZone: string | null): string {
  return `This device is activated (since ${dayOf(new Date(issuedAt), timeZone, null)}).`;
}

/** "This code is used on 2 of 3 devices.": the Worker's count (D274), never one Kairos makes up. */
export function describeDevicesUsed(list: Pick<ActivationDeviceList, 'used' | 'limit'>): string {
  return `This code is used on ${list.used} of ${devices(list.limit)}.`;
}

/**
 * One device's row (D283): "since 3 Oct · last used 20 Oct", or "last used today". "Since" is shown in the saved time
 * zone (else the phone's). "Last used" is the server's day, which is a UTC day and not a time, so it is shown as that
 * day and is "today" when it is today's UTC day. A day the server doesn't know yet says "unavailable".
 */
export function describeDeviceDetails(device: Pick<ActivationDevice, 'since' | 'lastSeenOn'>, now: Date, timeZone: string | null): string {
  const since = `since ${dayOf(new Date(device.since), timeZone, now)}`;
  if (device.lastSeenOn === null) return `${since} · last used: unavailable`;
  const lastUsed = device.lastSeenOn === now.toISOString().slice(0, 10) ? 'today' : dayOf(new Date(`${device.lastSeenOn}T12:00:00.000Z`), 'UTC', now);
  return `${since} · last used ${lastUsed}`;
}

/** "Remove asks first" (D283): the question and what happens to that device. */
export function describeRemoveQuestion(label: string): Readonly<{ title: string; message: string }> {
  return {
    title: `Remove ${label}?`,
    message: 'It goes back to the invite screen the next time it opens online. Its journal stays on it.',
  };
}

/** "Your devices" (D283): its fixed sentences. Offline or failed, it says so with "Try again", never a count of 0. */
export const YOUR_DEVICES_WORDS = Object.freeze({
  title: 'Your devices',
  reading: 'Reading your devices…',
  unavailable: 'Your devices are unavailable right now.',
  notActivated: "This device isn't activated, so Kairos can't show your devices.",
  thisDevice: 'This device',
  remove: 'Remove',
  keep: 'Keep it',
});

/** "Your devices" when the server says this device itself is out (D278): the daily check will end it; nothing is lost. */
export function describeDevicesEnded(ended: ActivationEnded): string {
  return ended === 'removed'
    ? 'This device was removed from your invite code. Your journal stays on this device.'
    : 'This invite code no longer works. Your journal stays on this device.';
}

/** A removal that didn't happen: nothing changed, and the trader can tap Remove again. */
export function describeRemoveFailed(label: string): string {
  return `Kairos couldn't remove ${label} right now. Nothing was changed. Try again in a moment.`;
}
