/**
 * P24 leverage picture: the one owner of the leverage ratio shown to a person and of the two bar lengths. Reuses calculateLeverageRatio and decimalScaleToSteps; nothing is stored.
 */

import { decimalCompare, decimalRound, decimalScaleToSteps } from '../../domain/calculations/decimalKernel';
import { calculateLeverageRatio } from '../../domain/calculations/leverageCalculator';
import { LEARN_PICTURE_LEVERAGE_STEPS, type LearnPictureSpec } from '../../domain/learn/learnPicture';
import type { DecimalString } from '../../domain/trades';
import { parsePlanningNumber } from './positionSizePlan';

export type LeverageField = 'accountSize' | 'tradeValue';
export interface LeverageProblem { readonly field: LeverageField | null; readonly reason: 'missing' | 'not-a-number' | 'must-be-positive' | 'calculation-failed' }
export interface LeveragePicture {
  readonly accountSize: DecimalString; readonly tradeValue: DecimalString;
  /** calculateLeverageRatio(tradeValue, accountSize), exact */
  readonly ratio: DecimalString;
  /** decimalRound(ratio, 2, 'half-up') */
  readonly ratioShown: DecimalString;
  /** ratioShown differs from ratio */
  readonly ratioIsRounded: boolean;
  /** ratio > 1 */
  readonly usesBorrowedMoney: boolean;
  /** { kind: 'leverage', accountSteps, tradeSteps } */
  readonly picture: LearnPictureSpec;
}
export type LeveragePictureResult = { readonly ok: true; readonly picture: LeveragePicture } | { readonly ok: false; readonly problems: readonly LeverageProblem[] };

const FIELDS: readonly LeverageField[] = ['accountSize', 'tradeValue'];
const refuse = (...problems: LeverageProblem[]): LeveragePictureResult => Object.freeze({ ok: false, problems: Object.freeze(problems.map((problem) => Object.freeze(problem))) });
const failed = (): LeveragePictureResult => refuse({ field: null, reason: 'calculation-failed' });

export function projectLeveragePicture(input: Readonly<Record<LeverageField, string>>): LeveragePictureResult {
  const values: Partial<Record<LeverageField, DecimalString>> = {};
  const problems: LeverageProblem[] = [];
  for (const field of FIELDS) {
    const parsed = parsePlanningNumber(input[field]);
    if (parsed.ok) values[field] = parsed.value;
    else problems.push({ field, reason: parsed.reason });
  }
  if (problems.length > 0) return refuse(...problems);
  const { accountSize, tradeValue } = values as Record<LeverageField, DecimalString>;

  const ratio = calculateLeverageRatio(tradeValue, accountSize);
  if (!ratio.ok) return failed();
  const shown = decimalRound(ratio.value, 2, 'half-up');
  if (!shown.ok) return failed();
  const rounded = decimalCompare(shown.value, ratio.value);
  const borrowed = decimalCompare(ratio.value, '1');
  const order = decimalCompare(accountSize, tradeValue);
  if (rounded === null || borrowed === null || order === null) return failed();

  const full = LEARN_PICTURE_LEVERAGE_STEPS;
  let accountSteps: number | null = full;
  let tradeSteps: number | null = full;
  if (order === 1) tradeSteps = decimalScaleToSteps(tradeValue, accountSize, full);
  else if (order === -1) accountSteps = decimalScaleToSteps(accountSize, tradeValue, full);
  if (accountSteps === null || tradeSteps === null) return failed();

  return Object.freeze({
    ok: true,
    picture: Object.freeze({
      accountSize, tradeValue,
      ratio: ratio.value,
      ratioShown: shown.value,
      ratioIsRounded: rounded !== 0,
      usesBorrowedMoney: borrowed === 1,
      picture: Object.freeze({ kind: 'leverage', accountSteps, tradeSteps } as const),
    }),
  });
}
