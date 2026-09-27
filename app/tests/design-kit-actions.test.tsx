import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, ConfirmDialog, Field, PriceInput, Segmented, Select, TOAST_MS, TOAST_WITH_ACTION_MS, ToastProvider, useToast, type ToastInput } from '../src/design-system/primitives';
import { axeViolations } from './fixtures/axe';

afterEach(() => { cleanup(); vi.useRealTimers(); });

function SegmentedHarness({ onChange }: { onChange?: (value: string) => void }) {
  const [value, setValue] = useState<'list' | 'calendar' | 'chart'>('list');
  return <Segmented label="View" value={value} options={[{ value: 'list', label: 'List' }, { value: 'calendar', label: 'Calendar' }, { value: 'chart', label: 'Chart' }]}
    onChange={next => { setValue(next); onChange?.(next); }} />;
}

describe('T-049d Segmented', () => {
  it('is a named group with one pressed option, chosen by click or arrows (wrapping)', () => {
    const onChange = vi.fn();
    render(<SegmentedHarness onChange={onChange} />);
    const group = screen.getByRole('group', { name: 'View' });
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Chart' }));
    expect(onChange).toHaveBeenLastCalledWith('chart');
    expect(screen.getByRole('button', { name: 'Chart' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Chart' }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('list');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'List' }));
    fireEvent.keyDown(screen.getByRole('button', { name: 'List' }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('chart');
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });
});

describe('T-049d Select', () => {
  it('is named by its field, starts on the placeholder, and hides its chevron', () => {
    const onChange = vi.fn();
    const { container } = render(<Field label="Side">{control => <Select {...control} placeholder="Choose a side" defaultValue="" onChange={onChange}
      options={[{ value: 'long', label: 'Buy (long)' }, { value: 'short', label: 'Sell (short)' }]} />}</Field>);
    const select = screen.getByLabelText('Side') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    expect(select.options[0]!.value).toBe('');
    expect(select.options[0]!.textContent).toBe('Choose a side');
    fireEvent.change(select, { target: { value: 'short' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
});

function PriceHarness({ onValue }: { onValue: (text: string) => void }) {
  const [text, setText] = useState('');
  return <Field label="Entry price" hint="What you paid for one.">{control => <PriceInput {...control} value={text} onValueChange={next => { setText(next); onValue(next); }} />}</Field>;
}

describe('T-049d PriceInput', () => {
  it('reads a pasted "1,234.50" as the exact decimal', () => {
    const onValue = vi.fn();
    render(<PriceHarness onValue={onValue} />);
    const input = screen.getByLabelText('Entry price') as HTMLInputElement;
    expect(input).toHaveAttribute('inputmode', 'decimal');
    fireEvent.paste(input, { clipboardData: { getData: () => '1,234.50' } });
    expect(onValue).toHaveBeenLastCalledWith('1234.50');
    expect(input.value).toBe('1234.50');
  });

  it('tidies "0,5" on blur, and asks about "1,234" without guessing', () => {
    const onValue = vi.fn();
    render(<PriceHarness onValue={onValue} />);
    const input = screen.getByLabelText('Entry price') as HTMLInputElement;
    fireEvent.change(input, { target: { value: '0,5' } });
    expect(onValue).toHaveBeenLastCalledWith('0,5');
    fireEvent.blur(input);
    expect(onValue).toHaveBeenLastCalledWith('0.5');

    fireEvent.change(input, { target: { value: '1,234' } });
    fireEvent.blur(input);
    expect(input.value).toBe('1,234');
    const note = screen.getByText("Kairos can't tell if 1,234 means 1234 or 1.234. Type a dot for the decimal point, for example 1234.50.");
    const hint = screen.getByText('What you paid for one.');
    expect(input.getAttribute('aria-describedby')!.split(' ')).toEqual([hint.id, note.id]);

    fireEvent.change(input, { target: { value: '1234' } });
    expect(screen.queryByText(/can't tell/)).toBeNull();
    expect(input.getAttribute('aria-describedby')).toBe(hint.id);
  });
});

function ConfirmHarness({ busy = false, onConfirm = () => {}, onCancelSpy = () => {} }: { busy?: boolean; onConfirm?: () => void; onCancelSpy?: () => void }) {
  const [open, setOpen] = useState(false);
  return <>
    <Button onClick={() => setOpen(true)}>Delete trade</Button>
    <ConfirmDialog open={open} title="Delete this trade?" message="It is removed from your journal." confirmLabel="Delete" cancelLabel="Keep it" tone="danger" busy={busy}
      onConfirm={onConfirm} onCancel={() => { onCancelSpy(); setOpen(false); }} />
  </>;
}

describe('T-049d ConfirmDialog', () => {
  it('asks first, starts on the safe button, keeps Tab inside and gives focus back', () => {
    const onCancel = vi.fn();
    render(<ConfirmHarness onCancelSpy={onCancel} />);
    const opener = screen.getByRole('button', { name: 'Delete trade' });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('alertdialog', { name: 'Delete this trade?' });
    expect(dialog).toHaveAccessibleDescription('It is removed from your journal.');
    const keep = screen.getByRole('button', { name: 'Keep it' });
    const remove = screen.getByRole('button', { name: 'Delete' });
    expect(document.activeElement).toBe(keep);
    remove.focus();
    fireEvent.keyDown(remove, { key: 'Tab' });
    expect(document.activeElement).toBe(keep);
    fireEvent.keyDown(keep, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(remove);
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  it('while busy, ignores Escape and disables both buttons', () => {
    const onCancel = vi.fn();
    render(<ConfirmHarness busy onCancelSpy={onCancel} />);
    fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
    const dialog = screen.getByRole('alertdialog');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Keep it' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Delete' })).toBeDisabled();
  });

  it('moves focus to the panel when busy starts on the pressed confirm button', () => {
    const props = { open: true, title: 'Delete this trade?', message: 'It is removed from your journal.', confirmLabel: 'Delete', cancelLabel: 'Keep it', onConfirm: () => {}, onCancel: () => {} };
    const { rerender } = render(<ConfirmDialog {...props} />);
    act(() => { screen.getByRole('button', { name: 'Delete' }).focus(); });
    rerender(<ConfirmDialog {...props} busy />);
    expect(document.activeElement).toBe(screen.getByRole('alertdialog'));
  });
});

function ToastButton({ toast, name }: { toast: ToastInput; name: string }) {
  const { show } = useToast();
  return <button type="button" onClick={() => show(toast)}>{name}</button>;
}

describe('T-049d Toast', () => {
  it('shows a message with Undo in the status region; Undo runs once and closes', () => {
    const undo = vi.fn();
    render(<ToastProvider><ToastButton name="remove" toast={{ message: 'Row removed.', action: { label: 'Undo', onAction: undo } }} /></ToastProvider>);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    fireEvent.click(screen.getByRole('button', { name: 'remove' }));
    expect(region).toHaveTextContent('Row removed.');
    fireEvent.click(within(region).getByRole('button', { name: 'Undo' }));
    expect(undo).toHaveBeenCalledTimes(1);
    expect(region).not.toHaveTextContent('Row removed.');
  });

  it('closes by itself after 6 s, or 10 s with an action, but not while focus is inside', () => {
    vi.useFakeTimers();
    render(<ToastProvider>
      <ToastButton name="plain" toast={{ message: 'Saved.' }} />
      <ToastButton name="undoable" toast={{ message: 'Row removed.', action: { label: 'Undo', onAction: () => {} } }} />
    </ToastProvider>);
    const region = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'plain' }));
    act(() => { vi.advanceTimersByTime(TOAST_MS - 1); });
    expect(region).toHaveTextContent('Saved.');
    act(() => { vi.advanceTimersByTime(1); });
    expect(region).not.toHaveTextContent('Saved.');

    fireEvent.click(screen.getByRole('button', { name: 'undoable' }));
    act(() => { vi.advanceTimersByTime(TOAST_MS); });
    expect(region).toHaveTextContent('Row removed.');
    act(() => { vi.advanceTimersByTime(TOAST_WITH_ACTION_MS - TOAST_MS); });
    expect(region).not.toHaveTextContent('Row removed.');

    fireEvent.click(screen.getByRole('button', { name: 'undoable' }));
    fireEvent.focus(screen.getByRole('button', { name: 'Undo' }));
    act(() => { vi.advanceTimersByTime(TOAST_WITH_ACTION_MS * 2); });
    expect(region).toHaveTextContent('Row removed.');
  });

  it('stays while focus is inside, even after the pointer leaves', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastButton name="undoable" toast={{ message: 'Row removed.', action: { label: 'Undo', onAction: () => {} } }} /></ToastProvider>);
    const region = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'undoable' }));
    act(() => { within(region).getByRole('button', { name: 'Undo' }).focus(); });
    const toast = region.firstElementChild!;
    fireEvent.pointerEnter(toast);
    fireEvent.pointerLeave(toast);
    act(() => { vi.advanceTimersByTime(TOAST_WITH_ACTION_MS * 2); });
    expect(region).toHaveTextContent('Row removed.');
  });

  it('stays while the pointer is over it, even after focus leaves', () => {
    vi.useFakeTimers();
    render(<ToastProvider><ToastButton name="undoable" toast={{ message: 'Row removed.', action: { label: 'Undo', onAction: () => {} } }} /></ToastProvider>);
    const region = screen.getByRole('status');
    const opener = screen.getByRole('button', { name: 'undoable' });
    fireEvent.click(opener);
    const toast = region.firstElementChild!;
    fireEvent.pointerEnter(toast);
    act(() => { within(region).getByRole('button', { name: 'Undo' }).focus(); });
    act(() => { opener.focus(); });
    act(() => { vi.advanceTimersByTime(TOAST_WITH_ACTION_MS * 2); });
    expect(region).toHaveTextContent('Row removed.');
  });

  it('gives focus back to where it came from when closed from inside', () => {
    render(<ToastProvider><ToastButton name="undoable" toast={{ message: 'Row removed.', action: { label: 'Undo', onAction: () => {} } }} /><button type="button">Outside</button></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'undoable' }));
    const outside = screen.getByRole('button', { name: 'Outside' });
    act(() => { outside.focus(); });
    const dismiss = within(screen.getByRole('status')).getByRole('button', { name: 'Dismiss' });
    act(() => { dismiss.focus(); });
    fireEvent.keyDown(dismiss, { key: 'Escape' });
    expect(screen.getByRole('status')).not.toHaveTextContent('Row removed.');
    expect(document.activeElement).toBe(outside);
  });

  it('replaces the current toast, and closes on Escape and Dismiss', () => {
    render(<ToastProvider>
      <ToastButton name="first" toast={{ message: 'First.' }} />
      <ToastButton name="second" toast={{ message: 'Second.' }} />
    </ToastProvider>);
    const region = screen.getByRole('status');
    fireEvent.click(screen.getByRole('button', { name: 'first' }));
    fireEvent.click(screen.getByRole('button', { name: 'second' }));
    expect(region).toHaveTextContent('Second.');
    expect(region).not.toHaveTextContent('First.');
    fireEvent.keyDown(screen.getByRole('button', { name: 'Dismiss' }), { key: 'Escape' });
    expect(region).not.toHaveTextContent('Second.');
    fireEvent.click(screen.getByRole('button', { name: 'first' }));
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(region).not.toHaveTextContent('First.');
  });

  it('does nothing, without throwing, outside a provider', () => {
    render(<ToastButton name="alone" toast={{ message: 'Nobody hears.' }} />);
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'alone' }))).not.toThrow();
  });
});

describe('T-049d axe', () => {
  it('finds no WCAG problem in the pieces', async () => {
    const { container } = render(<main><h1>Kit</h1>
      <SegmentedHarness />
      <Field label="Side">{control => <Select {...control} placeholder="Choose" defaultValue="" options={[{ value: 'long', label: 'Buy' }]} />}</Field>
      <PriceHarness onValue={() => {}} />
    </main>);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('finds no WCAG problem with the dialog open or a toast shown', async () => {
    render(<ToastProvider><main><h1>Kit</h1><ConfirmHarness /><ToastButton name="toast" toast={{ message: 'Row removed.', action: { label: 'Undo', onAction: () => {} } }} /></main></ToastProvider>);
    fireEvent.click(screen.getByRole('button', { name: 'toast' }));
    expect(await axeViolations(document.body)).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Delete trade' }));
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
