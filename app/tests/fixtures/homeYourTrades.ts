import { loadHomeYourTrades, type HomeYourTrade } from '../../src/application/dashboard/homeDashboardYourTradesQuery';
import { readVisualPnlTimeZonePreference, writeVisualPnlTimeZonePreference } from '../../src/application/visual-pnl';
import type { KairosDatabase } from '../../src/data/database';
import { createKairosRepositories } from '../../src/data/repositories';

/**
 * T-061d (D270): what Home's "Your Trades" shows for all time: every real closed trade, newest close first, each with
 * its recorded result. The read needs a saved time zone, as on a phone (the view saves the device's first): UTC is
 * saved when none is.
 */
export async function homeYourTradesAllTime(db: KairosDatabase): Promise<readonly HomeYourTrade[]> {
  const { metadata } = createKairosRepositories(db);
  if (await readVisualPnlTimeZonePreference(metadata) === null) {
    const saved = await writeVisualPnlTimeZonePreference(metadata, 'UTC', '2026-10-25T12:00:00.000Z');
    if (!saved.ok) throw new Error('fixture: time zone');
  }
  const read = await loadHomeYourTrades(db, { choice: { kind: 'all' }, now: '2026-10-25T12:00:00.000Z' });
  if (read.kind !== 'ready') throw new Error(`fixture: ${JSON.stringify(read)}`);
  return read.trades;
}
