import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router';
import { getJournalHistoryEntry, type JournalHistoryEntry } from '../../application/journal';
import { askToKeepDataOnce } from '../../application/setup/deviceKeeping';
import { loadTradedMarkets } from '../../application/setup/tradedMarkets';
import { kairosDatabase, type KairosDatabase } from '../../data/database';
import type { MarketType, TradeId } from '../../domain/trades';
import { Button, PageHeader, UnavailableNotice, useToast } from '../../design-system/primitives';
import { LOG_TRADE_FOCUS_STATE } from '../setup/GettingStartedCard';
import { TradeForm } from './TradeForm';
import { TradePicture } from './TradePicture';
import './logTradeScreen.css';

const TITLE = 'kairos-log-trade-title';
const SAVED_TITLE = 'kairos-log-trade-saved';
const wallClock = (): string => new Date().toISOString();

type Saved =
  | Readonly<{ kind: 'reading'; tradeId: TradeId }>
  | Readonly<{ kind: 'shown'; entry: JournalHistoryEntry }>
  | Readonly<{ kind: 'unreadable'; tradeId: TradeId }>;

/**
 * U14 (D258): "Log a trade", a page of its own at `/journal/log`. The form takes the full width and keeps what you type
 * (shared with the Journal page's form). After a save the page shows the new trade's picture, with "Log another trade"
 * and "See it in your journal". Symbol takes focus only when "+ Log trade" opened the page; otherwise the shell moves
 * focus to the heading (D179).
 */
export function LogTradeScreen({ db = kairosDatabase, now = wallClock }: { readonly db?: KairosDatabase; readonly now?: () => string }) {
  const location = useLocation();
  const fromButton = (location.state as Record<string, unknown> | null)?.[LOG_TRADE_FOCUS_STATE] === true;
  const [saved, setSaved] = useState<Saved | null>(null);
  const [firstMarket, setFirstMarket] = useState<MarketType | null>(null);
  const [formRound, setFormRound] = useState(0);
  const savedHeading = useRef<HTMLHeadingElement>(null);
  const toast = useToast();
  // D228: "Keep my data" is asked once, after a trade is saved in the Journal; one ask at a time.
  const asking = useRef(false);

  useEffect(() => {
    let ignore = false;
    loadTradedMarkets(db).then(markets => { if (!ignore) setFirstMarket(markets?.[0] ?? null); }, () => undefined);
    return () => { ignore = true; };
  }, [db]);
  useEffect(() => {
    if (fromButton && saved === null && formRound === 0) document.getElementById('kairos-trade-symbol')?.focus();
    // Once per arrival: the page's first form only.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (saved?.kind === 'reading') savedHeading.current?.focus();
  }, [saved?.kind]);

  async function onSaved(tradeId: TradeId): Promise<void> {
    setSaved({ kind: 'reading', tradeId });
    if (!asking.current) {
      asking.current = true;
      void askToKeepDataOnce(db, undefined, { now }).then(result => {
        if (result === 'kept') toast.show({ message: 'Kairos will keep your journal on this device.' });
      }).finally(() => { asking.current = false; });
    }
    await readBack(tradeId);
  }
  async function readBack(tradeId: TradeId): Promise<void> {
    const entry = await getJournalHistoryEntry(db, tradeId).catch(() => null);
    setSaved(current => (current !== null && current.kind !== 'shown' && current.tradeId === tradeId ? (entry === null ? { kind: 'unreadable', tradeId } : { kind: 'shown', entry }) : current));
  }
  function logAnother(): void {
    setSaved(null);
    setFormRound(current => current + 1);
    // The form is new: its first field takes focus, so it never falls to the page.
    requestAnimationFrame(() => document.getElementById('kairos-trade-symbol')?.focus());
  }

  return <section className="kairos-route kairos-journal kairos-log-trade-page" aria-labelledby={TITLE}>
    <PageHeader title="Log a trade" titleId={TITLE} />
    {saved === null ? <TradeForm key={formRound} db={db} kind="journal" defaultMarket={firstMarket} onSaved={onSaved} />
      : <section className="kairos-log-trade-page__saved" aria-labelledby={SAVED_TITLE}>
        <h2 id={SAVED_TITLE} ref={savedHeading} tabIndex={-1}>Trade saved to your journal.</h2>
        {saved.kind === 'shown' ? <TradePicture entry={saved.entry} variant="full" />
          : saved.kind === 'unreadable' ? <UnavailableNotice message="Kairos could not read your trade back to draw it. It is saved in your journal." retryLabel="Try again" onRetry={() => { void readBack(saved.tradeId); }} />
          : <p role="status">Drawing your trade…</p>}
        <div className="kairos-log-trade-page__next">
          <Button variant="primary" onClick={logAnother}>Log another trade</Button>
          <Link className="kairos-button kairos-button--secondary kairos-button--md" to="/journal">See it in your journal</Link>
        </div>
      </section>}
  </section>;
}
