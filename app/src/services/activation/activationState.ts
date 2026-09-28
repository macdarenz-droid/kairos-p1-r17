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
      if (event.result.reason === 'network-unavailable') {
        return {
          status: 'network-unavailable',
          receipt: state.receipt,
          message: 'Internet is required for first activation.',
        };
      }
      if (event.result.reason === 'service-error') {
        return {
          status: 'error',
          receipt: state.receipt,
          message: 'Activation service is temporarily unavailable.',
        };
      }
      return {
        status: 'rejected',
        receipt: null,
        message: 'This invite could not be activated.',
      };

    case 'RESTORE_VERIFIED_RECEIPT':
      return { status: 'active-online', receipt: event.receipt, message: null };

    case 'OFFLINE_WITH_VERIFIED_RECEIPT':
      return { status: 'active-offline', receipt: event.receipt, message: null };

    case 'CLEAR_ACTIVATION':
      return initialActivationSnapshot;
  }
}
