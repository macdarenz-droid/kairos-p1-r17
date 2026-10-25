import type {
  ActivationDeviceCheckResult,
  ActivationDeviceListResult,
  ActivationDeviceRemoveResult,
  ActivationRequest,
  ActivationValidationResult,
} from './activationTypes';

/**
 * Replaceable boundary for the server-owned invite authority.
 * Implementations may call a remote activation service, but the client must not
 * contain a reusable invite-code list or signing authority.
 */
export interface ActivationAdapter {
  validateInvite(
    request: ActivationRequest,
    options?: { signal?: AbortSignal },
  ): Promise<ActivationValidationResult>;
}

/**
 * The activation Worker's device routes (D277, D278). Each takes this device's token (deviceToken.ts), which the Worker
 * checks before it answers. "Used on 2 of 3" is the Worker's count; the app only shows it.
 */
export interface ActivationDevicesAdapter {
  /** This code's devices still in use, this one included. */
  listDevices(token: string, options?: { signal?: AbortSignal }): Promise<ActivationDeviceListResult>;
  /** Removes another device of the same code, by its row number. */
  removeDevice(token: string, deviceId: number, options?: { signal?: AbortSignal }): Promise<ActivationDeviceRemoveResult>;
  /** Whether this device is still in use, removed, or on a stopped code. */
  checkDevice(token: string, options?: { signal?: AbortSignal }): Promise<ActivationDeviceCheckResult>;
}
