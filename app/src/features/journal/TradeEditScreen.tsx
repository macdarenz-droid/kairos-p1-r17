import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router';
import { getJournalHistoryEntry, JOURNAL_HISTORY_SOURCES, type JournalHistoryEntry, type JournalHistoryScope } from '../../application/journal';
import { canEditSavedTrade, editSavedTrade, REPLAY_TRADE_CANNOT_CHANGE } from '../../application/trades/editSavedTrade';
import { editableTradeDraft } from '../../application/trades/savedTradeDraft';
import { tradeRevision } from '../../application/trades/tradeRevision';
import { kairosDatabase, type KairosDatabase } from '../../data/database';
import type { TradeSource } from '../../domain/trades';
import { ErrorState, PageHeader } from '../../design-system/primitives';
import { TradeForm } from './TradeForm';
import { arrivedNoticeState, noticeOnReturn, openedFromTradePage, tradePageHref } from './tradeAddress';
import './tradePageScreen.css';

const TITLE = 'kairos-trade-edit-title';

type Read =
  | Readonly<{ kind: 'reading' }>
  | Readonly<{ kind: 'shown'; entry: JournalHistoryEntry; round: number }>
  | Readonly<{ kind: 'missing' }>
  | Readonly<{ kind: 'failed' }>;

/**
 * U15 (D263): "Edit your BTCUSDT trade", at `/journal/trades/:id/edit` or `/practice/trades/:id/edit`: the trade form,
 * All details, filled from the saved trade, with its note. Save goes back to the trade's page with "Changes saved." and
 * focus on its heading (the shell's, D179), and Back from there goes where the trade's page was opened from; Cancel
 * goes back. A stale save offers "Load the new version". Replay trades have no form.
 */
export function TradeEditScreen({ db = kairosDatabase, scope }: { readonly db?: KairosDatabase; readonly scope: JournalHistoryScope }) {
  const { id = '' } = useParams();
  return <TradeEdit key={id} db={db} scope={scope} id={id} />;
}

function TradeEdit({ db, scope, id }: { readonly db: KairosDatabase; readonly scope: JournalHistoryScope; readonly id: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [read, setRead] = useState<Read>({ kind: 'reading' });
  const refocus = useRef(false);
  const load = useCallback(async (): Promise<void> => {
    const found = await getJournalHistoryEntry(db, id).then(entry => entry, () => undefined);
    setRead(previous => found === undefined ? { kind: 'failed' }
      : found !== null && (JOURNAL_HISTORY_SOURCES[scope] as readonly TradeSource[]).includes(found.trade.source)
        ? { kind: 'shown', entry: found, round: previous.kind === 'shown' ? previous.round + 1 : 0 }
        : { kind: 'missing' });
  }, [db, id, scope]);
  useEffect(() => { void load(); }, [load]);
  // After "Try again" or "Load the new version" the button that was pressed is gone: focus goes to the heading.
  useEffect(() => {
    if (!refocus.current || read.kind === 'reading') return;
    refocus.current = false;
    if (read.kind === 'failed') document.querySelector<HTMLElement>('.kairos-trade-page__failed button')?.focus();
    else document.getElementById(TITLE)?.focus();
  }, [read]);
  const again = () => { refocus.current = true; void load(); };

  const page = tradePageHref(id, scope);
  if (read.kind === 'reading') return <section className="kairos-route kairos-journal kairos-trade-page" aria-busy="true"><p role="status">Loading your trade…</p></section>;
  if (read.kind === 'failed') return <section className="kairos-route kairos-journal kairos-trade-page" aria-labelledby={TITLE}>
    <PageHeader title="Edit your trade" titleId={TITLE} />
    <ErrorState className="kairos-trade-page__failed" message="Kairos could not read this trade. Your saved trades were not changed." onRetry={again} />
  </section>;
  if (read.kind === 'missing') return <section className="kairos-route kairos-journal kairos-trade-page" aria-labelledby={TITLE}>
    <PageHeader title="This trade isn't in your journal." titleId={TITLE} />
    <p>It may have been deleted, or it belongs to {scope === 'practice' ? 'your Journal' : 'Practice'}. <Link to={scope === 'practice' ? '/practice' : '/journal'}>Go to {scope === 'practice' ? 'Practice' : 'your journal'}</Link></p>
  </section>;

  const { entry } = read;
  const title = `Edit your ${entry.trade.symbol} trade`;
  if (!canEditSavedTrade(entry.trade.source, scope)) return <section className="kairos-route kairos-journal kairos-trade-page" aria-labelledby={TITLE}>
    <PageHeader title={title} titleId={TITLE} />
    <p>{REPLAY_TRADE_CANNOT_CHANGE} You can still write its note on <Link to={page}>its page</Link>.</p>
  </section>;

  // Back where Edit was opened from; with nothing to go back to in this visit, to the trade's page.
  const back = () => { if (location.key !== 'default') navigate(-1); else navigate(page, { replace: true }); };
  return <section className="kairos-route kairos-journal kairos-trade-edit" aria-labelledby={TITLE}>
    <PageHeader eyebrow={scope === 'practice' ? 'Practice trade' : 'Your trade'} title={title} titleId={TITLE} />
    <TradeForm key={read.round} db={db} kind={scope === 'practice' ? 'practice' : 'journal'}
      editing={{
        saved: editableTradeDraft(entry),
        save: typed => editSavedTrade(db, { ...typed, tradeId: entry.trade.id, expectedRevision: tradeRevision(entry), scope }),
        onCancel: back,
        onLoadNewVersion: again,
      }}
      onSaved={async () => {
        // Back to the trade's page Edit was opened from; opened any other way, the trade's page takes Edit's place.
        if (openedFromTradePage(location.state) && location.key !== 'default') { noticeOnReturn(page, 'Changes saved.'); navigate(-1); }
        else navigate(page, { replace: true, state: arrivedNoticeState('Changes saved.') });
      }} />
  </section>;
}
