import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ICON_NAMES, Icon } from '../src/design-system';
import { Button, EmptyState, ErrorState, PageHeader, ResultText, Skeleton, StatTile } from '../src/design-system/primitives';
import { axeViolations } from './fixtures/axe';

afterEach(cleanup);

const page = (children: ReactNode) => render(<main><h1>Kit</h1>{children}</main>);
const iconOf = (element: Element) => element.querySelector('svg')?.getAttribute('data-icon');

describe('T-049c Icon', () => {
  it('draws every icon, hidden from screen readers unless it has a label', () => {
    for (const name of ICON_NAMES) {
      const { container, unmount } = render(<Icon name={name} />);
      const svg = container.querySelector('svg')!;
      expect(svg.getAttribute('data-icon'), name).toBe(name);
      expect(svg.children.length, name).toBeGreaterThan(0);
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      unmount();
    }
    render(<Icon name="result-up" label="Profit" />);
    expect(screen.getByRole('img', { name: 'Profit' })).toHaveAttribute('data-icon', 'result-up');
  });
});

describe('T-049c PageHeader', () => {
  it('renders the heading, eyebrow and intro, and explains itself in a sheet', () => {
    render(<PageHeader title="Coach" titleId="coach-title" eyebrow="Practice" intro="One tip from your own trades." howItWorks={<p>Kairos reads your saved trades.</p>} />);
    const heading = screen.getByRole('heading', { level: 1, name: 'Coach' });
    expect(heading).toHaveAttribute('id', 'coach-title');
    expect(heading).toHaveAttribute('tabindex', '-1');
    expect(screen.getByText('Practice')).toBeInTheDocument();
    expect(screen.getByText('One tip from your own trades.')).toBeInTheDocument();

    const how = screen.getByRole('button', { name: 'How this works' });
    how.focus();
    fireEvent.click(how);
    const dialog = screen.getByRole('dialog', { name: 'How this works' });
    expect(within(dialog).getByText('Kairos reads your saved trades.')).toBeInTheDocument();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(how);
  });

  it('marks the insight look', () => {
    const { container } = render(<PageHeader title="Patterns" titleId="patterns-title" tone="insight" />);
    expect(container.querySelector('header')).toHaveAttribute('data-tone', 'insight');
    expect(screen.queryByRole('button', { name: 'How this works' })).toBeNull();
  });
});

describe('T-049c StatTile', () => {
  it('is a term and its value, with an optional glow and mark', () => {
    const { container } = render(<dl className="kairos-stat-grid"><StatTile label="Win rate" value="60%" hint="Last 10 trades" mark="up" emphasis="main" /></dl>);
    expect(screen.getByText('Win rate').closest('dt')).not.toBeNull();
    expect(screen.getByText('60%').tagName).toBe('DD');
    expect(screen.getByText('Last 10 trades').tagName).toBe('DD');
    const tile = container.querySelector('.kairos-stat')!;
    expect(tile).toHaveAttribute('data-kairos-emphasis', 'main');
    expect(iconOf(tile)).toBe('result-up');
  });
});

describe('T-049c ResultText', () => {
  it('shows the word, the shape and the sign exactly as given', () => {
    const { container, rerender } = render(<ResultText outcome="profit" label="Profit" amount="10" currency="USD" />);
    expect(container).toHaveTextContent('Profit');
    expect(container.querySelector('.kairos-result__amount')).toHaveTextContent('+10 USD');
    expect(iconOf(container)).toBe('result-up');
    expect(container.querySelector('.kairos-result')).toHaveAttribute('data-outcome', 'profit');

    rerender(<ResultText outcome="loss" label="Loss" amount="-4" />);
    expect(container.querySelector('.kairos-result__amount')!.textContent).toBe('-4');
    expect(container).not.toHaveTextContent('+-4');
    expect(iconOf(container)).toBe('result-down');

    rerender(<ResultText outcome="breakeven" label="Break-even" amount="0" />);
    expect(container.querySelector('.kairos-result__amount')!.textContent).toBe('0');
    expect(iconOf(container)).toBe('result-flat');

    rerender(<ResultText outcome="unavailable" label="Not available" amount={null} />);
    expect(screen.getAllByText('Not available')).toHaveLength(1);
    expect(iconOf(container)).toBe('result-unknown');
  });

  it('keeps the label for screen readers only when asked', () => {
    render(<ResultText outcome="profit" label="Profit" amount="+2.5" showLabel={false} />);
    expect(screen.getByText('Profit')).toHaveClass('kairos-visually-hidden');
    expect(screen.getByText('+2.5')).toBeInTheDocument();
  });
});

describe('T-049c EmptyState', () => {
  it('has a heading, a hidden picture and one action', () => {
    const { container } = render(<EmptyState icon="journal" title="No trades yet" message="Log your first trade." headingLevel={3} action={<Button>Log a trade</Button>} />);
    expect(screen.getByRole('heading', { level: 3, name: 'No trades yet' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText('Log your first trade.')).toBeInTheDocument();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});

describe('T-049c ErrorState', () => {
  it('alerts with the message and a "Try again" button, or none', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState message="Your trades could not be read." onRetry={onRetry} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Your trades could not be read.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<ErrorState message="Your trades could not be read." retryLabel={null} onRetry={onRetry} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('keeps focus on the box while busy and gives it back to the button after', () => {
    const { rerender } = render(<ErrorState message="Not answered." onRetry={() => {}} />);
    const retry = screen.getByRole('button', { name: 'Try again' });
    retry.focus();
    // A browser moves focus off a button when it is disabled; jsdom does not, so blur it as the browser would.
    act(() => { retry.blur(); });
    rerender(<ErrorState message="Not answered." onRetry={() => {}} busy />);
    expect(retry).toBeDisabled();
    expect(document.activeElement).toBe(screen.getByRole('alert'));
    rerender(<ErrorState message="Not answered." onRetry={() => {}} />);
    expect(document.activeElement).toBe(retry);
  });
});

describe('T-049c Skeleton', () => {
  it('announces the label and hides its bars', () => {
    const { container } = render(<Skeleton label="Loading your trades" lines={5} />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading your trades');
    const bars = container.querySelector('[aria-hidden="true"]')!;
    expect(bars.children).toHaveLength(5);
  });
});

describe('T-049c axe', () => {
  it('finds no WCAG problem in any piece', async () => {
    const { container } = page(<>
      <Icon name="insight" label="Insight" />
      <PageHeader title="Home" titleId="home-title" eyebrow="Today" intro="Your day at a glance." howItWorks={<p>More.</p>} action={<Button size="sm">Add</Button>} />
      <dl className="kairos-stat-grid"><StatTile label="Trades" value="4" mark="flat" /></dl>
      <ResultText outcome="loss" label="Loss" amount="-3" currency="EUR" showLabel={false} />
      <EmptyState icon="journal" title="No trades yet" action={<Button>Log a trade</Button>} />
      <ErrorState message="Not answered." onRetry={() => {}} />
      <Skeleton label="Loading" />
    </>);
    expect(await axeViolations(container)).toEqual([]);
  });

  it('finds no WCAG problem with the "How this works" sheet open', async () => {
    page(<PageHeader title="Coach" titleId="coach-title" howItWorks={<p>Kairos reads your saved trades.</p>} />);
    fireEvent.click(screen.getByRole('button', { name: 'How this works' }));
    expect(await axeViolations(document.body)).toEqual([]);
  });
});
