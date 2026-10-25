/**
 * T-062e (D275): this device's coarse name, sent with an invite code so the trader can tell their devices apart later
 * (More › Profile › Your devices). Only a name from the activation Worker's fixed list: a platform and a browser, or
 * "Other device". Never the browser's own text, a version number, or anything that could tell one phone from another.
 *
 * The Worker's `backend/activation-worker/src/deviceLabels.mjs` owns the list and refuses any other name. The app keeps
 * this copy because `src/` never imports a backend package (ARCHITECTURE §4); `tests/describe-this-device.test.ts`
 * proves the two lists are the same, name for name and in the same order.
 */

export const DEVICE_PLATFORMS = Object.freeze(['iPhone', 'iPad', 'Android', 'Mac', 'Windows', 'Linux', 'Chromebook'] as const);
export const DEVICE_BROWSERS = Object.freeze(['Safari', 'Chrome', 'Edge', 'Firefox', 'Samsung Internet', 'Opera', 'Other browser'] as const);
export const OTHER_DEVICE = 'Other device';

export type DevicePlatform = (typeof DEVICE_PLATFORMS)[number];
export type DeviceBrowser = (typeof DEVICE_BROWSERS)[number];
export type DeviceLabel = `${DevicePlatform} · ${DeviceBrowser}` | typeof OTHER_DEVICE;

const label = (platform: DevicePlatform, browser: DeviceBrowser): DeviceLabel => `${platform} · ${browser}`;

/** Every name the Worker accepts: each platform with each browser, then "Other device" (the Worker's order). */
export const DEVICE_LABELS: readonly DeviceLabel[] = Object.freeze([
  ...DEVICE_PLATFORMS.flatMap((platform) => DEVICE_BROWSERS.map((browser) => label(platform, browser))),
  OTHER_DEVICE,
]);

/** What the browser says about itself: `navigator.userAgent` and `navigator.maxTouchPoints`. */
export interface DeviceSignals {
  readonly userAgent: string;
  readonly maxTouchPoints: number;
}

function platformOf({ userAgent, maxTouchPoints }: DeviceSignals): DevicePlatform | null {
  // An iPad says "iPad", or, since iPadOS 13, "Macintosh" like a Mac; a Mac has no touch screen.
  if (/\biPad\b/.test(userAgent) || (/\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1)) return 'iPad';
  if (/\biPhone\b|\biPod\b/.test(userAgent)) return 'iPhone';
  if (/\bAndroid\b/.test(userAgent)) return 'Android';
  if (/\bCrOS\b/.test(userAgent)) return 'Chromebook';
  if (/\bWindows\b/.test(userAgent)) return 'Windows';
  if (/\bMacintosh\b|\bMac OS X\b/.test(userAgent)) return 'Mac';
  if (/\bLinux\b/.test(userAgent)) return 'Linux';
  return null;
}

/** Apps that show web pages inside themselves: not a browser the trader chose. */
const IN_APP = /\bFBAN\/|\bFBAV\/|\bInstagram\b|\bGSA\/|\bMicroMessenger\/|\bLine\/|; wv\)/;

function browserOf(userAgent: string, platform: DevicePlatform): DeviceBrowser {
  // Most browsers also name the ones they are built on, so the specific names come first.
  if (/\bSamsungBrowser\//.test(userAgent)) return 'Samsung Internet';
  if (/\bEdg(?:e|A|iOS)?\//.test(userAgent)) return 'Edge';
  if (/\bOPR\/|\bOPiOS\/|\bOPT\/|\bOpera\b/.test(userAgent)) return 'Opera';
  if (/\bFirefox\/|\bFxiOS\//.test(userAgent)) return 'Firefox';
  if (IN_APP.test(userAgent)) return 'Other browser';
  if (/\bCriOS\/|\bChrome\/|\bChromium\//.test(userAgent)) return 'Chrome';
  // On Apple devices the rest is Safari, the Home Screen app included (it doesn't always say "Safari").
  if ((platform === 'iPhone' || platform === 'iPad' || platform === 'Mac') && /\bAppleWebKit\//.test(userAgent)) return 'Safari';
  return 'Other browser';
}

/** This device's name from the fixed list, for example "iPhone · Safari" or "Windows · Edge"; "Other device" when unsure. */
export function describeThisDevice(signals: DeviceSignals): DeviceLabel {
  const platform = platformOf(signals);
  return platform === null ? OTHER_DEVICE : label(platform, browserOf(signals.userAgent, platform));
}
