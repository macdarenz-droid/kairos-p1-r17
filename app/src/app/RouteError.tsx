import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { diagnostics } from '../diagnostics/DiagnosticsService';
import { describeCrash } from '../diagnostics/crashDetails';
import { CopyErrorDetails } from '../features/shell/CopyErrorDetails';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : 'This page could not be opened.';
  useEffect(() => {
    diagnostics.record({ level: 'error', category: 'routing', event: 'route_error', context: { message } });
  }, [message]);
  // T-054e (D230): beside "Reload", the details to send for help.
  return <section className="kairos-route" role="alert"><h1>Page unavailable</h1><p>{message}</p><button type="button" onClick={() => window.location.reload()}>Reload</button>
    <CopyErrorDetails details={() => describeCrash(error, null)} /></section>;
}
