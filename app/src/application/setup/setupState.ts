/**
 * T-053d (D222): where the first-run setup stands. One metadata preference, like the home currency (D110): every
 * backup format already carries metadata rows, so no schema version or backup format changes; a full restore replaces
 * it and a merge import leaves it alone. A missing or damaged record reads as "never finished, never skipped".
 */

import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';

export const setupStateMetadataKey = 'preferences.setup.v1';

export interface SetupState {
  /** When the trader reached the setup's last step. */
  readonly finishedAt: string | null;
  /** When the trader first tapped "Skip for now". */
  readonly skippedAt: string | null;
  /** When the trader hid the Home "Getting started" card (D224). */
  readonly cardHiddenAt: string | null;
}

export const EMPTY_SETUP_STATE: SetupState = Object.freeze({ finishedAt: null, skippedAt: null, cardHiddenAt: null });

const STORED_KEYS = 'cardHiddenAt,finishedAt,skippedAt,version';
const isInstantOrNull = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && Number.isFinite(Date.parse(value)) && new Date(Date.parse(value)).toISOString() === value);

/** The stored state; a missing or damaged record reads as EMPTY_SETUP_STATE. Never writes. */
export async function readSetupState(metadata: MetadataRepository): Promise<SetupState> {
  const stored = await metadata.get(setupStateMetadataKey);
  if (!stored) return EMPTY_SETUP_STATE;
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return EMPTY_SETUP_STATE;
    const record = parsed as Record<string, unknown>;
    if (record.version !== 1 || Object.keys(record).sort().join(',') !== STORED_KEYS) return EMPTY_SETUP_STATE;
    const { finishedAt, skippedAt, cardHiddenAt } = record;
    if (!isInstantOrNull(finishedAt) || !isInstantOrNull(skippedAt) || !isInstantOrNull(cardHiddenAt)) return EMPTY_SETUP_STATE;
    return Object.freeze({ finishedAt, skippedAt, cardHiddenAt });
  } catch {
    return EMPTY_SETUP_STATE;
  }
}

/** The setup's state for screens, which never import data/repositories. */
export function loadSetupState(db: KairosDatabase): Promise<SetupState> {
  return readSetupState(createKairosRepositories(db).metadata);
}

/**
 * Whether Home opens the setup in its place (D222): the setup was neither finished nor skipped, and the journal holds
 * no trade at all (real or practice), so a restored journal or a trader who already logs is never sent there.
 */
export async function shouldOpenSetup(db: KairosDatabase): Promise<boolean> {
  const repositories = createKairosRepositories(db);
  const state = await readSetupState(repositories.metadata);
  if (state.finishedAt !== null || state.skippedAt !== null) return false;
  return (await repositories.trades.listRecentByUpdatedAt(1)).length === 0;
}

export type SetupStateWriteResult = { readonly ok: true; readonly state: SetupState } | { readonly ok: false; readonly reason: 'setup-save-failed' };

async function changeSetupState(db: KairosDatabase, change: (state: SetupState, now: string) => SetupState, now: () => string): Promise<SetupStateWriteResult> {
  try {
    const updatedAt = now();
    const state = await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      const next = change(await readSetupState(repositories.metadata), updatedAt);
      await repositories.metadata.put({ key: setupStateMetadataKey, value: JSON.stringify({ version: 1, ...next }), updatedAt });
      return Object.freeze({ ...next });
    });
    return { ok: true, state };
  } catch {
    return { ok: false, reason: 'setup-save-failed' };
  }
}

const wallClock = () => new Date().toISOString();

/** The trader reached the setup's last step (the first time is kept). */
export function finishSetup(db: KairosDatabase, dependencies: { readonly now?: () => string } = {}): Promise<SetupStateWriteResult> {
  return changeSetupState(db, (state, now) => ({ ...state, finishedAt: state.finishedAt ?? now }), dependencies.now ?? wallClock);
}

/** The trader tapped "Skip for now" (the first time is kept). */
export function skipSetup(db: KairosDatabase, dependencies: { readonly now?: () => string } = {}): Promise<SetupStateWriteResult> {
  return changeSetupState(db, (state, now) => ({ ...state, skippedAt: state.skippedAt ?? now }), dependencies.now ?? wallClock);
}

/** The trader hid the Home "Getting started" card (D224). */
export function hideGettingStarted(db: KairosDatabase, dependencies: { readonly now?: () => string } = {}): Promise<SetupStateWriteResult> {
  return changeSetupState(db, (state, now) => ({ ...state, cardHiddenAt: state.cardHiddenAt ?? now }), dependencies.now ?? wallClock);
}
