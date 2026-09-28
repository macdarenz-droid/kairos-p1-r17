import { beforeAll, describe, expect, it } from 'vitest';
import { checkDevice } from '../src/device';
import { ACTIVATION_ID, activationKeys, base64Url, deviceToken, GOOD_PAYLOAD, signBytes, type ActivationKeys } from './signedReceipt';

let keys: ActivationKeys;
let other: ActivationKeys;
let good: string;

beforeAll(async () => {
  keys = await activationKeys();
  other = await activationKeys();
  good = await deviceToken(keys.privateKey);
});

describe('checkDevice', () => {
  it('recognises a receipt signed by the activation key', async () => {
    expect(await checkDevice(good, keys.spki)).toEqual({ kind: 'recognised', activationId: ACTIVATION_ID });
  });

  it('does not recognise a wrong, changed or badly formed receipt', async () => {
    const [, goodPayload, goodSignature] = good.split('.');
    const swappedBytes = new TextEncoder().encode(JSON.stringify({ ...GOOD_PAYLOAD, activationId: 'someone-else' }));
    const shortSignature = base64Url((await signBytes(keys.privateKey, new TextEncoder().encode('x'))).slice(0, 63));
    const tokens = [
      await deviceToken(other.privateKey),
      `v1.${base64Url(swappedBytes)}.${goodSignature}`,
      await deviceToken(keys.privateKey, { ...GOOD_PAYLOAD, purpose: 'other' }),
      await deviceToken(keys.privateKey, { ...GOOD_PAYLOAD, issuedAt: '2026-09-20T10:00:00Z' }),
      `v1.${goodPayload}.${shortSignature}`,
      'v1',
      'v2.a.b',
      'v1.!!.??',
      `v1.${'A'.repeat(1000)}.${'B'.repeat(996)}`,
    ];
    expect(tokens.at(-1)).toHaveLength(2000);
    for (const token of tokens) {
      expect(await checkDevice(token, keys.spki), token.slice(0, 40)).toEqual({ kind: 'not-recognised' });
    }
  });

  it('does not recognise a correctly signed receipt longer than 1,024 characters', async () => {
    const base = (await deviceToken(keys.privateKey, { ...GOOD_PAYLOAD, note: '' })).length;
    const withNote = (targetLength: number) => deviceToken(keys.privateKey, { ...GOOD_PAYLOAD, note: 'x'.repeat(Math.floor(((targetLength - base) * 3) / 4)) });
    const long = await withNote(1060);
    const short = await withNote(1010);
    expect(long.length).toBeGreaterThanOrEqual(1025);
    expect(long.length).toBeLessThanOrEqual(1100);
    expect(short.length).toBeGreaterThanOrEqual(1000);
    expect(short.length).toBeLessThanOrEqual(1024);
    expect(await checkDevice(long, keys.spki)).toEqual({ kind: 'not-recognised' });
    expect(await checkDevice(short, keys.spki)).toEqual({ kind: 'recognised', activationId: ACTIVATION_ID });
  });

  it('says not-sent without a header and not-checked without a usable key', async () => {
    expect(await checkDevice(null, keys.spki)).toEqual({ kind: 'not-sent' });
    expect(await checkDevice('', keys.spki)).toEqual({ kind: 'not-sent' });
    expect(await checkDevice(good, undefined)).toEqual({ kind: 'not-checked' });
    expect(await checkDevice(good, 'AAAAAAAAAAAAAAAAAAAAAAAA')).toEqual({ kind: 'not-checked' });
  });
});
