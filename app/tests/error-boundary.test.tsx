import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from '../src/app/ErrorBoundary';
import { diagnostics } from '../src/diagnostics/DiagnosticsService';

function BrokenChild(): never {
  throw new Error('test render failure');
}

describe('AppErrorBoundary', () => {
  it('replaces a failed render with the recovery shell and records diagnostics', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const before = diagnostics.snapshot().length;

    render(<AppErrorBoundary><BrokenChild /></AppErrorBoundary>);

    expect(screen.getByRole('alert')).toHaveTextContent('Kairos hit a problem');
    const events = diagnostics.snapshot().slice(before);
    expect(events.some((event) => event.event === 'render_error' && event.category === 'app')).toBe(true);
    consoleError.mockRestore();
  });
});
