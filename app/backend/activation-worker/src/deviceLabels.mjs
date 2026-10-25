// @ts-check
/**
 * The device names (D275), in one place: the activation Worker accepts only these, and the app's describeThisDevice
 * (T-062e) picks one of them. A name is coarse on purpose: a platform and a browser from the lists below, or
 * "Other device". No free text, no version numbers, nothing that could tell one phone from another.
 * Plain JavaScript with JSDoc, so the Worker bundles it and other code can import it or test against it as it is.
 */

/** Shown when an app build sends no name, for a device the lists don't cover, and for devices from before D275. */
export const OTHER_DEVICE = 'Other device';

/** @type {readonly string[]} */
export const DEVICE_PLATFORMS = Object.freeze(['iPhone', 'iPad', 'Android', 'Mac', 'Windows', 'Linux', 'Chromebook']);

/** @type {readonly string[]} */
export const DEVICE_BROWSERS = Object.freeze(['Safari', 'Chrome', 'Edge', 'Firefox', 'Samsung Internet', 'Opera', 'Other browser']);

const SEPARATOR = ' · ';

/** Every allowed name: each platform with each browser ("iPhone · Safari"), then "Other device". */
/** @type {readonly string[]} */
export const DEVICE_LABELS = Object.freeze([
  ...DEVICE_PLATFORMS.flatMap((platform) => DEVICE_BROWSERS.map((browser) => `${platform}${SEPARATOR}${browser}`)),
  OTHER_DEVICE,
]);

const ALLOWED = new Set(DEVICE_LABELS);

/**
 * The name for a platform and a browser, or "Other device" when either is not on its list.
 * @param {string} platform
 * @param {string} browser
 * @returns {string}
 */
export function deviceLabel(platform, browser) {
  return DEVICE_PLATFORMS.includes(platform) && DEVICE_BROWSERS.includes(browser) ? `${platform}${SEPARATOR}${browser}` : OTHER_DEVICE;
}

/**
 * Whether a value is exactly one of the allowed names.
 * @param {unknown} value
 * @returns {value is string}
 */
export function isDeviceLabel(value) {
  return typeof value === 'string' && ALLOWED.has(value);
}
