import { createContext, useContext } from 'react';

/**
 * P27.2 Library → Analysis handoff: the market to select and, optionally, the
 * saved record to open once its list is loaded. Carried in the Analysis URL as
 * `market=<venue>:<instrument>` and `open=<analysis|snapshot>:<id>`, parsed once
 * by the route and provided through context so the released workspace and
 * control mounts stay byte-identical. Absent handoff means the released flow.
 */
export interface AnalysisHandoff {
  readonly market: Readonly<{ venue: string; instrument: string }>;
  readonly open: Readonly<{ kind: 'analysis' | 'snapshot'; id: string }> | null;
}

export const ANALYSIS_HANDOFF_DEFAULT_INTERVAL = '5m' as const;

export function parseAnalysisHandoff(params: URLSearchParams): AnalysisHandoff | null {
  const market = params.get('market');
  if (market === null) return null;
  const separator = market.indexOf(':');
  if (separator <= 0 || separator === market.length - 1) return null;
  const venue = market.slice(0, separator), instrument = market.slice(separator + 1);
  const open = params.get('open');
  let opened: AnalysisHandoff['open'] = null;
  if (open !== null) {
    const at = open.indexOf(':');
    const kind = at > 0 ? open.slice(0, at) : '', id = at > 0 ? open.slice(at + 1) : '';
    if ((kind === 'analysis' || kind === 'snapshot') && id !== '') opened = Object.freeze({ kind, id });
  }
  return Object.freeze({ market: Object.freeze({ venue, instrument }), open: opened });
}

export function analysisHandoffHref(market: Readonly<{ venue: string; instrument: string }>, open: Readonly<{ kind: 'analysis' | 'snapshot'; id: string }> | null): string {
  const params = new URLSearchParams();
  params.set('market', `${market.venue}:${market.instrument}`);
  if (open !== null) params.set('open', `${open.kind}:${open.id}`);
  return `/analysis?${params.toString()}`;
}

export const AnalysisHandoffContext = createContext<AnalysisHandoff | null>(null);

export function useAnalysisHandoff(): AnalysisHandoff | null {
  return useContext(AnalysisHandoffContext);
}
