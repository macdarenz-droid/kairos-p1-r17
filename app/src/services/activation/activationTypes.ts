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
  | 'service-error';

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
