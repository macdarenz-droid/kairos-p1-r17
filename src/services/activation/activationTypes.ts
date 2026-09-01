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
}

export interface ActivationReceipt {
  receiptVersion: 1;
  activationId: string;
  issuedAt: string;
  verifierPayload: string;
  verifierSignature: string;
}

export type ActivationValidationResult =
  | { ok: true; receipt: ActivationReceipt }
  | { ok: false; reason: 'invalid-code' | 'expired-code' | 'already-used' | 'rate-limited' }
  | { ok: false; reason: 'network-unavailable' | 'service-error' };

export interface ActivationSnapshot {
  status: ActivationStatus;
  receipt: ActivationReceipt | null;
  message: string | null;
}
