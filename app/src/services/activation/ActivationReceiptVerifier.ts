import type { ActivationReceipt } from './activationTypes';

export type ActivationReceiptVerificationResult =
  | { readonly ok: true; readonly receipt: ActivationReceipt }
  | { readonly ok: false; readonly reason: 'invalid-receipt' | 'unsupported-receipt-version' | 'verification-unavailable' };

/**
 * Replaceable proof-verification boundary.
 * A stored receipt must pass this boundary again before it can unlock offline use.
 */
export interface ActivationReceiptVerifier {
  verifyReceipt(receipt: ActivationReceipt): Promise<ActivationReceiptVerificationResult>;
}
