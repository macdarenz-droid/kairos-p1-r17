import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { Button, Card, Field, Sheet } from '../src/design-system/primitives';

describe('Button', () => {
  it('submits a form only when asked to', () => {
    const submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<form onSubmit={submit}><Button>Plain</Button><Button type="submit">Send</Button></form>);
    fireEvent.click(screen.getByRole('button', { name: 'Plain' }));
    expect(submit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it('is disabled and announced as busy only while busy', () => {
    const { rerender } = render(<Button busy>Saving…</Button>);
    const button = screen.getByRole('button', { name: 'Saving…' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    rerender(<Button>Saving…</Button>);
    expect(button).toBeEnabled();
    expect(button).not.toHaveAttribute('aria-busy');
  });
});

describe('Field', () => {
  it('labels the control and describes it with the hint', () => {
    render(<Field label="Symbol" hint="Such as BTCUSDT.">{control => <input {...control} />}</Field>);
    const input = screen.getByLabelText('Symbol');
    expect(input).toHaveAccessibleDescription('Such as BTCUSDT.');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-required');
  });

  it('shows "Required" and sets aria-required', () => {
    render(<Field label="Market" required>{control => <select {...control}><option>Crypto</option></select>}</Field>);
    const select = screen.getByRole('combobox');
    expect(screen.getByText('Required')).toBeInTheDocument();
    expect(select).toHaveAccessibleName('Market Required');
    expect(select).toHaveAttribute('aria-required', 'true');
  });

  it('marks the control invalid only when told', () => {
    const { rerender } = render(<Field label="Price" invalid>{control => <input {...control} />}</Field>);
    expect(screen.getByLabelText('Price')).toHaveAttribute('aria-invalid', 'true');
    rerender(<Field label="Price">{control => <input {...control} />}</Field>);
    expect(screen.getByLabelText('Price')).not.toHaveAttribute('aria-invalid');
  });

  it('adds the error text to the description without a second alert', () => {
    render(<Field label="Price" hint="In the trade currency." error="Enter a number above 0.">{control => <input {...control} />}</Field>);
    const input = screen.getByLabelText('Price');
    expect(input).toHaveAccessibleDescription('In the trade currency. Enter a number above 0.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('Card', () => {
  it('renders the chosen element and passes its props through', () => {
    render(<Card as="article" data-goal="monthly-result"><h2>Result</h2></Card>);
    const article = screen.getByRole('article');
    expect(article).toHaveAttribute('data-goal', 'monthly-result');
    expect(article).toHaveTextContent('Result');
  });

  it('works as a form', () => {
    const submit = vi.fn((event: { preventDefault: () => void }) => event.preventDefault());
    render(<Card as="form" aria-label="Targets" onSubmit={submit} noValidate><Button type="submit">Save</Button></Card>);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(submit).toHaveBeenCalledTimes(1);
  });
});

function SheetHarness({ onClose }: { readonly onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" onClick={() => setOpen(true)}>Open</button>
    <Sheet open={open} title="Your trade" onClose={() => { onClose?.(); setOpen(false); }}>
      <button type="button">Share</button>
    </Sheet>
  </>;
}

describe('Sheet', () => {
  it('renders nothing while closed', () => {
    render(<Sheet open={false} title="Your trade" onClose={() => undefined}>Body</Sheet>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('opens focused, keeps Tab inside and gives focus back on close', () => {
    render(<SheetHarness />);
    const opener = screen.getByRole('button', { name: 'Open' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('dialog', { name: 'Your trade' });
    expect(dialog).toHaveFocus();

    const close = screen.getByRole('button', { name: 'Close' });
    const share = screen.getByRole('button', { name: 'Share' });
    share.focus();
    fireEvent.keyDown(share, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true });
    expect(share).toHaveFocus();

    fireEvent.click(close);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(opener).toHaveFocus();
  });

  it('closes on Escape, on Close and on a backdrop click', () => {
    const onClose = vi.fn();
    const { container } = render(<SheetHarness onClose={onClose} />);
    const open = () => fireEvent.click(screen.getByRole('button', { name: 'Open' }));

    open();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);

    open();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(2);

    open();
    const backdrop = document.body.querySelector('[data-sheet-backdrop]');
    expect(backdrop).not.toBeNull();
    expect(container.contains(backdrop)).toBe(false);
    fireEvent.click(backdrop!);
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
