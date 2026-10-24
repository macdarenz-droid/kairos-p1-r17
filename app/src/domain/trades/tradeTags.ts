/** U11 (D239): at most this many tags on one trade. */
export const TRADE_TAGS_MAX = 10;
/** U11 (D239): at most this many characters in one tag. */
export const TRADE_TAG_MAX_LENGTH = 24;

export type TradeTagsResult =
  | Readonly<{ ok: true; tags: readonly string[] }>
  | Readonly<{ ok: false; reason: 'too-many' | 'too-long' }>;

/**
 * U11 (D239): tags written the one way, before the limits. Each tag is trimmed and its inner spaces joined into one; an empty
 * tag is dropped; a tag that differs from an earlier one only in case is left out, keeping the first spelling. The form shows these.
 */
export function writeTradeTags(input: readonly string[]): readonly string[] {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    const tag = raw.trim().replace(/\s+/g, ' ');
    const key = tag.toLowerCase();
    if (tag === '' || seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  return Object.freeze(tags);
}

/** U11 (D239): a trade's tags written the one way, within the limits: at most TRADE_TAGS_MAX tags of at most TRADE_TAG_MAX_LENGTH characters. */
export function normalizeTradeTags(input: readonly string[]): TradeTagsResult {
  const tags = writeTradeTags(input);
  if (tags.some(tag => Array.from(tag).length > TRADE_TAG_MAX_LENGTH)) return Object.freeze({ ok: false as const, reason: 'too-long' as const });
  if (tags.length > TRADE_TAGS_MAX) return Object.freeze({ ok: false as const, reason: 'too-many' as const });
  return Object.freeze({ ok: true as const, tags });
}

/** Whether stored tags are already in their one written form (a list of strings that normalizing leaves unchanged). */
export function areNormalTradeTags(value: unknown): value is readonly string[] {
  if (!Array.isArray(value) || !value.every(tag => typeof tag === 'string')) return false;
  const normalized = normalizeTradeTags(value);
  return normalized.ok && normalized.tags.length === value.length && normalized.tags.every((tag, index) => tag === value[index]);
}
