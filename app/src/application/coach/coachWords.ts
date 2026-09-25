/**
 * P29: the plain words of the offline coach. Every number is shown exactly as its owner gives it; nothing is worked out here except which sentence to use. Next steps are about process, never about the market.
 */

import type { TradePlanVsExecution } from '../trades/planVsExecution';

function stopSentence(stop: string, averageExit: string): string {
  return `Your stop was ${stop}, and you closed at ${averageExit} on average, beyond it.`;
}

function sizeSentence(planned: string, traded: string): string {
  return `You planned a size of ${planned} and traded ${traded}.`;
}

/** The card line: a sentence for a passed stop, then one for a bigger size; nothing else. */
export function describeTradePlanVsExecution(result: TradePlanVsExecution): readonly string[] {
  const lines: string[] = [];
  if (result.stop.verdict === 'passed') lines.push(stopSentence(result.stop.stop, result.stop.averageExit));
  if (result.size.verdict === 'bigger') lines.push(sizeSentence(result.size.planned, result.size.traded));
  return Object.freeze(lines);
}
