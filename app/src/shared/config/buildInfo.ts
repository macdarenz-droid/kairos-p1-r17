export const APP_NAME = 'Kairos Trading Journal';
export const APP_VERSION = __KAIROS_APP_VERSION__;
export const BUILD_ID = import.meta.env.VITE_BUILD_ID?.trim() || 'dev-local';

export const buildInfo = Object.freeze({
  appName: APP_NAME,
  appVersion: APP_VERSION,
  buildId: BUILD_ID,
});
