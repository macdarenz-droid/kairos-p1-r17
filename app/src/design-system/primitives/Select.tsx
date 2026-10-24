import type { Ref, SelectHTMLAttributes } from 'react';
import { Icon } from '../icons/Icon';
import './kit.css';

export interface SelectOption { readonly value: string; readonly label: string; readonly disabled?: boolean }
export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  readonly options: readonly SelectOption[];
  /** A first option with the value '' that asks the person to choose. */
  readonly placeholder?: string;
  readonly ref?: Ref<HTMLSelectElement>;
}

/** A list to choose from. The native select stays, so phones show their own list. */
export function Select({ options, placeholder, className, ...rest }: SelectProps) {
  return <span className={['kairos-select', className].filter(Boolean).join(' ')}>
    <select {...rest}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {options.map(option => <option key={option.value} value={option.value} disabled={option.disabled}>{option.label}</option>)}
    </select>
    <Icon name="chevron-down" size={16} className="kairos-select__chevron" />
  </span>;
}
