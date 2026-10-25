import { useRef, type CSSProperties, type KeyboardEvent } from 'react';
import { Button } from './Button';
import type { ButtonSize } from './registry';
import './kit.css';

export interface SegmentedOption<T extends string> { readonly value: T; readonly label: string }
export interface SegmentedProps<T extends string> {
  readonly label: string;
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly size?: ButtonSize;
}

const MOVES: Readonly<Record<string, (index: number, count: number) => number>> = Object.freeze({
  ArrowLeft: (index, count) => (index - 1 + count) % count,
  ArrowRight: (index, count) => (index + 1) % count,
  Home: () => 0,
  End: (_index, count) => count - 1,
});

/** A small switch between a few views: a labelled group of toggle buttons with aria-pressed (D177), each one Tab stop. */
export function Segmented<T extends string>({ label, options, value, onChange, size = 'sm' }: SegmentedProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const chosen = Math.max(0, options.findIndex(option => option.value === value));
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const move = MOVES[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = move(index, options.length);
    buttons.current[next]?.focus();
    onChange(options[next]!.value);
  }
  const style = { '--kairos-segment-index': chosen, '--kairos-segment-count': options.length } as CSSProperties;
  return <div role="group" aria-label={label} className="kairos-segmented" style={style}>
    <span className="kairos-segmented__ink" aria-hidden="true" />
    {options.map((option, index) => <Button key={option.value} ref={element => { buttons.current[index] = element; }} variant="ghost" size={size}
      className="kairos-segmented__option" aria-pressed={option.value === value} onClick={() => onChange(option.value)}
      onKeyDown={event => handleKeyDown(event, index)}>{option.label}</Button>)}
  </div>;
}
