import { useId, useState, type ClipboardEvent, type FocusEvent, type InputHTMLAttributes, type Ref } from 'react';
import { readTypedDecimal } from '../../domain/trades/typedDecimal';
import './kit.css';

export interface PriceInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'inputMode' | 'value' | 'onChange'> {
  readonly value: string;
  readonly onValueChange: (text: string) => void;
  readonly ref?: Ref<HTMLInputElement>;
}

type Unclear = Readonly<{ text: string; joined: string; pointed: string }>;

/**
 * A number field for prices and amounts. A pasted or typed "1,234.50" becomes the exact decimal 1234.50 through the
 * domain's one reader (D176); a text it cannot read without guessing ("1,234") stays as typed, with a note that asks.
 */
export function PriceInput({ value, onValueChange, onPaste, onBlur, className, 'aria-describedby': describedBy, ...rest }: PriceInputProps) {
  const noteId = useId();
  const [unclear, setUnclear] = useState<Unclear | null>(null);
  const shownNote = unclear !== null && unclear.text === value ? unclear : null;

  function handlePaste(event: ClipboardEvent<HTMLInputElement>): void {
    onPaste?.(event);
    if (event.defaultPrevented) return;
    const input = event.currentTarget;
    const allSelected = input.selectionStart === 0 && input.selectionEnd === input.value.length;
    if (input.value !== '' && !allSelected) return;
    const reading = readTypedDecimal(event.clipboardData.getData('text'));
    if (!reading.ok) return;
    event.preventDefault();
    onValueChange(reading.value);
  }

  function handleBlur(event: FocusEvent<HTMLInputElement>): void {
    onBlur?.(event);
    const reading = readTypedDecimal(event.currentTarget.value);
    if (reading.ok) { if (reading.changed) onValueChange(reading.value); return; }
    if (reading.reason === 'unclear-separator') setUnclear({ text: event.currentTarget.value, joined: reading.readings[0], pointed: reading.readings[1] });
  }

  const describedByIds = [describedBy, shownNote !== null ? noteId : null].filter(Boolean).join(' ') || undefined;
  return <>
    <input {...rest} type="text" inputMode="decimal" autoComplete="off" spellCheck={false}
      className={['kairos-price-input', className].filter(Boolean).join(' ')} value={value} aria-describedby={describedByIds}
      onChange={event => onValueChange(event.currentTarget.value)} onPaste={handlePaste} onBlur={handleBlur} />
    {shownNote !== null ? <small id={noteId} className="kairos-price-input__note">
      Kairos can't tell if {shownNote.text.trim()} means {shownNote.joined} or {shownNote.pointed}. Type a dot for the decimal point, for example 1234.50.
    </small> : null}
  </>;
}
