// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { compactInviteCode, exactInviteCodeText, inviteCodeKey } from '../src/services/activation/inviteCode';

/**
 * The activation Worker's own code rules (D280), their one owner. Imported as they are (plain JS, outside the app's
 * TypeScript project), so the shape is stated here.
 */
interface WorkerInviteCode {
  readonly compactInviteCode: (typed: string) => string | null;
  readonly exactInviteCodeText: (typed: string) => string;
}
const WORKER_RULES: string = '../backend/activation-worker/src/inviteCode.mjs';
const worker = async (): Promise<WorkerInviteCode> => (await import(/* @vite-ignore */ WORKER_RULES)) as WorkerInviteCode;

const CODE = '7Q4M-X2PB-9HRT-K3VD';
const COMPACT = '7Q4MX2PB9HRTK3VD';

/** What a person may type, and the compact form the Worker reads (null: not a new-style code). */
const TABLE: readonly (readonly [typed: string, compact: string | null])[] = [
  [CODE, COMPACT],
  ['7q4m x2pb 9hrt k3vd', COMPACT],
  ['  7Q4m-X2pB-9hRt-K3vD  ', COMPACT],
  // O reads as 0; I and L read as 1.
  ['7Q4M-X2PB-9HRT-K3V0', '7Q4MX2PB9HRTK3V0'],
  ['7Q4M-X2PB-9HRT-K3VO', '7Q4MX2PB9HRTK3V0'],
  ['7q4m-x2pb-9hrt-k3vo', '7Q4MX2PB9HRTK3V0'],
  ['7Q4M-X2PB-9HRT-K3V1', '7Q4MX2PB9HRTK3V1'],
  ['7Q4M-X2PB-9HRT-K3VI', '7Q4MX2PB9HRTK3V1'],
  ['7q4m-x2pb-9hrt-k3vl', '7Q4MX2PB9HRTK3V1'],
  // Full-width letters, digits and dashes, as some keyboards type them.
  ['７Ｑ４Ｍ－Ｘ２ＰＢ－９ＨＲＴ－Ｋ３ＶＤ', COMPACT],
  // A non-breaking hyphen (U+2011), an en dash, a minus sign, a no-break space.
  ['7Q4M\u2011X2PB\u20119HRT\u2011K3VD', COMPACT],
  ['7Q4M\u2013X2PB\u2212 9HRT\u00A0K3VD', COMPACT],
  // Invisible characters a paste can carry: a soft hyphen, a zero-width space, a byte-order mark.
  ['7Q4M\u00ADX2PB\u200B9HRT\uFEFFK3VD', COMPACT],
  // Not a new-style code: too short, too long, a U, an underscore.
  ['7Q4M-X2PB-9HRT-K3V', null],
  ['7Q4M-X2PB-9HRT-K3VDX', null],
  ['7Q4M-X2PB-9HRT-K3VU', null],
  ['7Q4M_X2PB_9HRT_K3VD', null],
  // Codes made by hand before D280 match by their exact text only.
  ['QA-INVITE-001', null],
  ['qa-invite-001  ', null],
  ['QAINVITE001', null],
  ['Friends2026', null],
  ['', null],
  ['   ', null],
];

/** Characters a random typed code is made of: the alphabet, look-alikes, dashes, spaces, invisible and wide forms. */
const POOL = [
  ...'0123456789ABCDEFGHJKMNPQRSTVWXYZabcdefghjkmnpqrstvwxyz', 'O', 'o', 'I', 'i', 'L', 'l', 'U', 'u', 'ı', 'ß', 'ﬁ',
  '-', '_', ' ', '\t', '\u00A0', '\u2010', '\u2011', '\u2013', '\u2015', '\u2212', '\u00AD', '\u200B', '\u2060', '\uFEFF',
  '７', 'Ｑ', 'ｋ', '－', 'Ａ', 'é', '\u0301', '€', '.',
];

describe('T-062e fix r1: the code a try is for, read as the activation Worker reads it (D280)', () => {
  it.each(TABLE)('reads %j as the Worker does', async (typed, compact) => {
    const rules = await worker();
    expect(compactInviteCode(typed)).toBe(compact);
    expect(compactInviteCode(typed)).toBe(rules.compactInviteCode(typed));
    expect(exactInviteCodeText(typed)).toBe(rules.exactInviteCodeText(typed));
  });

  it('gives the Worker\'s forms for random typing', async () => {
    const rules = await worker();
    let seed = 2026;
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
    let newStyle = 0;
    for (let round = 0; round < 3000; round += 1) {
      // Half the time a real code, retyped with look-alikes and extra characters; otherwise anything at all.
      const base = round % 2 === 0
        ? Array.from({ length: 16 }, () => '0123456789ABCDEFGHJKMNPQRSTVWXYZ'[next() % 32]!).join('')
        : '';
      const typed = [...base].map((character) => {
        const roll = next() % 10;
        return roll === 0 ? POOL[next() % POOL.length]! : roll === 1 ? character.toLowerCase() : roll === 2 ? `${character}-` : character;
      }).join('') + Array.from({ length: base === '' ? next() % 24 : 0 }, () => POOL[next() % POOL.length]!).join('');
      expect(compactInviteCode(typed), JSON.stringify(typed)).toBe(rules.compactInviteCode(typed));
      expect(exactInviteCodeText(typed), JSON.stringify(typed)).toBe(rules.exactInviteCodeText(typed));
      if (compactInviteCode(typed) !== null) newStyle += 1;
    }
    // The random typing reaches both kinds of code.
    expect(newStyle).toBeGreaterThan(300);
    expect(newStyle).toBeLessThan(3000);
  });

  it('keys a try by its compact form, else by its exact text', () => {
    expect(inviteCodeKey('7q4m-x2pb-9hrt-k3vo')).toBe(inviteCodeKey('7Q4MX2PB9HRTK3V0'));
    expect(inviteCodeKey('7Q4M\u2011X2PB\u20119HRT\u2011K3VD')).toBe(COMPACT);
    expect(inviteCodeKey(' qa-invite-001 ')).toBe('QA-INVITE-001');
    expect(inviteCodeKey('QA-INVITE-001')).not.toBe(inviteCodeKey('QAINVITE001'));
  });
});
