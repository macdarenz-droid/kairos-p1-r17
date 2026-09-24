import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { UpdatePrompt, type UpdatePromptPort } from '../src/features/shell/UpdatePrompt';

function fakePort() {
  let listener: ((status: { readonly hasWaitingUpdate: boolean }) => void) | null = null;
  const port: UpdatePromptPort = {
    subscribe: next => { listener = next; next({ hasWaitingUpdate: false }); return () => { listener = null; }; },
    activate: vi.fn(() => true),
  };
  return { port, publish: (hasWaitingUpdate: boolean) => act(() => listener?.({ hasWaitingUpdate })) };
}

describe('update prompt', () => {
  it('shows nothing until a new version waits, then updates on a tap', () => {
    const { port, publish } = fakePort();
    const { container } = render(<UpdatePrompt port={port} />);
    expect(container).toBeEmptyDOMElement();
    publish(true);
    expect(screen.getByText('A new version is ready.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));
    expect(port.activate).toHaveBeenCalledTimes(1);
    const button = screen.getByRole('button', { name: 'Updating…' });
    expect(button).toBeDisabled();
  });
});
