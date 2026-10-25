import { describe, expect, it } from 'vitest';
import { compactInviteCode, formatInviteCode, INVITE_CODE_ALPHABET, inviteCodeFromBytes, inviteCodeHashes, sha256Hex } from '../src/inviteCode.mjs';

describe('the invite code rules (D280, src/inviteCode.mjs)', () => {
  it("makes 16 characters from Crockford's 32, shown in four groups of four", () => {
    expect(INVITE_CODE_ALPHABET).toBe('0123456789ABCDEFGHJKMNPQRSTVWXYZ');
    const made = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const code = inviteCodeFromBytes(crypto.getRandomValues(new Uint8Array(16)));
      expect(code).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(?:-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
      made.add(code);
    }
    expect(made.size).toBe(200);
    // Each byte picks one character by its lowest 5 bits: 32 divides 256, so every character is equally likely.
    expect(inviteCodeFromBytes(Uint8Array.from({ length: 16 }, (_, index) => index * 32 + index))).toBe('0123-4567-89AB-CDEF');
    expect(inviteCodeFromBytes(new Uint8Array(16).fill(255))).toBe('ZZZZ-ZZZZ-ZZZZ-ZZZZ');
    for (const bytes of [new Uint8Array(15), new Uint8Array(17)]) expect(() => inviteCodeFromBytes(bytes)).toThrow(TypeError);
  });

  it('reads a typed code forgivingly: case, spaces and dashes ignored, O as 0, I and L as 1', () => {
    expect(compactInviteCode('7Q4M-X2PB-9HRT-K3VD')).toBe('7Q4MX2PB9HRTK3VD');
    expect(compactInviteCode('  7q4m x2pb 9hrt k3vd\n')).toBe('7Q4MX2PB9HRTK3VD');
    expect(compactInviteCode('O1IL-oIil-0000-1111')).toBe('0111011100001111');
    expect(compactInviteCode('7Q4M–X2PB—-9HRT-K3VD')).toBe('7Q4MX2PB9HRTK3VD');
    expect(formatInviteCode('7Q4MX2PB9HRTK3VD')).toBe('7Q4M-X2PB-9HRT-K3VD');
  });

  it('reads a pasted code with invisible characters, or with full-width letters and digits, the same way', () => {
    // Zero-width space, soft hyphen, word joiner and a byte-order mark (format characters, Unicode Cf).
    expect(compactInviteCode('\u200b7Q4M\u00ad-X2PB\u2060-9HRT-K3VD\ufeff')).toBe('7Q4MX2PB9HRTK3VD');
    // Full-width forms, as some keyboards and documents type them.
    expect(compactInviteCode('\uff17\uff31\uff14\uff2d\uff0d\uff38\uff12\uff30\uff22\u3000\uff19\uff28\uff32\uff34-\uff2b\uff13\uff36\uff24')).toBe('7Q4MX2PB9HRTK3VD');
    expect(compactInviteCode('\uff4f\uff49\uff4c\uff11-0000-1111-0000')).toBe('0111000011110000');
  });

  it('has no compact form for text that is not a new-style code', () => {
    for (const typed of ['', 'KAIROS-ANA-2026', '7Q4M-X2PB-9HRT-K3V', '7Q4M-X2PB-9HRT-K3VDX', '7Q4M-X2PB-9HRT-K3VU', '7Q4M_X2PB_9HRT_K3VD', '7Q4M-X2PB-9HRT-K3VÉ']) {
      expect(compactInviteCode(typed), typed).toBeNull();
    }
    expect(() => formatInviteCode('KAIROS')).toThrow(TypeError);
  });

  it('hashes with SHA-256 in hex, and looks a code up by its compact form and by its exact text', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await inviteCodeHashes(' 7q4m-x2pb-9hrt-k3vd ')).toEqual({ compact: await sha256Hex('7Q4MX2PB9HRTK3VD'), exact: await sha256Hex('7Q4M-X2PB-9HRT-K3VD') });
    expect(await inviteCodeHashes(' kairos-ana ')).toEqual({ compact: null, exact: await sha256Hex('KAIROS-ANA') });
  });
});
