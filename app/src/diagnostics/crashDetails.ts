/**
 * T-054e (D230): the plain text "Copy error details" gives, to send for help. It holds the version, the time, the error,
 * where it happened and what the app did just before, and never journal data:
 * - the crash's own error: its name and message, never its stack (file paths);
 * - the component stack, its first 20 lines: component names, and in a release build the app's script addresses;
 * - the last 20 diagnostics events: when, level, category and event name, plus only the context fields in
 *   `SAFE_CONTEXT_KEYS`. Every other field (`message`, `errorMessage`, `stack`, `componentStack`, and anything a future
 *   event adds, such as a symbol or a price) is left out.
 */

import { buildInfo } from '../shared/config/buildInfo';
import { diagnostics, type DiagnosticEvent } from './DiagnosticsService';

export const CRASH_STACK_LINES = 20;
export const CRASH_EVENTS = 20;
/** Context fields that name what went wrong without any text a trader typed or saved. */
const SAFE_CONTEXT_KEYS: readonly string[] = Object.freeze(['name', 'errorName', 'schemaVersion', 'valueType']);

/** The crash's error as a name and a message; a value that is not an Error says only what kind of value it was. */
function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  if (typeof error === 'object' && error !== null && 'status' in error && 'statusText' in error) {
    const { status, statusText } = error as { readonly status: unknown; readonly statusText: unknown };
    return `Page error: ${String(status)} ${String(statusText)}`;
  }
  return `A ${error === null ? 'null' : typeof error} value was thrown, not an Error.`;
}

function describeEvent(event: DiagnosticEvent): string {
  const context = event.context === undefined ? [] : SAFE_CONTEXT_KEYS
    .filter(key => Object.hasOwn(event.context!, key))
    .map(key => {
      const value = event.context![key];
      return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? `${key}=${String(value)}` : null;
    })
    .filter((part): part is string => part !== null);
  return [event.timestamp, event.level, event.category, event.event, ...context].join(' ');
}

export function describeCrash(error: unknown, componentStack: string | null | undefined, dependencies: {
  readonly now?: () => string;
  readonly events?: readonly DiagnosticEvent[];
} = {}): string {
  const now = (dependencies.now ?? (() => new Date().toISOString()))();
  const stack = (componentStack ?? '').split('\n').map(line => line.trim()).filter(line => line !== '').slice(0, CRASH_STACK_LINES);
  const events = (dependencies.events ?? diagnostics.snapshot()).slice(-CRASH_EVENTS);
  return [
    `Kairos ${buildInfo.appVersion} · build ${buildInfo.buildId}`,
    `Time: ${now}`,
    `Error: ${describeError(error)}`,
    '',
    `Where (first ${CRASH_STACK_LINES} lines):`,
    ...(stack.length === 0 ? ['(not known)'] : stack),
    '',
    `Last ${CRASH_EVENTS} events:`,
    ...(events.length === 0 ? ['(none)'] : events.map(describeEvent)),
  ].join('\n');
}
