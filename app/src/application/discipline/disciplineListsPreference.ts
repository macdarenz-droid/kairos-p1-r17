import { runKairosAtomicWrite, type KairosDatabase } from '../../data/database';
import { createKairosRepositories, type MetadataRepository } from '../../data/repositories';
import {
  KAIROS_DEFAULT_DISCIPLINE_LISTS,
  parseDisciplineLists,
  type DisciplineListKind,
  type DisciplineLists,
  type DisciplineListsInvalidReason,
} from '../../domain/discipline';

/**
 * P22.2 where the trader's discipline lists are stored: one P5 metadata record
 * under a reserved key, like the goals preference. It is not a `device.` key,
 * so the lists travel in every backup; there is no schema or backup change.
 * Missing or damaged evidence reads as the defaults and is never rewritten here.
 */
export const disciplineListsPreferenceMetadataKey = 'preferences.discipline-lists.v1';

/** Reads the stored lists; a missing record, bad JSON, another version or invalid lists read as the defaults. Never writes. */
export async function readDisciplineLists(metadata: MetadataRepository): Promise<DisciplineLists> {
  const stored = await metadata.get(disciplineListsPreferenceMetadataKey);
  if (!stored) return KAIROS_DEFAULT_DISCIPLINE_LISTS;
  try {
    const parsed: unknown = JSON.parse(stored.value);
    if (typeof parsed !== 'object' || parsed === null || (parsed as Record<string, unknown>).version !== 1) return KAIROS_DEFAULT_DISCIPLINE_LISTS;
    const { version: _version, ...lists } = parsed as Record<string, unknown>;
    const result = parseDisciplineLists(lists);
    return result.ok ? result.lists : KAIROS_DEFAULT_DISCIPLINE_LISTS;
  } catch {
    return KAIROS_DEFAULT_DISCIPLINE_LISTS;
  }
}

export type LoadDisciplineListsResult =
  | { readonly ok: true; readonly lists: DisciplineLists }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'discipline-lists-read-failed' };

export async function loadDisciplineLists(db: KairosDatabase): Promise<LoadDisciplineListsResult> {
  try {
    return { ok: true, lists: await readDisciplineLists(createKairosRepositories(db).metadata) };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'discipline-lists-read-failed' };
  }
}

export type SaveDisciplineListsResult =
  | { readonly ok: true; readonly lists: DisciplineLists }
  | { readonly ok: false; readonly type: 'validation-error'; readonly reason: DisciplineListsInvalidReason; readonly list: DisciplineListKind | null; readonly index: number | null }
  | { readonly ok: false; readonly type: 'storage-error'; readonly reason: 'discipline-lists-save-failed' };

/** Validates first and writes nothing on a refusal; a valid save is one atomic metadata write. */
export async function saveDisciplineLists(
  db: KairosDatabase,
  lists: unknown,
  dependencies: { readonly now?: () => string } = {},
): Promise<SaveDisciplineListsResult> {
  const parsed = parseDisciplineLists(lists);
  if (!parsed.ok) return { ok: false, type: 'validation-error', reason: parsed.reason, list: parsed.list, index: parsed.index };
  const now = dependencies.now ?? (() => new Date().toISOString());
  try {
    const updatedAt = now();
    await runKairosAtomicWrite(db, ['metadata'], async ({ repositories }) => {
      await repositories.metadata.put({ key: disciplineListsPreferenceMetadataKey, value: JSON.stringify({ version: 1, ...parsed.lists }), updatedAt });
    });
    return { ok: true, lists: parsed.lists };
  } catch {
    return { ok: false, type: 'storage-error', reason: 'discipline-lists-save-failed' };
  }
}
