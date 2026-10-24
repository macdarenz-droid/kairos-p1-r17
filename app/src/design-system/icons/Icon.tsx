import type { ReactElement } from 'react';

export const ICON_NAMES = ['home', 'journal', 'analysis', 'library', 'more', 'plus', 'check', 'close', 'info', 'alert', 'retry', 'undo', 'trash', 'chevron-down', 'result-up', 'result-down', 'result-flat', 'result-unknown', 'insight', 'bubbles',
  'goal', 'strategy', 'calendar', 'practice', 'replay', 'currency', 'calculator', 'settings', 'profile', 'setup', 'backup', 'share'] as const;
export type IconName = (typeof ICON_NAMES)[number];
export interface IconProps { readonly name: IconName; readonly label?: string; readonly size?: 16 | 20 | 24 | 40; readonly className?: string }

/** Filled shapes for results (D180): the word says the meaning, the shape repeats it without colour. */
const filled = { fill: 'currentColor', stroke: 'none' } as const;

/** 1.6 px line drawings on a 24-unit grid; the five navigation drawings are the bottom bar's own. */
const drawings: Readonly<Record<IconName, ReactElement>> = Object.freeze({
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4v-5H9v5H5a1 1 0 0 1-1-1z" />,
  journal: <><path d="M6 4h10l3 3v13H6z" /><path d="M9 11h6M9 15h6" /></>,
  analysis: <><path d="M4 18 10 11l4 4 6-8" /><path d="M4 21h16" /></>,
  library: <path d="M5 4h4v16H5zM11 4h4v16h-4zM17 6l3 1-3 13-3-1z" />,
  more: <><circle cx="6" cy="12" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="18" cy="12" r="1.2" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  info: <><circle cx="12" cy="12" r="8.5" /><path d="M12 11v5.5" /><circle cx="12" cy="7.8" r=".6" /></>,
  alert: <><path d="M12 4 21 19.5H3z" /><path d="M12 10v4.5" /><circle cx="12" cy="17" r=".6" /></>,
  retry: <><path d="M19 12a7 7 0 1 1-2.05-4.95" /><path d="M19 4.5V9h-4.5" /></>,
  undo: <><path d="M9 7 4.5 11.5 9 16" /><path d="M4.5 11.5H15a4.5 4.5 0 0 1 0 9h-3" /></>,
  trash: <><path d="M4.5 7h15M10 4h4M6.5 7l1 13h9l1-13" /><path d="M10 11v5.5M14 11v5.5" /></>,
  'chevron-down': <path d="m6 9.5 6 6 6-6" />,
  'result-up': <path d="M12 5 20 18H4z" {...filled} />,
  'result-down': <path d="M12 19 4 6h16z" {...filled} />,
  'result-flat': <rect x="4" y="10.5" width="16" height="3" rx="1.5" {...filled} />,
  'result-unknown': <circle cx="12" cy="12" r="3.5" {...filled} />,
  insight: <><path d="M12 3.5v2M4.5 12h-2M21.5 12h-2M6.5 6.5 5 5M17.5 6.5 19 5" /><path d="M9 17.5h6M10 20.5h4" /><path d="M8.5 14.5a5 5 0 1 1 7 0c-.6.6-1 1.3-1 2v1h-5v-1c0-.7-.4-1.4-1-2z" /></>,
  bubbles: <><circle cx="9" cy="14" r="5" /><circle cx="16.5" cy="7.5" r="3.5" /><circle cx="18" cy="17" r="2" /></>,
  // The More page's drawings (D219), on the same grid and line.
  goal: <><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></>,
  strategy: <><path d="M8.5 5H7a1.5 1.5 0 0 0-1.5 1.5v13A1.5 1.5 0 0 0 7 21h10a1.5 1.5 0 0 0 1.5-1.5v-13A1.5 1.5 0 0 0 17 5h-1.5" /><path d="M9 3.5h6v3H9z" /><path d="m8.75 12.5 1.75 1.75 3.25-3.5M8.75 17.5h6.5" /></>,
  calendar: <><rect x="4" y="5.5" width="16" height="14.5" rx="1.5" /><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4" /></>,
  practice: <><path d="M9.5 3.5h5M10.5 3.5v6L5.4 18.2A1.5 1.5 0 0 0 6.7 20.5h10.6a1.5 1.5 0 0 0 1.3-2.3l-5.1-8.7v-6" /><path d="M8 15h8" /></>,
  replay: <><path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3" /><path d="M4.5 4.5V8H8" /><path d="M12 8.5V12l2.5 2" /></>,
  currency: <><rect x="3.5" y="6.5" width="17" height="11" rx="1.5" /><circle cx="12" cy="12" r="2.5" /><path d="M6.5 9.5v5M17.5 9.5v5" /></>,
  calculator: <><rect x="5.5" y="3.5" width="13" height="17" rx="1.5" /><path d="M8.5 7h7v3h-7z" /><path d="M8.5 14h.01M12 14h.01M15.5 14h.01M8.5 17.5h.01M12 17.5h.01M15.5 17.5h.01" /></>,
  settings: <><path d="M5 7h8M17 7h2M5 12h2M11 12h8M5 17h10" /><circle cx="15" cy="7" r="2" /><circle cx="9" cy="12" r="2" /><circle cx="17" cy="17" r="2" /></>,
  profile: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20a7 7 0 0 1 14 0" /></>,
  setup: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2.2 4.8-4.8 2.2 2.2-4.8z" /></>,
  backup: <><path d="M3.5 4.5h17v4h-17z" /><path d="M5 8.5v10A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5v-10" /><path d="M12 11v5.5M9.5 14l2.5 2.5 2.5-2.5" /></>,
  // Safari's Share: a box with an arrow out of its top (T-054c's Home Screen guide).
  share: <><path d="M8.5 9.5H7A1.5 1.5 0 0 0 5.5 11v8A1.5 1.5 0 0 0 7 20.5h10a1.5 1.5 0 0 0 1.5-1.5v-8A1.5 1.5 0 0 0 17 9.5h-1.5" /><path d="M12 3.5v10.5M8.75 6.75 12 3.5l3.25 3.25" /></>,
});

/** One icon. Without a label it is decoration and hidden from screen readers; with a label it is an image with that name. */
export function Icon({ name, label, size = 20, className }: IconProps) {
  const a11y = label === undefined ? { 'aria-hidden': true as const, focusable: 'false' as const } : { role: 'img', 'aria-label': label };
  return <svg viewBox="0 0 24 24" width={size} height={size} className={['kairos-icon', className].filter(Boolean).join(' ')} data-icon={name}
    fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" {...a11y}>{drawings[name]}</svg>;
}
