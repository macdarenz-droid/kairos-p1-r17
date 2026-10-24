import { useRef } from 'react';
import { flushSync } from 'react-dom';
import { draftTradeTags } from '../../application/trades';
import { Button, Field } from '../../design-system/primitives';

interface TradeTagsFieldProps {
  readonly id: string;
  /** As typed: tags separated by commas. */
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly disabled?: boolean;
}

/**
 * U11 (D239): one text field for a trade's tags, split by commas and shown back as chips written the one way.
 * Removing a chip rewrites the field without it; focus moves to the next chip's button, else back to the field.
 */
export function TradeTagsField({ id, value, onChange, error, disabled = false }: TradeTagsFieldProps) {
  const tags = draftTradeTags(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  function remove(index: number): void {
    // The chips re-render from the new text; the one now at this place, else the last one, else the field takes focus.
    flushSync(() => onChange(tags.filter((_, at) => at !== index).join(', ')));
    const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [];
    (buttons[Math.min(index, buttons.length - 1)] ?? inputRef.current)?.focus();
  }

  return <div className="kairos-trade-form__tags">
    <Field label="Tags" id={id} wide hint="Optional. Separate tags with commas, such as breakout, London open." error={error}>
      {control => <input {...control} ref={inputRef} name="tags" value={value} onChange={event => onChange(event.target.value)} autoComplete="off" disabled={disabled} />}
    </Field>
    {tags.length > 0 ? <ul ref={listRef} className="kairos-trade-form__tag-list" aria-label="Your tags">
      {tags.map((tag, index) => <li key={tag} className="kairos-trade-form__tag">
        <span>{tag}</span>
        <Button variant="ghost" size="sm" aria-label={`Remove tag ${tag}`} disabled={disabled} onClick={() => remove(index)}>×</Button>
      </li>)}
    </ul> : null}
  </div>;
}
