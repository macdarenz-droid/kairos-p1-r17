export const KAIROS_DEVICE_METADATA_PREFIX = 'device.' as const;

/** Device-scoped control state is intentionally excluded from user backups. */
export function isKairosDeviceScopedMetadataKey(key: string): boolean {
  return key.startsWith(KAIROS_DEVICE_METADATA_PREFIX);
}
