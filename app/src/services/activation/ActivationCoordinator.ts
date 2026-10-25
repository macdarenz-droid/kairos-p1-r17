import type { ActivationAdapter, ActivationDevicesAdapter } from './ActivationAdapter';
import type { ActivationReceiptRepository } from './ActivationReceiptRepository';
import type { ActivationReceiptVerifier } from './ActivationReceiptVerifier';
import { loadVerifiedPersistedActivation } from './activationPersistence';
import { inviteCodeKey } from './inviteCode';
import {
  initialActivationSnapshot,
  reduceActivationState,
} from './activationState';
import type {
  ActivationCheckOutcome,
  ActivationCheckRecord,
  ActivationEnded,
  ActivationRequest,
  ActivationSnapshot,
  ActivationValidationResult,
} from './activationTypes';
import { kairosDeviceToken } from './deviceToken';

/**
 * D285: the daily check's record on this device (`device.activation.check.v1`). The application layer keeps it
 * (`application/activation/activationCheck.ts`), so each write is one atomic metadata write; the coordinator decides
 * when to ask and what an answer means.
 */
export interface ActivationCheckStore {
  /** The record, or null when there is none or it is damaged (read as never checked). Throws when it can't be read. */
  load(): Promise<ActivationCheckRecord | null>;
  /** The server knows this device and it is in use: the time of the answer, and no `ended`. */
  saveActive(checkedAt: string): Promise<void>;
  /** One atomic metadata write: this device's receipt is deleted and why is saved (D278). */
  endThisDevice(ended: ActivationEnded, checkedAt: string): Promise<void>;
  /** A new activation: `ended` goes, and the time of the last answer stays. */
  clearEnded(): Promise<void>;
}

export interface ActivationCoordinatorDependencies {
  readonly adapter: ActivationAdapter;
  readonly repository: ActivationReceiptRepository;
  readonly verifier: ActivationReceiptVerifier;
  /** This device's name from the Worker's fixed list (describeThisDevice, D275); without it the server reads "Other device". */
  readonly deviceLabel?: string;
  /** A new request id: 8 to 64 letters, digits and dashes (the Worker's rule). Tests pass their own. */
  readonly newRequestId?: () => string;
  /** D278: the Worker's /devices/check. Without it (or `checks`), this device is never checked. */
  readonly devices?: Pick<ActivationDevicesAdapter, 'checkDevice'>;
  /** D285: where the daily check keeps its record. */
  readonly checks?: ActivationCheckStore;
}

/** What the daily check needs to know about this moment: the time, and whether the device is online and Kairos is on screen. */
export interface ActivationCheckInput {
  readonly now: Date;
  readonly online: boolean;
  readonly visible: boolean;
}

/** D278: at most one check a day. */
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Due when never answered, a day or more ago, or (a clock moved back) in the future. */
function isCheckDue(record: ActivationCheckRecord | null, now: Date): boolean {
  if (record === null) return true;
  const elapsed = now.getTime() - Date.parse(record.checkedAt);
  return elapsed >= CHECK_INTERVAL_MS || elapsed < 0;
}

const isActiveStatus = (status: ActivationSnapshot['status']): boolean => status === 'active-online' || status === 'active-offline';

/** 128 random bits as 32 hex digits. getRandomValues works in every browser Kairos runs in, secure page or not. */
function randomRequestId(): string {
  return Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

// Notes for this device's own checks; refusals from the server carry a `reason` instead (D281).
const REACTIVATE_MESSAGE = 'Type your invite code again to open Kairos on this device.';
const VERIFY_UNAVAILABLE_MESSAGE = "Kairos couldn't check this device's invite right now. Close Kairos and open it again.";
const SAVE_FAILED_MESSAGE = "Your code worked, but Kairos couldn't save that on this device. Try again.";

/**
 * Application-layer owner for activation startup and first-activation sequencing.
 * Server approval is accepted only after proof verification and a successful local save.
 */
export class ActivationCoordinator {
  private snapshot: ActivationSnapshot = initialActivationSnapshot;
  private validationInFlight = false;
  /**
   * D275: the request id for the code being tried. Kept through retries of the same code (the same code to the Worker,
   * inviteCode.ts), so an answer lost on a slow network never costs a second place; replaced for another code, and
   * dropped once the code has worked.
   */
  private pendingRequest: { readonly codeKey: string; readonly requestId: string } | null = null;
  private checkInFlight = false;
  /** D278: this session's invite ended; it carries on, and nothing is asked again until the next start. */
  private endedThisSession = false;

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
          this.snapshot = await this.startWithoutReceipt();
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
      // D278: typing a code again brings everything back. The receipt is saved first: while it is stored, Kairos opens
      // whatever `ended` says, so a failed clear changes nothing now, and the next check's answer replaces it.
      await this.dependencies.checks?.clearEnded().catch(() => undefined);
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
    const codeKey = inviteCodeKey(request.inviteCode);
    if (this.pendingRequest?.codeKey !== codeKey) {
      this.pendingRequest = { codeKey, requestId: (this.dependencies.newRequestId ?? randomRequestId)() };
    }
    const { deviceLabel } = this.dependencies;
    return { ...request, requestId: this.pendingRequest.requestId, ...(deviceLabel === undefined ? {} : { deviceLabel }) };
  }

  /**
   * D278: once a day, when online and on screen, asks the activation Worker whether this device is still in use. It never
   * delays opening and is never needed to open. On `removed` or `revoked`, this device's receipt is deleted and the
   * reason saved in one atomic metadata write: this session carries on, and the next start shows the invite screen. A
   * failed or unreadable answer, or a device the server doesn't know, changes nothing and saves nothing, so the server's
   * own mistake never locks anyone out.
   */
  async checkThisDevice({ now, online, visible }: ActivationCheckInput): Promise<ActivationCheckOutcome> {
    const { devices, checks } = this.dependencies;
    const receipt = this.snapshot.receipt;
    if (!online || !visible || devices === undefined || checks === undefined || !Number.isFinite(now.getTime())) return 'skipped';
    if (this.checkInFlight || this.endedThisSession || !isActiveStatus(this.snapshot.status) || receipt === null) return 'skipped';
    const token = kairosDeviceToken(receipt);
    if (token === null) return 'skipped';

    this.checkInFlight = true;
    try {
      let record: ActivationCheckRecord | null;
      try {
        record = await checks.load();
      } catch {
        return 'skipped';
      }
      if (!isCheckDue(record, now)) return 'not-due';

      const answer = await devices.checkDevice(token).catch(() => null);
      if (answer === null || !answer.ok) return 'unchanged';
      const checkedAt = now.toISOString();
      if (answer.status === 'active') {
        // Not saved: the next start asks again, which is all a lost save costs.
        await checks.saveActive(checkedAt).catch(() => undefined);
        return 'active';
      }
      try {
        await checks.endThisDevice(answer.status, checkedAt);
      } catch {
        return 'unchanged';
      }
      this.endedThisSession = true;
      return answer.status;
    } finally {
      this.checkInFlight = false;
    }
  }

  /** No receipt on this device: the invite screen, with D278's words when the daily check ended this device's invite. */
  private async startWithoutReceipt(): Promise<ActivationSnapshot> {
    const record = await this.dependencies.checks?.load().catch(() => null);
    if (record?.ended === 'removed') return { status: 'activation-required', receipt: null, message: null, reason: 'device-removed' };
    if (record?.ended === 'revoked') return { status: 'activation-required', receipt: null, message: null, reason: 'code-revoked' };
    return initialActivationSnapshot;
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
