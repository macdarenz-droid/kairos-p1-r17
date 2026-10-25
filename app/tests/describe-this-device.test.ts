// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEVICE_BROWSERS, DEVICE_LABELS, DEVICE_PLATFORMS, describeThisDevice, OTHER_DEVICE } from '../src/services/activation';

/**
 * The activation Worker's own list (D275), the one owner of the device names. Imported as it is (plain JS, outside the
 * app's TypeScript project), so the shape is stated here.
 */
interface ServerDeviceLabels {
  readonly DEVICE_PLATFORMS: readonly string[];
  readonly DEVICE_BROWSERS: readonly string[];
  readonly DEVICE_LABELS: readonly string[];
  readonly OTHER_DEVICE: string;
  readonly isDeviceLabel: (value: unknown) => boolean;
}
const SERVER_LIST: string = '../backend/activation-worker/src/deviceLabels.mjs';
const server = async (): Promise<ServerDeviceLabels> => (await import(/* @vite-ignore */ SERVER_LIST)) as ServerDeviceLabels;

const IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko)';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; K) AppleWebKit/537.36 (KHTML, like Gecko)';
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)';
const MAC_SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

const CASES: readonly (readonly [userAgent: string, maxTouchPoints: number, label: string])[] = [
  [`${IOS} Version/17.5 Mobile/15E148 Safari/604.1`, 5, 'iPhone · Safari'],
  // Kairos added to the Home Screen: the same Safari, without the word.
  [`${IOS} Mobile/15E148`, 5, 'iPhone · Safari'],
  [`${IOS} CriOS/126.0.6478.54 Mobile/15E148 Safari/604.1`, 5, 'iPhone · Chrome'],
  [`${IOS} FxiOS/127.0 Mobile/15E148 Safari/605.1.15`, 5, 'iPhone · Firefox'],
  [`${IOS} EdgiOS/126.0.2592.56 Version/17.0 Mobile/15E148 Safari/604.1`, 5, 'iPhone · Edge'],
  [`${IOS} Mobile/15E148 Instagram 334.0.4.32.98 (iPhone15,3; iOS 17_5; en_US)`, 5, 'iPhone · Other browser'],
  ['Mozilla/5.0 (iPad; CPU OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1', 5, 'iPad · Safari'],
  // An iPad asks for desktop pages and says "Macintosh"; only its touch screen tells it from a Mac.
  [MAC_SAFARI, 5, 'iPad · Safari'],
  [MAC_SAFARI, 0, 'Mac · Safari'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 0, 'Mac · Chrome'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:127.0) Gecko/20100101 Firefox/127.0', 0, 'Mac · Firefox'],
  [`${ANDROID} Chrome/126.0.0.0 Mobile Safari/537.36`, 5, 'Android · Chrome'],
  ['Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36', 5, 'Android · Samsung Internet'],
  ['Mozilla/5.0 (Android 14; Mobile; rv:127.0) Gecko/127.0 Firefox/127.0', 5, 'Android · Firefox'],
  [`${ANDROID} Chrome/126.0.0.0 Mobile Safari/537.36 EdgA/126.0.0.0`, 5, 'Android · Edge'],
  [`${ANDROID} Chrome/119.0.0.0 Mobile Safari/537.36 OPR/79.0.4195.76781`, 5, 'Android · Opera'],
  // A page shown inside another app.
  ['Mozilla/5.0 (Linux; Android 13; Pixel 7 Build/TQ3A.230805.001; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36', 5, 'Android · Other browser'],
  [`${WINDOWS} Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0`, 0, 'Windows · Edge'],
  [`${WINDOWS} Chrome/126.0.0.0 Safari/537.36`, 0, 'Windows · Chrome'],
  [`${WINDOWS} Chrome/126.0.0.0 Safari/537.36 OPR/111.0.0.0`, 0, 'Windows · Opera'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0', 0, 'Windows · Firefox'],
  ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 0, 'Linux · Chrome'],
  ['Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0', 0, 'Linux · Firefox'],
  // Safari's engine away from Apple (GNOME Web) is not Safari.
  ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15', 0, 'Linux · Other browser'],
  ['Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36', 0, 'Chromebook · Chrome'],
  ['Mozilla/5.0 (PlayStation; PlayStation 5/2.26) AppleWebKit/605.1.15 (KHTML, like Gecko)', 0, 'Other device'],
  ['', 0, 'Other device'],
];

describe('T-062e describeThisDevice: a coarse name from the fixed list (D275)', () => {
  it('keeps the same names as the activation Worker, in the same order', async () => {
    const worker = await server();
    expect(DEVICE_LABELS).toEqual(worker.DEVICE_LABELS);
    expect(DEVICE_LABELS).toHaveLength(50);
    expect(DEVICE_PLATFORMS).toEqual(worker.DEVICE_PLATFORMS);
    expect(DEVICE_BROWSERS).toEqual(worker.DEVICE_BROWSERS);
    expect(OTHER_DEVICE).toBe(worker.OTHER_DEVICE);
  });

  it.each(CASES)('names %s (touch points %i) as %s', async (userAgent, maxTouchPoints, label) => {
    const worker = await server();
    const name = describeThisDevice({ userAgent, maxTouchPoints });
    expect(name).toBe(label);
    expect(worker.isDeviceLabel(name)).toBe(true);
  });

  it('gives only names the Worker accepts, whatever the browser says', async () => {
    const worker = await server();
    const words = ['iPhone', 'iPad', 'Android', 'Macintosh', 'Windows', 'Linux', 'CrOS', 'Chrome/1', 'CriOS/1', 'Safari/1', 'AppleWebKit/1', 'Firefox/1', 'Edg/1', 'OPR/1', 'SamsungBrowser/1', '; wv)', 'FBAN/1', '<b>', '·', 'iPhone · Safari', '\u0000', ' '];
    let seed = 7;
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed; };
    for (let round = 0; round < 500; round += 1) {
      const userAgent = Array.from({ length: next() % 6 }, () => words[next() % words.length]).join(' ');
      const name = describeThisDevice({ userAgent, maxTouchPoints: next() % 3 });
      expect(worker.isDeviceLabel(name), userAgent).toBe(true);
    }
  });
});
