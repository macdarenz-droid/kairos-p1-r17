import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ActivationGate, type ActivationGateController } from '../src/features/activation';
import type { ActivationSnapshot } from '../src/services/activation';

function snapshot(status: ActivationSnapshot['status'], message: string | null = null): ActivationSnapshot {
  return { status, receipt: null, message };
}

function controller(overrides: Partial<ActivationGateController> = {}): ActivationGateController {
  return {
    bootstrap: vi.fn(async () => snapshot('activation-required')),
    activate: vi.fn(async () => snapshot('active-online')),
    ...overrides,
  };
}

describe('P7.6 activation presentation gate', () => {
  it('does not render journal routes before activation bootstrap completes', async () => {
    let resolveBootstrap!: (value: ActivationSnapshot) => void;
    const pending = new Promise<ActivationSnapshot>((resolve) => { resolveBootstrap = resolve; });
    const gate = controller({ bootstrap: vi.fn(() => pending) });

    render(<ActivationGate controller={gate} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);

    expect(screen.queryByRole('heading', { name: 'Journal core' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Checking activation');

    resolveBootstrap(snapshot('active-offline'));
    expect(await screen.findByRole('heading', { name: 'Journal core' })).toBeInTheDocument();
  });

  it('submits a normalized invite to the coordinator and renders the app only after success', async () => {
    const activate = vi.fn(async () => snapshot('active-online'));
    const gate = controller({ activate });

    render(<ActivationGate controller={gate} appVersion="0.1" buildId="build-7"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Activate Kairos' });

    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: '  INVITE-123  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate Kairos' }));

    await waitFor(() => expect(activate).toHaveBeenCalledWith({
      inviteCode: 'INVITE-123',
      appVersion: '0.1',
      buildId: 'build-7',
    }));
    expect(await screen.findByRole('heading', { name: 'Journal core' })).toBeInTheDocument();
  });

  it('keeps the gate closed and gives plain feedback when activation is rejected', async () => {
    const gate = controller({
      activate: vi.fn(async () => snapshot('rejected', 'This invite could not be activated.')),
    });

    render(<ActivationGate controller={gate} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Activate Kairos' });
    fireEvent.change(screen.getByLabelText('Invite code'), { target: { value: 'NOPE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Activate Kairos' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('This invite could not be activated.');
    expect(screen.queryByRole('heading', { name: 'Journal core' })).not.toBeInTheDocument();
  });

  it('identifies an empty invite as an input error without contacting the coordinator', async () => {
    const activate = vi.fn(async () => snapshot('active-online'));
    const gate = controller({ activate });

    render(<ActivationGate controller={gate} appVersion="0.1" buildId="test"><h2>Journal core</h2></ActivationGate>);
    await screen.findByRole('heading', { name: 'Activate Kairos' });
    fireEvent.click(screen.getByRole('button', { name: 'Activate Kairos' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Enter your invite code to continue.');
    expect(screen.getByLabelText('Invite code')).toHaveAttribute('aria-invalid', 'true');
    expect(activate).not.toHaveBeenCalled();
  });
});
