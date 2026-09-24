import type { ReactNode } from 'react';
import type { LearnPictureSpec, LearnResultBarsPart, LearnRiskBoxPart } from '../../domain/learn/learnPicture';
import './learn.css';

const RISK_BOX_WORDS: Readonly<Record<LearnRiskBoxPart, string>> = { entry: 'entry', stop: 'stop', target: 'target', risk: 'part you can lose', reward: 'part you can win' };
const RESULT_BARS_WORDS: Readonly<Record<LearnResultBarsPart, string>> = { 'before-fees': 'result before fees', fees: 'fees', 'after-fees': 'result after fees' };
const RISK_BOX_LABELS: Readonly<Record<LearnRiskBoxPart, string>> = { entry: 'Entry', stop: 'Stop', target: 'Target', risk: 'Risk', reward: 'Reward' };

/** The plain sentence a screen reader hears for a picture. */
export function describeLearnPicture(spec: LearnPictureSpec): string {
  switch (spec.kind) {
    case 'risk-box': {
      const long = spec.side === 'long';
      const target = spec.target ? `, the target is ${long ? 'above' : 'below'} it` : '';
      const marked = spec.highlight ? ` The ${RISK_BOX_WORDS[spec.highlight]} is marked.` : '';
      return `${long ? 'A buy (long) plan' : 'A sell (short) plan'}: the stop is ${long ? 'below' : 'above'} the entry${target}.${marked}`;
    }
    case 'candle':
      return `A ${spec.direction === 'up' ? 'rising' : 'falling'} candle: its body runs from where the price opened to where it closed, and the thin line shows the highest and lowest prices.`;
    case 'result-bars':
      return `Result before fees, minus fees, leaves the result after fees.${spec.highlight ? ` The ${RESULT_BARS_WORDS[spec.highlight]} bar is marked.` : ''}`;
    case 'leverage': {
      const size = spec.tradeSteps > spec.accountSteps ? 'bigger than' : spec.tradeSteps === spec.accountSteps ? 'the same size as' : 'smaller than';
      return `Two bars, your money and your trade: your trade is ${size} your money.`;
    }
  }
}

function Part({ part, highlight, children, ...rest }: { readonly part: string; readonly highlight: boolean; readonly children: ReactNode; readonly 'data-steps'?: number }) {
  return (
    <g data-part={part} data-highlight={highlight ? 'true' : undefined} className={highlight ? 'kairos-learn-picture__part--highlight' : undefined} {...rest}>
      {children}
    </g>
  );
}

function RiskBox({ spec, labels }: { readonly spec: Extract<LearnPictureSpec, { kind: 'risk-box' }>; readonly labels: Readonly<Partial<Record<LearnRiskBoxPart, string>>> }) {
  const long = spec.side === 'long';
  const entryY = 60;
  const stopY = long ? 100 : 20;
  const targetY = long ? 20 : 100;
  const label = (part: LearnRiskBoxPart) => labels[part] ?? RISK_BOX_LABELS[part];
  const is = (part: LearnRiskBoxPart) => spec.highlight === part;
  const zone = (part: 'risk' | 'reward', edgeY: number) => (
    <Part part={part} highlight={is(part)}>
      <rect className={`kairos-learn-picture__${part}`} x={12} y={Math.min(entryY, edgeY)} width={158} height={Math.abs(edgeY - entryY)} />
      <text x={18} y={(entryY + edgeY) / 2} dominantBaseline="middle">{label(part)}</text>
    </Part>
  );
  const line = (part: 'entry' | 'stop' | 'target', y: number) => (
    <Part part={part} highlight={is(part)}>
      <line className={`kairos-learn-picture__${part}`} x1={12} x2={170} y1={y} y2={y} />
      <text x={176} y={y} dominantBaseline="middle">{label(part)}</text>
    </Part>
  );
  return (
    <>
      {zone('risk', stopY)}
      {spec.target ? zone('reward', targetY) : null}
      {line('entry', entryY)}
      {line('stop', stopY)}
      {spec.target ? line('target', targetY) : null}
    </>
  );
}

