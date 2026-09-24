import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { AppErrorBoundary } from './app/ErrorBoundary';
import { router } from './app/router';
import { describeThrownValue, diagnostics } from './diagnostics/DiagnosticsService';
import { applyInitialTheme, ThemeProvider } from './design-system/themes';
import { openKairosDatabase } from './data/database';
import { ActivationBootstrap } from './features/activation';
import { registerKairosServiceWorker } from './pwa/serviceWorkerRegistration';
import { inspectStorageDurability } from './pwa/storageDurability';
import './design-system/tokens.css';
import './design-system/accessibility.css';
import './shell.css';
import './design-system/shell/navigationShell.css';

diagnostics.record({ level: 'info', category: 'app', event: 'bootstrap' });
applyInitialTheme();
void registerKairosServiceWorker();
void inspectStorageDurability();
const databaseStartup = openKairosDatabase().then((status) => {
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
  return status;
});

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
  <StrictMode><ThemeProvider><AppErrorBoundary><ActivationBootstrap databaseStartup={databaseStartup}><RouterProvider router={router} /></ActivationBootstrap></AppErrorBoundary></ThemeProvider></StrictMode>,
);
