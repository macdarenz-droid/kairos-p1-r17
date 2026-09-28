import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import type { GlossaryTerm } from '../src/domain/learn/glossary';
import type { LearnPictureSpec } from '../src/domain/learn/learnPicture';
import { GlossaryTermCard } from '../src/features/learn/GlossaryTermCard';
import { describeLearnPicture, LearnPicture } from '../src/features/learn/LearnPicture';

afterEach(cleanup);

const parts = (image: HTMLElement) => [...image.querySelectorAll('[data-part]')].map((part) => part.getAttribute('data-part'));
const lineY = (image: HTMLElement, part: string) => Number(image.querySelector(`[data-part="${part}"] line`)!.getAttribute('y1'));
const barWidth = (image: HTMLElement, part: string) => Number(image.querySelector(`[data-part="${part}"] rect`)!.getAttribute('width'));

describe('P24.4 LearnPicture', () => {
  it('draws each kind with its parts and a plain description', () => {
    const cases: [LearnPictureSpec, string[]][] = [
      [{ kind: 'risk-box', side: 'long', target: true, highlight: null }, ['risk', 'reward', 'entry', 'stop', 'target']],
      [{ kind: 'candle', direction: 'up' }, ['wick', 'body']],
      [{ kind: 'result-bars', highlight: null }, ['before-fees', 'fees', 'after-fees']],
      [{ kind: 'leverage', accountSteps: 4, tradeSteps: 20 }, ['account', 'trade']],
    ];
    for (const [spec, expected] of cases) {
      const image = render(<LearnPicture spec={spec} />).getByRole('img', { name: describeLearnPicture(spec) });
      expect(parts(image)).toEqual(expected);
      cleanup();
    }
    expect(describeLearnPicture({ kind: 'risk-box', side: 'short', target: true, highlight: 'risk' })).toBe('A sell (short) plan: the stop is above the entry, the target is below it. The part you can lose is marked.');
    expect(describeLearnPicture({ kind: 'leverage', accountSteps: 20, tradeSteps: 20 })).toBe('Two bars, your money and your trade: your trade is the same size as your money.');
  });

  it('marks exactly the highlighted part', () => {
    render(<LearnPicture spec={{ kind: 'risk-box', side: 'long', target: true, highlight: 'stop' }} />);
    const marked = screen.getByRole('img').querySelectorAll('[data-highlight="true"]');
    expect(marked).toHaveLength(1);
    expect(marked[0].getAttribute('data-part')).toBe('stop');
  });

  it('draws no target without a target, and a short stop above the entry', () => {
    render(<LearnPicture spec={{ kind: 'risk-box', side: 'long', target: false, highlight: null }} />);
    expect(parts(screen.getByRole('img'))).toEqual(['risk', 'entry', 'stop']);
    cleanup();
    render(<LearnPicture spec={{ kind: 'risk-box', side: 'short', target: true, highlight: null }} />);
    const image = screen.getByRole('img');
    expect(lineY(image, 'stop')).toBeLessThan(lineY(image, 'entry'));
  });

  it('takes other words and another name', () => {
    render(<LearnPicture spec={{ kind: 'risk-box', side: 'long', target: false, highlight: 'risk' }} labels={{ risk: 'Lose 10' }} title="Your plan" />);
    const image = screen.getByRole('img', { name: 'Your plan' });
    expect(within(image).getByText('Lose 10')).toBeTruthy();
  });

  it('draws the leverage bars to scale, never thinner than 2', () => {
    render(<LearnPicture spec={{ kind: 'leverage', accountSteps: 4, tradeSteps: 20 }} />);
    let image = screen.getByRole('img');
    expect(image.querySelector('[data-part="account"]')!.getAttribute('data-steps')).toBe('4');
    expect(image.querySelector('[data-part="trade"]')!.getAttribute('data-steps')).toBe('20');
    expect(barWidth(image, 'trade')).toBeGreaterThan(barWidth(image, 'account'));
    cleanup();
    render(<LearnPicture spec={{ kind: 'leverage', accountSteps: 20, tradeSteps: 0 }} />);
    image = screen.getByRole('img');
    expect(barWidth(image, 'trade')).toBe(2);
  });
});

const word = (id: string, plainWords: string, overrides: Partial<GlossaryTerm> = {}): GlossaryTerm => ({
  id, plainWords, tradingTerm: `Term ${id}`, alsoCalled: [], explanation: `About ${id}.`, picture: null, related: [], ...overrides,
});
const stop = word('stop', 'Stop');
const target = word('target', 'Target', {
  tradingTerm: 'Take-profit (TP)', alsoCalled: ['a', 'b'], explanation: 'Where you take your win.',
  picture: { kind: 'risk-box', side: 'long', target: true, highlight: 'target' }, related: ['stop'],
});

describe('P24.4 GlossaryTermCard', () => {
  it('shows one word inside and outside a router', () => {
    for (const wrap of [(node: React.ReactNode) => <MemoryRouter>{node}</MemoryRouter>, (node: React.ReactNode) => node]) {
      render(<>{wrap(<GlossaryTermCard term={target} related={[stop]} heading="h3" />)}</>);
      const card = screen.getByRole('article', { name: 'Target' });
      expect(within(card).getByRole('heading', { level: 3, name: 'Target' })).toBeTruthy();
      expect(within(card).getByText(/Traders call it:/)).toHaveTextContent('Traders call it: Take-profit (TP)');
      expect(within(card).getByText('Where you take your win.')).toBeTruthy();
      expect(within(card).getByRole('img', { name: describeLearnPicture(target.picture!) })).toBeTruthy();
      expect(within(card).getByText('Also called: a · b')).toBeTruthy();
      expect(within(card).getByRole('link', { name: 'Stop' }).getAttribute('href')).toBe('/library/words?term=stop');
      cleanup();
    }
  });

  it('renders no heading when asked not to', () => {
    const { container } = render(<GlossaryTermCard term={stop} related={[]} heading={null} />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.querySelector('.kairos-glossary-term__related')).toBeNull();
    expect(container.querySelector('.kairos-glossary-term__also')).toBeNull();
  });

  it('marks and focuses the selected word', () => {
    render(<GlossaryTermCard term={stop} related={[]} heading="h2" selected focus />);
    const card = screen.getByRole('article', { name: 'Stop' });
    expect(card.getAttribute('data-selected')).toBe('true');
    expect(document.activeElement).toBe(card);
  });
});
