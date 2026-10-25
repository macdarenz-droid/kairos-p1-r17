/**
 * P25.1 saved record label policy, shared by Saved Analyses (P20) and saved
 * time-assisted snapshots (P23): an optional, user-given, trimmed, non-empty
 * label of at most SAVED_RECORD_LABEL_MAX_LENGTH characters. An absent label is
 * always valid, so every released record and backup stays valid unchanged.
 */
export const SAVED_RECORD_LABEL_MAX_LENGTH = 80 as const;

export type SavedRecordLabelNormalization =
  | { readonly kind: 'absent' }
  | { readonly kind: 'label'; readonly label: string }
  | { readonly kind: 'invalid'; readonly reason: 'not-a-string' | 'too-long' };

export function normalizeSavedRecordLabel(value: unknown): SavedRecordLabelNormalization {
  if (value === undefined || value === null) return { kind: 'absent' };
  if (typeof value !== 'string') return { kind: 'invalid', reason: 'not-a-string' };
  const label = value.trim();
  if (label === '') return { kind: 'absent' };
  if (label.length > SAVED_RECORD_LABEL_MAX_LENGTH) return { kind: 'invalid', reason: 'too-long' };
  return { kind: 'label', label };
}

/** True for a stored label: absent, or exactly what normalization would have produced. */
export function isStoredSavedRecordLabel(value: unknown): boolean {
  if (value === undefined) return true;
  return typeof value === 'string' && value.trim() === value && value.length > 0 && value.length <= SAVED_RECORD_LABEL_MAX_LENGTH;
}
