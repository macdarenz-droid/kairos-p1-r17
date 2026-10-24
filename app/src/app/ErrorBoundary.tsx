import { Component, useLayoutEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { createBrowserBackupDownloadPorts, describeBackupFailure, runBackup, type RunBackupResult } from '../application/backup';
import { kairosDatabase } from '../data/database';
import { describeThrownValue, diagnostics } from '../diagnostics/DiagnosticsService';
import { describeCrash } from '../diagnostics/crashDetails';
import { Button } from '../design-system/primitives';
import { createBackupDelivery } from '../features/backup/backupDelivery';
import { browserClipboard, CopyErrorDetails, type ErrorDetailsClipboard } from '../features/shell/CopyErrorDetails';
import './crashScreen.css';

/** What the crash screen does in the browser; tests pass fakes. */
export interface CrashScreenPorts {
  /** A backup handed over as a download only (D230). */
  readonly downloadCopy: () => Promise<RunBackupResult>;
  readonly clipboard: ErrorDetailsClipboard | null;
  readonly reload: () => void;
}

const browserCrashPorts = (): CrashScreenPorts => ({
  downloadCopy: () => runBackup(kairosDatabase, createBackupDelivery({ downloads: createBrowserBackupDownloadPorts(window) })),
  clipboard: browserClipboard(),
  reload: () => window.location.reload(),
});

type Copy = Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'busy' }> | Readonly<{ kind: 'done'; message: string; failed: boolean }>;

/** The words after "Download a copy of my data". */
function describeCopy(result: RunBackupResult): Readonly<{ message: string; failed: boolean }> {
  if (result.ok) return { message: `Downloaded ${result.file.fileName}.`, failed: false };
  // The file was handed over; only noting when failed.
  if (result.reason === 'record-failed') return { message: describeBackupFailure(result) ?? '', failed: false };
  return { message: 'Kairos could not make a copy. Nothing was changed.', failed: true };
}

/**
 * T-054e (D230): never a dead end. Inside the theme and outside the router (so no router links): Reload, a copy of the
 * journal as a download, and the error details to send for help. Focus goes to the heading.
 */
function CrashScreen({ error, componentStack, ports }: { readonly error: unknown; readonly componentStack: string | null; readonly ports: CrashScreenPorts }) {
  const heading = useRef<HTMLHeadingElement>(null);
  const [copy, setCopy] = useState<Copy>({ kind: 'idle' });
  useLayoutEffect(() => { heading.current?.focus(); }, []);

  async function downloadCopy(): Promise<void> {
    if (copy.kind === 'busy') return;
    setCopy({ kind: 'busy' });
    const result = await ports.downloadCopy().catch((): RunBackupResult => ({ ok: false, reason: 'delivery-failed' }));
    setCopy({ kind: 'done', ...describeCopy(result) });
  }

  return <main className="kairos-crash">
    <section className="kairos-crash__panel" aria-labelledby="kairos-crash-title">
      {/* The alert is the heading and its sentence only, so the status lines below are not live regions inside it. */}
      <div className="kairos-crash__alert" role="alert">
        <h1 id="kairos-crash-title" ref={heading} tabIndex={-1}>Kairos hit a problem</h1>
        <p>Your journal is safe on this device. Reload to try again.</p>
      </div>
      <div className="kairos-crash__actions">
        <Button emphasis="main" onClick={ports.reload}>Reload</Button>
        <Button variant="secondary" onClick={() => { void downloadCopy(); }} aria-disabled={copy.kind === 'busy' || undefined}>{copy.kind === 'busy' ? 'Making a copy…' : 'Download a copy of my data'}</Button>
      </div>
      {copy.kind === 'done' ? <p role="status" className={copy.failed ? 'kairos-crash__problem' : undefined}>{copy.message}</p> : null}
      <CopyErrorDetails details={() => describeCrash(error, componentStack)} clipboard={ports.clipboard} />
    </section>
  </main>;
}

interface Props { readonly children: ReactNode; readonly ports?: CrashScreenPorts }
interface State { readonly crashed: boolean; readonly error: unknown; readonly componentStack: string | null }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { crashed: false, error: null, componentStack: null };

  static getDerivedStateFromError(error: unknown): Partial<State> { return { crashed: true, error }; }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    diagnostics.record({
      level: 'error',
      category: 'app',
      event: 'render_error',
      context: { ...describeThrownValue(error), componentStack: info.componentStack },
    });
    this.setState({ componentStack: info.componentStack ?? null });
  }

  render(): ReactNode {
    if (this.state.crashed) return <CrashScreen error={this.state.error} componentStack={this.state.componentStack} ports={this.props.ports ?? browserCrashPorts()} />;
    return this.props.children;
  }
}
