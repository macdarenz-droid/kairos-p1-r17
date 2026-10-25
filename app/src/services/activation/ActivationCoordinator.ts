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
  /** This device's name from the Worker's fixed list (describeThisDevice, D275); without it the server reads "Other device". */
  readonly deviceLabel?: string;
  /** A new request id: 8 to 64 letters, digits and dashes (the Worker's rule). Tests pass their own. */
  readonly newRequestId?: () => string;
}

/** 128 random bits as 32 hex digits. getRandomValues works in every browser Kairos runs in, secure page or not. */
function randomRequestId(): string {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Which tries count as "the same code" for keeping a request id: case, spaces and dashes are ignored, so a retyped code
 * keeps its id. Only the Worker decides which code was typed (D280); it looks a request id up within that code only.
 */
function sameCodeKey(inviteCode: string): string {
  return inviteCode.replace(/[\s-]+/g, '').toUpperCase();
}

// Notes for this device's own checks; refusals from the server carry a `reason` instead (D281).
const REACTIVATE_MESSAGE = 'Type your invite code again to open Kairos on this device.';
const VERIFY_UNAVAILABLE_MESSAGE = "Kairos couldn't check this device's invite right now. Close Kairos and open it again.";
const SAVE_FAILED_MESSAGE = 'Activation could not be saved on this device.';

/**
 * Application-layer owner for activation startup and first-activation sequencing.
 * Server approval is accepted only after proof verification and a successful local save.
 */
export class ActivationCoordinator {
  private snapshot: ActivationSnapshot = initialActivationSnapshot;
  private validationInFlight = false;
  /**
   * D275: the request id for the code being tried. Kept through retries of the same code, so an answer lost on a slow
   * network never costs a second place; replaced for another code, and dropped once the code has worked.
   */
  private pendingRequest: { readonly codeKey: string; readonly requestId: string } | null = null;

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
        message: "Kairos couldn't read this device's invite. Close Kairos and open it again.",
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
      const remoteResult = await this.dependencies.adapter.validateInvite(this.withDevice(request), options);
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

      // Saved on this device: the next code starts a new request.
      this.pendingRequest = null;
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

  /** The request as posted: the code's request id (D275) and this device's name. */
  private withDevice(request: ActivationRequest): ActivationRequest {
    const codeKey = sameCodeKey(request.inviteCode);
    if (this.pendingRequest?.codeKey !== codeKey) {
      this.pendingRequest = { codeKey, requestId: (this.dependencies.newRequestId ?? randomRequestId)() };
    }
    const { deviceLabel } = this.dependencies;
    return { ...request, requestId: this.pendingRequest.requestId, ...(deviceLabel === undefined ? {} : { deviceLabel }) };
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

  // A receipt that fails its check is an answer Kairos can't read: the server's problem, in the server's words (D281).
  return {
    status: 'error',
    receipt: null,
    message: null,
    reason: 'service-error',
  };
}