function Candle({ spec }: { readonly spec: Extract<LearnPictureSpec, { kind: 'candle' }> }) {
  const up = spec.direction === 'up';
  const openY = up ? 84 : 36;
  const closeY = up ? 36 : 84;
  return (
    <>
      <Part part="wick" highlight={false}>
        <line className={`kairos-learn-picture__wick-${spec.direction}`} x1={80} x2={80} y1={12} y2={108} />
        <text x={112} y={12} dominantBaseline="middle">High</text>
        <text x={112} y={108} dominantBaseline="middle">Low</text>
      </Part>
      <Part part="body" highlight={false}>
        <rect className={`kairos-learn-picture__body-${spec.direction}`} x={64} y={36} width={32} height={48} />
        <text x={112} y={openY} dominantBaseline="middle">Open</text>
        <text x={112} y={closeY} dominantBaseline="middle">Close</text>
      </Part>
    </>
  );
}

const RESULT_BARS: readonly { readonly part: LearnResultBarsPart; readonly x: number; readonly top: number; readonly bottom: number; readonly label: string; readonly tone: 'gain' | 'cost' }[] = [
  { part: 'before-fees', x: 20, top: 20, bottom: 96, label: 'Before fees', tone: 'gain' },
  { part: 'fees', x: 92, top: 20, bottom: 34, label: 'Fees', tone: 'cost' },
  { part: 'after-fees', x: 164, top: 34, bottom: 96, label: 'After fees', tone: 'gain' },
];

function ResultBars({ spec }: { readonly spec: Extract<LearnPictureSpec, { kind: 'result-bars' }> }) {
  return (
    <>
      {RESULT_BARS.map((bar) => (
        <Part key={bar.part} part={bar.part} highlight={spec.highlight === bar.part}>
          <rect className={`kairos-learn-picture__${bar.tone}`} x={bar.x} y={bar.top} width={56} height={bar.bottom - bar.top} />
          <text x={bar.x + 28} y={112} textAnchor="middle">{bar.label}</text>
        </Part>
      ))}
    </>
  );
}

function Leverage({ spec }: { readonly spec: Extract<LearnPictureSpec, { kind: 'leverage' }> }) {
  const bar = (part: 'account' | 'trade', steps: number, labelY: number, label: string) => (
    <Part part={part} highlight={false} data-steps={steps}>
      <text x={20} y={labelY} dominantBaseline="middle">{label}</text>
      <rect className={`kairos-learn-picture__${part}`} x={20} y={labelY + 6} width={Math.max(2, steps * 10)} height={20} />
    </Part>
  );
  return (
    <>
      {bar('account', spec.accountSteps, 12, 'Your money')}
      {bar('trade', spec.tradeSteps, 56, 'Your trade')}
    </>
  );
}

/** Draws every teaching picture shape. Presentation only: it holds no numbers of its own. */
export function LearnPicture({ spec, title, labels }: {
  readonly spec: LearnPictureSpec;
  /** The accessible name; defaults to describeLearnPicture(spec). */
  readonly title?: string;
  /** risk-box only: replaces the default words "Entry", "Stop", "Target", "Risk", "Reward". */
  readonly labels?: Readonly<Partial<Record<LearnRiskBoxPart, string>>>;
}) {
  return (
    <svg
      className={`kairos-learn-picture kairos-learn-picture--${spec.kind}`}
      data-picture={spec.kind}
      role="img"
      aria-label={title ?? describeLearnPicture(spec)}
      viewBox={spec.kind === 'leverage' ? '0 0 240 90' : '0 0 240 120'}
    >
      {spec.kind === 'risk-box' ? <RiskBox spec={spec} labels={labels ?? {}} /> : null}
      {spec.kind === 'candle' ? <Candle spec={spec} /> : null}
      {spec.kind === 'result-bars' ? <ResultBars spec={spec} /> : null}
      {spec.kind === 'leverage' ? <Leverage spec={spec} /> : null}
    </svg>
  );
}
