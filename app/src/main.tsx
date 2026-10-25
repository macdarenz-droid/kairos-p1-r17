import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { AppErrorBoundary, downloadJournalCopy } from './app/ErrorBoundary';
import { router } from './app/router';
import { describeThrownValue, diagnostics } from './diagnostics/DiagnosticsService';
import { applyInitialTheme, ThemeProvider } from './design-system/themes';
import { kairosDatabase, openKairosDatabase } from './data/database';
import { loadBackupReminder } from './application/backup';
import { loadTradedMarkets } from './application/setup/tradedMarkets';
import { loadVisualPnlTimeZone } from './application/visual-pnl/timeZonePreference';
import { ActivationBootstrap, type ActivationJournalPort } from './features/activation';
import { registerKairosServiceWorker } from './pwa/serviceWorkerRegistration';
import { startInstallPrompt } from './pwa/installPrompt';
import { inspectStorageDurability } from './pwa/storageDurability';
import '@fontsource-variable/inter/wght.css';
import './design-system/tokens.css';
import './design-system/accessibility.css';
import './shell.css';
import './design-system/shell/navigationShell.css';

diagnostics.record({ level: 'info', category: 'app', event: 'bootstrap' });
applyInitialTheme();
if (import.meta.env.PROD) void registerKairosServiceWorker();
void inspectStorageDurability();
// D228: listens before the browser offers its install prompt, which it does once per page.
startInstallPrompt();
const databaseStartup = openKairosDatabase().then(async (status) => {
  diagnostics.record({
    level: status.state === 'ready' ? 'info' : 'error',
    category: 'database',
    event: status.state === 'ready' ? 'database_ready' : 'database_open_failed',
    context: {
      schemaVersion: status.schemaVersion,
      ...(status.errorName ? { errorName: status.errorName } : {}),
      ...(status.errorMessage ? { errorMessage: status.errorMessage } : {}),
    },
  });
  // D223: the markets you trade are known before the app shows, so Home opens on its right view without a flash.
  if (status.state === 'ready') await loadTradedMarkets(kairosDatabase).catch(() => null);
  return status;
});

// D281: the invite screen says when this device's journal was last backed up and offers a copy, as the crash screen does.
const journal: ActivationJournalPort = {
  load: async () => {
    const [reminder, timeZone] = await Promise.all([loadBackupReminder(kairosDatabase), loadVisualPnlTimeZone(kairosDatabase)]);
    return { lastBackupAt: reminder.lastBackupAt, tradesSince: reminder.tradesSince, timeZone };
  },
  downloadCopy: downloadJournalCopy,
};

const root = document.getElementById('root');
if (!root) throw new Error('Kairos root element was not found.');

createRoot(root, {
  onUncaughtError(error, errorInfo) {
    diagnostics.record({
      level: 'error',
      category: 'app',
      event: 'react_uncaught_error',
      context: {
        ...describeThrownValue(error),
        componentStack: errorInfo.componentStack,
      },
    });
  },
  onRecoverableError(error, errorInfo) {
    diagnostics.record({
      level: 'warn',
      category: 'app',
      event: 'react_recoverable_error',
      context: {
        ...describeThrownValue(error),
        componentStack: errorInfo.componentStack,
      },
    });
  },
}).render(
  <StrictMode><ThemeProvider><AppErrorBoundary><ActivationBootstrap databaseStartup={databaseStartup} journal={journal}><RouterProvider router={router} /></ActivationBootstrap></AppErrorBoundary></ThemeProvider></StrictMode>,
);
