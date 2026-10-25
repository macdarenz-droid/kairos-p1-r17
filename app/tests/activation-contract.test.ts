import { describe, expect, it } from 'vitest';
import type { ActivationAdapter } from '../src/services/activation/ActivationAdapter';
import {
  initialActivationSnapshot,
  reduceActivationState,
} from '../src/services/activation/activationState';
import type { ActivationReceipt } from '../src/services/activation/activationTypes';

const receipt: ActivationReceipt = {
  receiptVersion: 1,
  activationId: 'activation-test-1',
  issuedAt: '2026-08-31T09:20:00.000Z',
  verifierPayload: 'opaque-payload',
  verifierSignature: 'opaque-signature',
};

describe('P7.1 activation contract', () => {
  it('requires activation by default', () => {
    expect(initialActivationSnapshot).toEqual({
      status: 'activation-required',
      receipt: null,
      message: null,
    });
  });

  it('moves a server-approved invite into active-online state', () => {
    const validating = reduceActivationState(initialActivationSnapshot, { type: 'START_VALIDATION' });
    const active = reduceActivationState(validating, {
      type: 'VALIDATION_FINISHED',
      result: { ok: true, receipt },
    });

    expect(active.status).toBe('active-online');
    expect(active.receipt).toEqual(receipt);
  });

  it('models first-activation network failure explicitly', () => {
    const result = reduceActivationState(initialActivationSnapshot, {
      type: 'VALIDATION_FINISHED',
      result: { ok: false, reason: 'network-unavailable' },
    });

    expect(result.status).toBe('network-unavailable');
    expect(result.receipt).toBeNull();
  });

  it('supports normal offline use only when a verified receipt is supplied', () => {
    const result = reduceActivationState(initialActivationSnapshot, {
      type: 'OFFLINE_WITH_VERIFIED_RECEIPT',
      receipt,
    });

    expect(result.status).toBe('active-offline');
    expect(result.receipt).toEqual(receipt);
  });

  it('keeps invite validation behind a replaceable adapter boundary', async () => {
    const adapter: ActivationAdapter = {
      async validateInvite() {
        return { ok: true, receipt };
      },
    };

    await expect(adapter.validateInvite({
      inviteCode: 'one-time-input',
      appVersion: '0.1.0',
      buildId: 'test-build',
    })).resolves.toEqual({ ok: true, receipt });
  });
});
