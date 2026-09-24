import { useEffect } from 'react';
import { isRouteErrorResponse, useRouteError } from 'react-router';
import { diagnostics } from '../diagnostics/DiagnosticsService';

export function RouteError() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error) ? `${error.status} ${error.statusText}` : 'This page could not be opened.';
  useEffect(() => {
    diagnostics.record({ level: 'error', category: 'routing', event: 'route_error', context: { message } });
  }, [message]);
  return <section className="kairos-route" role="alert"><h1>Page unavailable</h1><p>{message}</p></section>;
}
