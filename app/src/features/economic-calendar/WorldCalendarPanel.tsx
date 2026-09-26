import { useId, useState } from 'react';
import { Button, Card } from '../../design-system/primitives';
import { themeRegistry, useTheme } from '../../design-system/themes';

const TRADINGVIEW_SANDBOX = 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox';

/** TradingView's free events widget, in its own origin, in the theme's light or dark. */
export function tradingViewCalendarUrl(colorScheme: 'dark' | 'light'): string {
  return `https://www.tradingview-widget.com/embed-widget/events/?locale=en#${encodeURIComponent(JSON.stringify({
    colorTheme: colorScheme, isTransparent: false, width: '100%', height: '100%', importanceFilter: '0,1', countryFilter: 'us,eu,gb,jp,ca,au,nz,ch,cn',
  }))}`;
}

/** The only part that reads the theme, so screens without ThemeProvider still render the panel closed. */
function WorldCalendarFrame() {
  const { themeId } = useTheme();
  return <>
    <iframe title="Full world calendar by TradingView" src={tradingViewCalendarUrl(themeRegistry[themeId].colorScheme)} sandbox={TRADINGVIEW_SANDBOX}
      referrerPolicy="strict-origin-when-cross-origin" loading="lazy" className="kairos-news-calendar__frame" />
    <p><a href="https://www.tradingview.com/" target="_blank" rel="noopener nofollow noreferrer">Track all markets on TradingView</a></p>
  </>;
}

/** P34 (D150): TradingView's full world calendar, shown only after a tap and only to look at; Kairos never reads it. */
export function WorldCalendarPanel() {
  const [open, setOpen] = useState(false);
  const headingId = useId();
  const frameId = useId();
  return <Card as="section" className="kairos-news-calendar-card" aria-labelledby={headingId}>
    <h2 id={headingId}>The full world calendar</h2>
    <p>Official schedules miss some big news. TradingView's free calendar lists news from many countries, with its own sizes and expected numbers. TradingView shows it inside Kairos: Kairos cannot read it, save it or link it to your trades, and it needs a connection.</p>
    <div><Button variant="secondary" size="sm" aria-expanded={open} aria-controls={frameId} onClick={() => setOpen((value) => !value)}>{open ? "Hide TradingView's calendar" : "Show TradingView's calendar"}</Button></div>
    <div id={frameId}>{open ? <WorldCalendarFrame /> : null}</div>
  </Card>;
}
