import type { ActivationReceiptVerifier } from './ActivationReceiptVerifier';
import type { ActivationReceiptRepository } from './ActivationReceiptRepository';
import type { ActivationReceipt } from './activationTypes';

export type VerifiedPersistedActivationResult =
  | { readonly status: 'missing' }
  | { readonly status: 'corrupt'; readonly error: string }
  | { readonly status: 'rejected'; readonly reason: 'invalid-receipt' | 'unsupported-receipt-version' }
  | { readonly status: 'verification-unavailable' }
  | { readonly status: 'verified'; readonly receipt: ActivationReceipt };

/**
 * Restored bytes are never treated as activation authority by themselves.
 * The caller only receives an unlock-capable receipt after verifier approval.
 */
export async function loadVerifiedPersistedActivation(
  repository: ActivationReceiptRepository,
  verifier: ActivationReceiptVerifier,
): Promise<VerifiedPersistedActivationResult> {
  const stored = await repository.load();
  if (stored.status !== 'stored') return stored;

  const verification = await verifier.verifyReceipt(stored.receipt);
  if (verification.ok) {
    return { status: 'verified', receipt: { ...verification.receipt } };
  }
  if (verification.reason === 'verification-unavailable') {
    return { status: 'verification-unavailable' };
  }
  return { status: 'rejected', reason: verification.reason };
}
