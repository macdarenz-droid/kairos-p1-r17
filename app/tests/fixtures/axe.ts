import axe from 'axe-core';
import { vi } from 'vitest';

/**
 * WCAG 2.0–2.2 A and AA problems inside `root`, as `rule-id:count` strings (the same tags as the real-app check).
 * Colour contrast is off: jsdom has no layout; colours are checked by the theme owner and in the real browser.
 * Portals (Sheet, ConfirmDialog) render into `document.body`, so pass `document.body` when one is open.
 */
export async function axeViolations(root: Element): Promise<string[]> {
  // Under fake timers axe.run never finishes, and every later call then fails with "Axe is already running".
  const fake = vi.isFakeTimers();
  if (fake) vi.useRealTimers();
  try {
    const result = await axe.run(root, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    return result.violations.map(violation => `${violation.id}:${violation.nodes.length}`);
  } finally {
    if (fake) vi.useFakeTimers();
  }
}
