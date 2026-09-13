import { describe, expect, it } from 'vitest';
import {
  presentAnalysisLiveCandleStatus,
  type AnalysisLiveCandleStatusPresentationInput,
} from '../src/app/analysisLiveCandleStatusPresentation';

const base = (): AnalysisLiveCandleStatusPresentationInput => ({
  availability: 'available',
  activation: { ok: true, snapshot: {} as never },
  connection: 'live',
  disposition: null,
  backfillRecovery: null,
  lastError: null,
});

const present = (patch: Partial<AnalysisLiveCandleStatusPresentationInput>) =>
  presentAnalysisLiveCandleStatus({ ...base(), ...patch });

describe('Analysis live-candle status presentation', () => {
  it('requires the exact live connection state before claiming live candles', () => {
    expect(present({ connection: 'live' })).toEqual({
      kind: 'live',
      label: 'Live candles connected',
      detail: 'Validated market updates are being applied to this chart.',
    });
    for (const connection of [null, 'idle', 'connecting'] as const) {
      expect(present({ connection }).kind).toBe('connecting');
    }
    expect(present({ connection: 'disconnected' }).kind).toBe('reconnecting');
    expect(present({ connection: 'error' }).kind).toBe('error');
  });

  it('keeps initial history acquisition distinct from connection state', () => {
    expect(present({ activation: null, connection: 'live' })).toEqual({
      kind: 'loading',
      label: 'Loading candles',
      detail: 'Loading authoritative history before live updates start.',
    });
  });

  it('prioritizes exact browser unavailability and never calls it live', () => {
    expect(present({ availability: 'hidden' }).kind).toBe('paused-hidden');
    expect(present({ availability: 'offline' }).kind).toBe('paused-offline');
    expect(present({ availability: 'hidden' }).detail).toContain('Return to this tab');
    expect(present({ availability: 'offline' }).detail).toContain('internet');
  });

  it('projects browser-unavailable activation without requiring a separate observation', () => {
    expect(present({ availability: null, activation: { ok: false, reason: 'browser-unavailable', availability: 'hidden' } }).kind).toBe('paused-hidden');
    expect(present({ availability: null, activation: { ok: false, reason: 'browser-unavailable', availability: 'offline' } }).kind).toBe('paused-offline');
  });

  it('keeps a superseded completion pending for the latest selection', () => {
    expect(present({ activation: { ok: false, reason: 'superseded' } })).toEqual({
      kind: 'loading',
      label: 'Loading candles',
      detail: 'Waiting for the latest chart selection.',
    });
  });

  it('presents empty authoritative history without inventing candles', () => {
    expect(present({ activation: { ok: false, reason: 'history-empty' } }).kind).toBe('empty');
  });

  it('presents request limiting and regional HTTP failures explicitly', () => {
    const failure = (status: number) => ({ ok: false as const, reason: 'history-failed' as const, failure: { ok: false as const, reason: 'http-error' as const, status, retryAfter: null } });
    expect(present({ activation: failure(429) }).detail).toContain('limiting requests');
    expect(present({ activation: failure(418) }).detail).toContain('limiting requests');
    expect(present({ activation: failure(403) }).detail).toContain('region');
    expect(present({ activation: failure(451) }).detail).toContain('region');
  });

  it('does not expose transport or provider error objects in visible copy', () => {
    const secret = 'private-error-detail';
    const result = present({
      activation: { ok: false, reason: 'history-failed', failure: { ok: false, reason: 'invalid-response', detail: secret } },
      lastError: new Error(secret),
    });
    expect(result.kind).toBe('unavailable');
    expect(JSON.stringify(result)).not.toContain(secret);
  });

  it('fails closed for mismatched history, renderer and session activation', () => {
    expect(present({ activation: { ok: false, reason: 'history-scope-mismatch' } }).kind).toBe('error');
    expect(present({ activation: { ok: false, reason: 'renderer-failed' } }).kind).toBe('error');
    expect(present({ activation: { ok: false, reason: 'session-failed', detail: 'rejected' } }).kind).toBe('error');
  });

  it('shows a pending exact gap as recovery and a failed recovery as unavailable', () => {
    expect(present({ disposition: { kind: 'backfill-required' } }).kind).toBe('recovering');
    expect(present({
      disposition: { kind: 'backfill-required' },
      backfillRecovery: { ok: false, reason: 'backfill-scope-mismatch' },
    }).kind).toBe('unavailable');
  });

  it('lets a completed successful recovery return to exact connection truth', () => {
    expect(present({
      disposition: { kind: 'backfill-required' },
      backfillRecovery: { ok: true, snapshot: {} as never },
      connection: 'live',
    }).kind).toBe('live');
  });

  it('uses a generic safe error presentation for raw errors', () => {
    const result = present({ lastError: new Error('do-not-render') });
    expect(result.kind).toBe('error');
    expect(JSON.stringify(result)).not.toContain('do-not-render');
  });

  it('returns immutable presentation facts', () => {
    expect(Object.isFrozen(present({}))).toBe(true);
  });
});
