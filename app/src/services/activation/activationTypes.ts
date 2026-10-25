export type ActivationStatus =
  | 'activation-required'
  | 'validating'
  | 'active-online'
  | 'active-offline'
  | 'rejected'
  | 'network-unavailable'
  | 'error';

export interface ActivationRequest {
  inviteCode: string;
  appVersion: string;
  buildId: string;
  /**
   * D275: one id per code, kept through retries until the code works (ActivationCoordinator), so a retry after a lost
   * answer gets the same device back instead of using another place. Old builds send none.
   */
  requestId?: string;
  /** D275: this device's coarse name from the Worker's fixed list (describeThisDevice); none reads as "Other device". */
  deviceLabel?: string;
}

export interface ActivationReceipt {
  receiptVersion: 1;
  activationId: string;
  issuedAt: string;
  verifierPayload: string;
  verifierSignature: string;
}

/** Why a try did not open Kairos (D281). The words for each are the gate's (features/activation/activationWords.ts). */
export type ActivationRefusalReason =
  | 'invalid-code'
  | 'expired-code'
  | 'already-used'
  | 'rate-limited'
  | 'network-unavailable'
  | 'service-error'
  /** D278: the daily check heard that this device was removed from its code, and this start found no receipt. */
  | 'device-removed'
  /** D278: the same, for a code the owner has stopped. */
  | 'code-revoked';

export type ActivationValidationResult =
  | { ok: true; receipt: ActivationReceipt }
  | { ok: false; reason: 'invalid-code' | 'expired-code' | 'rate-limited' }
  /** `deviceLimit`: how many devices the code allows, when the server said (D274: 1 to 10). */
  | { ok: false; reason: 'already-used'; deviceLimit?: number }
  | { ok: false; reason: 'network-unavailable' | 'service-error' };

export interface ActivationSnapshot {
  status: ActivationStatus;
  receipt: ActivationReceipt | null;
  /** A note for a state without a `reason` (this device's own storage or proof check); null when there is none. */
  message: string | null;
  /** Why the last try did not open Kairos; absent when nothing was refused. */
  reason?: ActivationRefusalReason;
  /** With `already-used`: how many devices the code allows, when the server said. */
  deviceLimit?: number;
}

/** What the activation Worker's /devices/check says about this device (D278). */
export type ActivationDeviceStatus = 'active' | 'removed' | 'revoked';

/** Why this device's invite ended: it was removed from its code, or the code was stopped (D278). */
export type ActivationEnded = Exclude<ActivationDeviceStatus, 'active'>;

/** One device of this device's invite code, as /devices lists it (D277). Other devices are named by their row number only. */
export interface ActivationDevice {
  readonly id: number;
  /** A name from the Worker's fixed list (describeThisDevice.ts), never free text. */
  readonly label: string;
  /** When it was activated (UTC ISO). */
  readonly since: string;
  /** The last day it checked in (the server's UTC day, YYYY-MM-DD), or null when the server doesn't know yet. */
  readonly lastSeenOn: string | null;
  readonly thisDevice: boolean;
}

/** "Used on 2 of 3 devices": counted by the Worker (D274), only shown here. */
export interface ActivationDeviceList {
  readonly used: number;
  readonly limit: number;
  readonly devices: readonly ActivationDevice[];
}

/**
 * Why a device route gave no answer Kairos can use. `device-not-recognised`: the server doesn't know this device or its
 * token. `device-removed` and `code-revoked`: this device itself is out (D278). `service-error` also covers an answer
 * Kairos can't read.
 */
export type ActivationDeviceFailure =
  | 'device-not-recognised'
  | 'device-removed'
  | 'code-revoked'
  | 'rate-limited'
  | 'network-unavailable'
  | 'service-error';

export type ActivationDeviceListResult =
  | Readonly<{ ok: true; list: ActivationDeviceList }>
  | Readonly<{ ok: false; reason: ActivationDeviceFailure }>;

export type ActivationDeviceRemoveResult =
  | Readonly<{ ok: true }>
  /** `device-not-found`: not a device of this code (gone already, or never one). */
  | Readonly<{ ok: false; reason: ActivationDeviceFailure | 'device-not-found' | 'cannot-remove-this-device' }>;

export type ActivationDeviceCheckResult =
  | Readonly<{ ok: true; status: ActivationDeviceStatus }>
  | Readonly<{ ok: false; reason: Exclude<ActivationDeviceFailure, 'device-removed' | 'code-revoked'> }>;

/**
 * The daily check's own record on this device, metadata key `device.activation.check.v1` (D285): when it last heard an
 * answer, and whether that answer ended this device's invite. Device-only: never in a backup, kept by a restore.
 */
export interface ActivationCheckRecord {
  readonly version: 1;
  /** When this device last heard /devices/check's answer (UTC ISO). */
  readonly checkedAt: string;
  readonly ended: ActivationEnded | null;
}

/** What one call to the daily check did (ActivationCoordinator.checkThisDevice). */
export type ActivationCheckOutcome =
  /** Not asked: offline, hidden, not active, nothing to ask with, or a check is already running. */
  | 'skipped'
  /** Not asked: the last answer came less than 24 hours ago. */
  | 'not-due'
  /** The server knows this device and it is in use; the time was saved. */
  | 'active'
  /** This device's invite ended: its receipt is gone and the reason is saved. The open session carries on. */
  | ActivationEnded
  /** A failed or unreadable answer, a device the server doesn't know, or a save that failed: nothing changed. */
  | 'unchanged';
