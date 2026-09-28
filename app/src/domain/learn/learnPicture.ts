/**
 * P24 teaching pictures: declarative shapes that screens draw with one shared component (features/learn/LearnPicture.tsx). A shape holds no journal data, no SVG and no code.
 */

/** The longer bar of a leverage picture is always this many steps. */
export const LEARN_PICTURE_LEVERAGE_STEPS = 20;

export type LearnRiskBoxPart = 'entry' | 'stop' | 'target' | 'risk' | 'reward';
export type LearnResultBarsPart = 'before-fees' | 'fees' | 'after-fees';
export type LearnPictureSpec =
  | { readonly kind: 'risk-box'; readonly side: 'long' | 'short'; readonly target: boolean; readonly highlight: LearnRiskBoxPart | null }
  | { readonly kind: 'candle'; readonly direction: 'up' | 'down' }
  | { readonly kind: 'result-bars'; readonly highlight: LearnResultBarsPart | null }
  | { readonly kind: 'leverage'; readonly accountSteps: number; readonly tradeSteps: number };

const KEYS: Readonly<Record<LearnPictureSpec['kind'], readonly string[]>> = {
  'risk-box': ['kind', 'side', 'target', 'highlight'],
  candle: ['kind', 'direction'],
  'result-bars': ['kind', 'highlight'],
  leverage: ['kind', 'accountSteps', 'tradeSteps'],
};
const RISK_BOX_PARTS: readonly unknown[] = ['entry', 'stop', 'target', 'risk', 'reward'];
const RESULT_BARS_PARTS: readonly unknown[] = ['before-fees', 'fees', 'after-fees'];

const isPlainObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const isStep = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= LEARN_PICTURE_LEVERAGE_STEPS;

/** Reads one picture shape. It never throws: a frozen copy, or null when any rule fails. */
export function parseLearnPictureSpec(value: unknown): LearnPictureSpec | null {
  if (!isPlainObject(value)) return null;
  const kind = value.kind;
  if (typeof kind !== 'string' || !Object.hasOwn(KEYS, kind)) return null;
  const expected = KEYS[kind as LearnPictureSpec['kind']];
  const keys = Object.keys(value);
  if (keys.length !== expected.length || !expected.every((key) => keys.includes(key))) return null;
  switch (kind) {
    case 'risk-box': {
      const { side, target, highlight } = value;
      if (side !== 'long' && side !== 'short') return null;
      if (typeof target !== 'boolean') return null;
      if (highlight !== null && !RISK_BOX_PARTS.includes(highlight)) return null;
      if ((highlight === 'target' || highlight === 'reward') && !target) return null;
      return Object.freeze({ kind, side, target, highlight: highlight as LearnRiskBoxPart | null });
    }
    case 'candle': {
      const { direction } = value;
      if (direction !== 'up' && direction !== 'down') return null;
      return Object.freeze({ kind, direction });
    }
    case 'result-bars': {
      const { highlight } = value;
      if (highlight !== null && !RESULT_BARS_PARTS.includes(highlight)) return null;
      return Object.freeze({ kind, highlight: highlight as LearnResultBarsPart | null });
    }
    default: {
      const { accountSteps, tradeSteps } = value;
      if (!isStep(accountSteps) || !isStep(tradeSteps)) return null;
      if (Math.max(accountSteps, tradeSteps) !== LEARN_PICTURE_LEVERAGE_STEPS) return null;
      return Object.freeze({ kind: 'leverage' as const, accountSteps, tradeSteps });
    }
  }
}
