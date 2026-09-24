/** Missing-row guidance only. Presence of rows does not certify a complete result. */
export function JournalClosedTradeGuidance({ status, types }: { readonly status: string; readonly types: readonly string[] }) {
  if (status !== 'closed') return null;
  const hasEntry = types.includes('entry'), hasExit = types.includes('exit');
  if (hasEntry && hasExit) return null;
  const missing = !hasEntry && !hasExit ? 'No actual entries or exits are recorded.' : !hasEntry ? 'No actual entry is recorded.' : 'No actual exit is recorded.';
  return <p className="kairos-trade-form__section-copy" role="note" aria-label="Result guidance">
    {missing} You can save this trade now, but its result stays unavailable until you add the entry and exit prices, quantities and times. Opened and closed times alone are not entries or exits.
  </p>;
}
