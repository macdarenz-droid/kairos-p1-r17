import type { ActivationAdapter } from './ActivationAdapter';
import type { ActivationReceiptRepository } from './ActivationReceiptRepository';
import type { ActivationReceiptVerifier } from './ActivationReceiptVerifier';
import { loadVerifiedPersistedActivation } from './activationPersistence';
import {
  initialActivationSnapshot,
  reduceActivationState,
} from './activationState';
import type {
  ActivationRequest,
  ActivationSnapshot,
  ActivationValidationResult,
} from './activationTypes';

export interface ActivationCoordinatorDependencies {
  readonly adapter: ActivationAdapter;
  readonly repository: ActivationReceiptRepository;
  readonly verifier: ActivationReceiptVerifier;
}

const REACTIVATE_MESSAGE = 'Activation needs to be completed again.';
const VERIFY_UNAVAILABLE_MESSAGE = 'Activation verification is temporarily unavailable.';
const SAVE_FAILED_MESSAGE = 'Activation could not be saved on this device.';

/**
 * Application-layer owner for activation startup and first-activation sequencing.
 * Server approval is accepted only after proof verification and a successful local save.
 */
export class ActivationCoordinator {
  private snapshot: ActivationSnapshot = initialActivationSnapshot;
  private validationInFlight = false;

  constructor(private readonly dependencies: ActivationCoordinatorDependencies) {}

  getSnapshot(): ActivationSnapshot {
    return {
      ...this.snapshot,
      receipt: this.snapshot.receipt ? { ...this.snapshot.receipt } : null,
    };
  }

  async bootstrap(): Promise<ActivationSnapshot> {
    try {
      const restored = await loadVerifiedPersistedActivation(
        this.dependencies.repository,
        this.dependencies.verifier,
      );

      switch (restored.status) {
        case 'verified':
          this.snapshot = reduceActivationState(this.snapshot, {
            type: 'OFFLINE_WITH_VERIFIED_RECEIPT',
            receipt: restored.receipt,
          });
          break;
        case 'verification-unavailable':
          this.snapshot = {
            status: 'error',
            receipt: null,
            message: VERIFY_UNAVAILABLE_MESSAGE,
          };
          break;
        case 'missing':
          this.snapshot = initialActivationSnapshot;
          break;
        case 'corrupt':
        case 'rejected':
          this.snapshot = {
            status: 'activation-required',
            receipt: null,
            message: REACTIVATE_MESSAGE,
          };
          break;
      }
    } catch {
      this.snapshot = {
        status: 'error',
        receipt: null,
        message: 'Activation state could not be loaded.',
      };
    }

    return this.getSnapshot();
  }

  async activate(
    request: ActivationRequest,
    options?: { readonly signal?: AbortSignal },
  ): Promise<ActivationSnapshot> {
    if (this.validationInFlight) return this.getSnapshot();

    this.validationInFlight = true;
    this.snapshot = reduceActivationState(this.snapshot, { type: 'START_VALIDATION' });

    try {
      const remoteResult = await this.dependencies.adapter.validateInvite(request, options);
      if (!remoteResult.ok) {
        this.snapshot = reduceActivationState(this.snapshot, {
          type: 'VALIDATION_FINISHED',
          result: remoteResult,
        });
        return this.getSnapshot();
      }

      const proofResult = await this.dependencies.verifier.verifyReceipt(remoteResult.receipt);
      if (!proofResult.ok) {
        this.snapshot = proofFailureSnapshot(proofResult.reason);
        return this.getSnapshot();
      }

      try {
        await this.dependencies.repository.saveServerIssuedReceipt(proofResult.receipt);
      } catch {
        this.snapshot = {
          status: 'error',
          receipt: null,
          message: SAVE_FAILED_MESSAGE,
        };
        return this.getSnapshot();
      }

      const verifiedSuccess: ActivationValidationResult = {
        ok: true,
        receipt: proofResult.receipt,
      };
      this.snapshot = reduceActivationState(this.snapshot, {
        type: 'VALIDATION_FINISHED',
        result: verifiedSuccess,
      });
      return this.getSnapshot();
    } finally {
      this.validationInFlight = false;
    }
  }

  async clearActivation(): Promise<ActivationSnapshot> {
    await this.dependencies.repository.clear();
    this.snapshot = reduceActivationState(this.snapshot, { type: 'CLEAR_ACTIVATION' });
    return this.getSnapshot();
  }
}

function proofFailureSnapshot(
  reason: 'invalid-receipt' | 'unsupported-receipt-version' | 'verification-unavailable',
): ActivationSnapshot {
  if (reason === 'verification-unavailable') {
    return {
      status: 'error',
      receipt: null,
      message: VERIFY_UNAVAILABLE_MESSAGE,
    };
  }

  return {
    status: 'error',
    receipt: null,
    message: 'Activation service returned an invalid proof.',
  };
}
