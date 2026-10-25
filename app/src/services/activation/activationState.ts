import type {
  ActivationReceipt,
  ActivationSnapshot,
  ActivationValidationResult,
} from './activationTypes';

export type ActivationEvent =
  | { type: 'START_VALIDATION' }
  | { type: 'VALIDATION_FINISHED'; result: ActivationValidationResult }
  | { type: 'RESTORE_VERIFIED_RECEIPT'; receipt: ActivationReceipt }
  | { type: 'OFFLINE_WITH_VERIFIED_RECEIPT'; receipt: ActivationReceipt }
  | { type: 'CLEAR_ACTIVATION' };

export const initialActivationSnapshot: ActivationSnapshot = Object.freeze({
  status: 'activation-required',
  receipt: null,
  message: null,
});

export function reduceActivationState(
  state: ActivationSnapshot,
  event: ActivationEvent,
): ActivationSnapshot {
  switch (event.type) {
    case 'START_VALIDATION':
      return { status: 'validating', receipt: state.receipt, message: null };

    case 'VALIDATION_FINISHED':
      if (event.result.ok) {
        return { status: 'active-online', receipt: event.result.receipt, message: null };
      }
      // D281: each reason has its own words, which the gate owns (activationWords.ts); the snapshot carries the reason.
      if (event.result.reason === 'network-unavailable') {
        return { status: 'network-unavailable', receipt: state.receipt, message: null, reason: 'network-unavailable' };
      }
      if (event.result.reason === 'service-error') {
        return { status: 'error', receipt: state.receipt, message: null, reason: 'service-error' };
      }
      if (event.result.reason === 'already-used' && event.result.deviceLimit !== undefined) {
        return { status: 'rejected', receipt: null, message: null, reason: 'already-used', deviceLimit: event.result.deviceLimit };
      }
      return { status: 'rejected', receipt: null, message: null, reason: event.result.reason };

    case 'RESTORE_VERIFIED_RECEIPT':
      return { status: 'active-online', receipt: event.receipt, message: null };

    case 'OFFLINE_WITH_VERIFIED_RECEIPT':
      return { status: 'active-offline', receipt: event.receipt, message: null };

    case 'CLEAR_ACTIVATION':
      return initialActivationSnapshot;
  }
}
