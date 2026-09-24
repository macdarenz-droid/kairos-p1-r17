import { buildInfo } from '../app/buildInfo';

export type DiagnosticLevel = 'debug' | 'info' | 'warn' | 'error';
export type DiagnosticCategory =
  | 'app' | 'database' | 'migration' | 'trade' | 'calculation' | 'chart'
  | 'market' | 'theme' | 'routing' | 'service-worker' | 'import' | 'backup'
  | 'network' | 'performance';

export interface DiagnosticEvent {
  timestamp: string;
  level: DiagnosticLevel;
  category: DiagnosticCategory;
  event: string;
  context?: Readonly<Record<string, unknown>>;
  appVersion: string;
  buildId: string;
}

const unavailableContext = Object.freeze({
  diagnosticsContext: 'Context unavailable because it contains an unsupported value.',
});

function cloneContext(context: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  try {
    return structuredClone(context) as Record<string, unknown>;
  } catch {
    return unavailableContext;
  }
}


export function describeThrownValue(value: unknown): Readonly<Record<string, unknown>> {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  return {
    name: 'NonErrorThrownValue',
    message: typeof value === 'string' ? value : 'A non-Error value was thrown.',
    valueType: value === null ? 'null' : typeof value,
  };
}

export class DiagnosticsService {
  readonly #capacity: number;
  readonly #events: DiagnosticEvent[] = [];

  constructor(capacity = 200) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new Error('Diagnostics capacity must be a positive integer.');
    this.#capacity = capacity;
  }

  record(input: Omit<DiagnosticEvent, 'timestamp' | 'appVersion' | 'buildId'>): void {
    this.#events.push(Object.freeze({
      ...input,
      context: input.context ? cloneContext(input.context) : undefined,
      timestamp: new Date().toISOString(),
      appVersion: buildInfo.appVersion,
      buildId: buildInfo.buildId,
    }));
    if (this.#events.length > this.#capacity) this.#events.splice(0, this.#events.length - this.#capacity);
  }

  snapshot(): readonly DiagnosticEvent[] {
    return this.#events.map((event) => ({
      ...event,
      context: event.context ? cloneContext(event.context) : undefined,
    }));
  }
}

export const diagnostics = new DiagnosticsService();
