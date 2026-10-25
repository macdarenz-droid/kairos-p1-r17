import { beforeAll, describe, expect, it } from 'vitest';
import { DEVICE_BROWSERS, DEVICE_LABELS, DEVICE_PLATFORMS, deviceLabel, isDeviceLabel, OTHER_DEVICE } from '../src/deviceLabels.mjs';
import { activationBody, addCode, applyMigrations, deviceRows, newCode, send } from './support';

beforeAll(applyMigrations);

describe('the device names (D275, src/deviceLabels.mjs)', () => {
  it('is one fixed list: each platform with each browser, and "Other device"', () => {
    expect(DEVICE_PLATFORMS).toEqual(['iPhone', 'iPad', 'Android', 'Mac', 'Windows', 'Linux', 'Chromebook']);
    expect(DEVICE_BROWSERS).toEqual(['Safari', 'Chrome', 'Edge', 'Firefox', 'Samsung Internet', 'Opera', 'Other browser']);
    expect(DEVICE_LABELS).toHaveLength(DEVICE_PLATFORMS.length * DEVICE_BROWSERS.length + 1);
    expect(DEVICE_LABELS).toEqual(expect.arrayContaining(['iPhone · Safari', 'Android · Chrome', 'Windows · Edge', 'Other device']));
    expect(OTHER_DEVICE).toBe('Other device');
    expect(Object.isFrozen(DEVICE_LABELS)).toBe(true);
  });

  it('builds a name from a platform and a browser, and anything else is "Other device"', () => {
    expect(deviceLabel('iPad', 'Safari')).toBe('iPad · Safari');
    expect(deviceLabel('Android', 'Samsung Internet')).toBe('Android · Samsung Internet');
    for (const [platform, browser] of [['Nokia', 'Safari'], ['iPhone', 'Netscape'], ['', ''], [undefined, 'Chrome']]) {
      expect(deviceLabel(platform as string, browser as string)).toBe(OTHER_DEVICE);
    }
    for (const label of DEVICE_LABELS) expect(isDeviceLabel(label)).toBe(true);
    for (const value of ['My phone', 'iphone · safari', 'iPhone · Safari ', 'iPhone - Safari', null, 42]) expect(isDeviceLabel(value)).toBe(false);
  });

  it('is the list /activate accepts, every name of it and nothing else', async () => {
    const code = newCode();
    await addCode(code, { deviceLimit: 10 });
    for (const deviceLabel of DEVICE_LABELS) {
      const response = await send({ body: activationBody(code, { deviceLabel, requestId: 'same-request-id' }) });
      expect(response.status, deviceLabel).toBe(200);
    }
    expect(await deviceRows(code)).toHaveLength(1);
    expect((await send({ body: activationBody(code, { deviceLabel: 'Nokia · Safari' }) })).status).toBe(400);
  });
});
