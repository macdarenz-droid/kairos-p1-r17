import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { afterEach, describe, expect, it } from 'vitest';
import { commitBackupRestore, exportKairosBackup, prepareBackupRestore } from '../src/application/backup';
import { disciplineListsPreferenceMetadataKey, loadDisciplineLists, saveDisciplineLists } from '../src/application/discipline';
import { createKairosDatabase, inspectKairosDatabaseIntegrity, openKairosDatabase, type KairosDatabase } from '../src/data/database';
import {
  KAIROS_DEFAULT_DISCIPLINE_LISTS,
  KAIROS_DISCIPLINE_MISTAKE_TAGS,
  KAIROS_POST_TRADE_REVIEW_KEYS,
  KAIROS_PRE_TRADE_CHECKLIST_KEYS,
  createDisciplineListItemId,
  isDisciplineLabel,
  type DisciplineLists,
} from '../src/domain/discipline';

const names: string[] = [];
async function database(label: string): Promise<KairosDatabase> {
  const name = `kairos-discipline-lists-${label}-${crypto.randomUUID()}`; names.push(name);
  const db = createKairosDatabase(name); await openKairosDatabase(db); return db;
}
afterEach(async () => { for (const name of names.splice(0)) await Dexie.delete(name); });

const now = () => '2026-09-24T12:00:00.000Z';
const lists = KAIROS_DEFAULT_DISCIPLINE_LISTS;
const itemsOf = (value: DisciplineLists) => ({ checklist: [...value.checklist], review: [...value.review], mistakes: [...value.mistakes] });

function customLists(): DisciplineLists {
  const base = itemsOf(lists);
  return {
    checklist: [{ id: 'plan-written', label: 'My plan is on paper', ruleId: null }, ...base.checklist.slice(1), { id: createDisciplineListItemId(), label: 'I checked the news', ruleId: null }],
    review: base.review,
    mistakes: base.mistakes.filter((item) => item.id !== 'revenge-trade'),
  };
}

describe('P22.2 discipline lists preference', () => {
  it('has plain-words defaults whose ids are the L36.1 keys, frozen, with no rule', () => {
    expect(lists.checklist.map((item) => item.id)).toEqual([...KAIROS_PRE_TRADE_CHECKLIST_KEYS]);
    expect(lists.review.map((item) => item.id)).toEqual([...KAIROS_POST_TRADE_REVIEW_KEYS]);
    expect(lists.mistakes.map((item) => item.id)).toEqual([...KAIROS_DISCIPLINE_MISTAKE_TAGS]);
    expect([lists.checklist.length, lists.review.length, lists.mistakes.length]).toEqual([5, 4, 8]);
    for (const item of [...lists.checklist, ...lists.review, ...lists.mistakes]) {
      expect(isDisciplineLabel(item.label)).toBe(true);
      expect(item.ruleId).toBeNull();
      expect(Object.isFrozen(item)).toBe(true);
    }
    expect(Object.isFrozen(lists) && Object.isFrozen(lists.checklist) && Object.isFrozen(lists.review) && Object.isFrozen(lists.mistakes)).toBe(true);
  });

  it('reads the defaults from an empty database without writing', async () => {
    const db = await database('empty');
    expect(await loadDisciplineLists(db)).toEqual({ ok: true, lists });
    expect(await db.metadata.count()).toBe(0);
  });

  it('saves custom lists and reads them back exactly', async () => {
    const db = await database('round-trip');
    const custom = customLists();
    expect(await saveDisciplineLists(db, custom, { now })).toEqual({ ok: true, lists: custom });
    expect(await loadDisciplineLists(db)).toEqual({ ok: true, lists: custom });
    const stored = await db.metadata.get(disciplineListsPreferenceMetadataKey);
    expect(stored?.updatedAt).toBe(now());
    expect(JSON.parse(stored!.value).version).toBe(1);
  });

  it('trims labels and stores a missing ruleId as null', async () => {
    const db = await database('clean');
    const saved = await saveDisciplineLists(db, { checklist: [{ id: 'plan-written', label: '  I wrote it down  ' }], review: [], mistakes: [] }, { now });
    expect(saved).toEqual({ ok: true, lists: { checklist: [{ id: 'plan-written', label: 'I wrote it down', ruleId: null }], review: [], mistakes: [] } });
    expect((await loadDisciplineLists(db))).toEqual(saved);
  });

  it('refuses invalid lists with the exact place and writes nothing', async () => {
    const db = await database('refusals');
    const base = itemsOf(lists);
    const cases: [unknown, { reason: string; list: string | null; index: number | null }][] = [
      [{ ...base, review: [base.review[0], base.review[1], base.review[0]] }, { reason: 'duplicate-item-id', list: 'review', index: 2 }],
      [{ ...base, checklist: [{ id: 'Plan Written', label: 'x', ruleId: null }] }, { reason: 'invalid-item-id', list: 'checklist', index: 0 }],
      [{ ...base, mistakes: [base.mistakes[0], { id: 'blank', label: '   ', ruleId: null }] }, { reason: 'label-required', list: 'mistakes', index: 1 }],
      [{ ...base, checklist: [{ id: 'long', label: 'a'.repeat(81), ruleId: null }] }, { reason: 'label-too-long', list: 'checklist', index: 0 }],
      [{ ...base, review: Array.from({ length: 21 }, (_, index) => ({ id: `item-${index}`, label: `Item ${index}`, ruleId: null })) }, { reason: 'too-many-items', list: 'review', index: null }],
      [{ ...base, checklist: [{ id: 'rule', label: 'Rule', ruleId: '' }] }, { reason: 'invalid-rule-id', list: 'checklist', index: 0 }],
      [null, { reason: 'lists-missing', list: null, index: null }],
    ];
    for (const [input, expected] of cases) {
      expect(await saveDisciplineLists(db, input, { now })).toEqual({ ok: false, type: 'validation-error', ...expected });
    }
    expect(await db.metadata.count()).toBe(0);
  });

  it('reads a damaged stored value as the defaults, leaves it as it is, and keeps the core checks green', async () => {
    const duplicate = JSON.stringify({ version: 1, checklist: [lists.checklist[0], lists.checklist[0]], review: [], mistakes: [] });
    for (const value of ['not json', '{"version":2}', duplicate]) {
      const db = await database('damaged');
      await db.metadata.put({ key: disciplineListsPreferenceMetadataKey, value, updatedAt: now() });
      expect(await loadDisciplineLists(db)).toEqual({ ok: true, lists });
      expect((await db.metadata.get(disciplineListsPreferenceMetadataKey))?.value).toBe(value);
      expect((await inspectKairosDatabaseIntegrity(db)).coreOk).toBe(true);
    }
  });

  it('travels in a backup and comes back on restore', async () => {
    const source = await database('backup-source');
    const custom = customLists();
    await saveDisciplineLists(source, custom, { now });
    const exported = await exportKairosBackup(source, new Date('2026-09-24T13:00:00.000Z'));
    if (!exported.ok) throw new Error('export failed');
    const target = await database('backup-target');
    const prepared = await prepareBackupRestore(target, exported.file.contents);
    if (!prepared.ok) throw new Error('prepare failed');
    expect((await commitBackupRestore(target, prepared.restore)).ok).toBe(true);
    expect(await loadDisciplineLists(target)).toEqual({ ok: true, lists: custom });
  });
});
