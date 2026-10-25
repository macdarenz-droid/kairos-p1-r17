import { useState, type ReactNode } from 'react';
import type { CoinLogoAddress } from '../../domain/market/coinLogo';
import './coinIcon.css';

/** The coins Kairos draws itself (48 × 48), for when no logo is kept. */
const DRAWN: Readonly<Record<string, ReactNode>> = Object.freeze({
  BTC: <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round"><path d="M15 11h13c14 0 14 13 0 13H15m0 0h15c14 0 14 14 0 14H15M18 10v29M23 5v5m8-5v5M23 39v5m8-5v5" /></g>,
  ETH: <><path fill="currentColor" opacity=".8" d="M24 2 9 25l15 9 15-9Z"/><path fill="currentColor" d="m9 29 15 17 15-17-15 9Z"/></>,
  SOL: <path fill="currentColor" d="m12 7 30 0-8 8H4Zm-8 13h30l8 8H12Zm8 13h30l-8 8H4Z"/>,
  BNB: <g fill="currentColor"><path d="m24 2 10 10-5 5-5-5-5 5-5-5ZM2 24l9-9 9 9-9 9Zm26 0 9-9 9 9-9 9ZM14 36l5-5 5 5 5-5 5 5-10 10Z"/><path d="m18 24 6-6 6 6-6 6Z"/></g>,
  XRP: <g fill="none" stroke="currentColor" strokeWidth="4"><path d="m5 8 12 12q7 7 14 0L43 8M5 40l12-12q7-7 14 0l12 12"/></g>,
  LINK: <path fill="none" stroke="currentColor" strokeWidth="5" d="m24 4 17 10v20L24 44 7 34V14Z"/>,
  SUI: <g fill="none" stroke="currentColor" strokeWidth="3"><path d="M24 3C19 13 8 23 8 32a16 16 0 0 0 32 0C40 23 29 13 24 3Z"/><path d="M18 21c-6 17 22 5 15 21"/></g>,
  ADA: <g fill="currentColor">{Array.from({ length: 12 }, (_, i) => <circle key={i} cx={24 + Math.cos(i * Math.PI / 6) * (i % 2 ? 18 : 12)} cy={24 + Math.sin(i * Math.PI / 6) * (i % 2 ? 18 : 12)} r={i % 2 ? 1.8 : 2.5} />)}<circle cx="24" cy="24" r="3" /></g>,
});

/** The coin a Binance market is shown as on Home (BTCUSDT → BTC; a market not priced in USDT keeps its whole symbol). */
export function marketCoin(symbol: string): string {
  return symbol.endsWith('USDT') ? symbol.slice(0, -4) : symbol;
}

export interface CoinIconProps {
  /** The coin (BTC), as the bubble or sheet names it. */
  readonly coin: string;
  /** Its logo, already checked (parseCoinLogoAddress), when this device keeps one. */
  readonly logo?: CoinLogoAddress | null;
  /** The place's own class: `kairos-glass-icon` in a bubble, `kairos-market-sheet__icon` in the sheet. */
  readonly className: string;
}

/**
 * T-061f (D272): a coin's mark, one part for Home's two bubble maps and the market sheet: its real logo (a data
 * address the Kairos server sent, D272), else one of the 8 marks Kairos draws, else its first two letters. A logo
 * the browser cannot show falls back the same way. Always decoration (`alt=""`, hidden from screen readers): the
 * bubble's or the sheet's name says which coin it is.
 */
export function CoinIcon({ coin, logo = null, className }: CoinIconProps) {
  const [broken, setBroken] = useState<string | null>(null);
  const drawn = DRAWN[coin];
  const kind = logo !== null && logo !== broken ? 'logo' : drawn !== undefined ? 'drawn' : 'letters';
  return <span className={`kairos-coin-icon ${className}`} data-coin-icon={kind} data-fallback={kind === 'letters'} aria-hidden="true">
    {kind === 'logo' ? <img src={logo!} alt="" draggable={false} decoding="async" onError={() => setBroken(logo)} />
      : kind === 'drawn' ? <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">{drawn}</svg>
      : coin.slice(0, 2)}
  </span>;
}
