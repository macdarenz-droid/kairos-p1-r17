import type { TradeDisciplineId } from './disciplineTypes';

/** Canonical stable id for a discipline record, allocated once and never derived from the trade id. */
export function createTradeDisciplineId(): TradeDisciplineId {
  return crypto.randomUUID() as TradeDisciplineId;
}
