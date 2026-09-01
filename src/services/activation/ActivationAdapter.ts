import type { ActivationRequest, ActivationValidationResult } from './activationTypes';

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
