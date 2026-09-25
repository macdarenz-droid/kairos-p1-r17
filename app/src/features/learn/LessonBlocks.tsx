import { Component, useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { findGlossaryEntry } from '../../application/learn/glossary';
import { projectPositionSizePlan } from '../../application/learn/positionSizePlan';
import type { LessonBlock, LessonSizeExample, LessonStep, LessonTool } from '../../domain/learn/lessons';
import { Button } from '../../design-system/primitives';
import { GlossaryHint } from './GlossaryHint';
import { LearnPicture } from './LearnPicture';
import './learn.css';

/** The only pages a "Try it" block may open. */
const LESSON_TOOL_LINKS: Readonly<Record<LessonTool, { readonly href: string; readonly label: string }>> = {
  calculators: { href: '/library/calculators', label: 'Open the calculators' },
  journal: { href: '/journal', label: 'Open the Journal' },
};

/** Keeps one broken block to one plain line; the rest of the step still shows. */
class LessonBlockBoundary extends Component<{ readonly children: ReactNode }, { readonly failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }
  render(): ReactNode {
    return this.state.failed ? <p>This part of the lesson can't be shown right now.</p> : this.props.children;
  }
}

function LessonWords({ termIds }: { readonly termIds: readonly string[] }) {
  const terms = termIds.map((id) => findGlossaryEntry(id)?.term ?? null).filter((term) => term !== null);
  if (terms.length === 0) return null;
  return (
    <div className="kairos-lesson__words">
      <span>Words to know:</span>
      {terms.map((term) => (
        <span key={term.id} className="kairos-lesson__word"><strong>{term.plainWords}</strong><GlossaryHint termId={term.id} label={term.plainWords} /></span>
      ))}
    </div>
  );
}

/** The size example's answer and picture come from the "How much can I buy?" owner, never from the lesson. */
function LessonSizeExampleBlock({ example }: { readonly example: LessonSizeExample }) {
  const result = useMemo(
    () => projectPositionSizePlan({ accountSize: example.accountSize, riskPercent: example.riskPercent, entryPrice: example.entryPrice, stopPrice: example.stopPrice }),
    [example],
  );
  if (!result.ok) return <p>This example can't be shown right now.</p>;
  const { plan } = result;
  return (
    <figure className="kairos-lesson__figure">
      <LearnPicture spec={plan.picture} labels={{ risk: `Lose ${plan.amountAtRisk}` }} title={`If the price reaches the stop at ${plan.stopPrice}, you lose ${plan.amountAtRisk}.`} />
      <figcaption>
        With {plan.accountSize} in your account, willing to lose {plan.riskPercent}%, entry {plan.entryPrice} and stop {plan.stopPrice}: {plan.side === 'long' ? 'buy' : 'sell'} up to <strong>{plan.size}</strong>, and lose {plan.amountAtRisk} at the stop, before fees.
      </figcaption>
    </figure>
  );
}

function LessonCheck({ block, answer, onAnswer }: {
  readonly block: Extract<LessonBlock, { kind: 'check' }>;
  readonly answer: number | null;
  readonly onAnswer: (choice: number) => void;
}) {
  const right = block.choices.findIndex((choice) => choice.right);
  const answered = answer !== null;
  return (
    <fieldset className="kairos-lesson-check">
      <legend>{block.question}</legend>
      <div className="kairos-lesson-check__choices">
        {block.choices.map((choice, index) => (
          <Button key={index} variant="secondary" size="lg" aria-pressed={answer === index} aria-disabled={answered ? true : undefined} onClick={() => { if (!answered) onAnswer(index); }}>
            {choice.text}
            {answered && index === right ? <span className="kairos-lesson-check__tag"> — Right answer</span> : null}
            {answered && index === answer && index !== right ? <span className="kairos-lesson-check__tag"> — Your answer</span> : null}
          </Button>
        ))}
      </div>
      <p className="kairos-lesson-check__feedback" aria-live="polite" data-result={answered ? (answer === right ? 'right' : 'wrong') : undefined}>
        {answered && answer === right ? <><strong>Right.</strong> {block.explanation}</> : null}
        {answered && answer !== right ? <><strong>Not quite.</strong> The right answer is "{block.choices[right].text}". {block.explanation}</> : null}
      </p>
    </fieldset>
  );
}

function LessonBlockView({ block, answer, onAnswer }: { readonly block: LessonBlock; readonly answer: number | null; readonly onAnswer: (choice: number) => void }) {
  switch (block.kind) {
    case 'text':
      return <p className="kairos-lesson__text">{block.text}</p>;
    case 'picture':
      return <figure className="kairos-lesson__figure"><LearnPicture spec={block.picture} />{block.caption ? <figcaption>{block.caption}</figcaption> : null}</figure>;
    case 'words':
      return <LessonWords termIds={block.termIds} />;
    case 'size-example':
      return <LessonSizeExampleBlock example={block} />;
    case 'check':
      return <LessonCheck block={block} answer={answer} onAnswer={onAnswer} />;
    case 'try': {
      const link = LESSON_TOOL_LINKS[block.tool];
      return <p className="kairos-lesson__try"><span>{block.text}</span> <Link to={link.href}>{link.label}</Link></p>;
    }
  }
}

/** Draws one lesson step's blocks in order. Presentation only: every number comes from its owner. */
export function LessonStepBlocks({ step, answer, onAnswer }: {
  readonly step: LessonStep;
  /** The chosen choice of this step's check, or null while unanswered. */
  readonly answer: number | null;
  readonly onAnswer: (choice: number) => void;
}) {
  return (
    <>
      {step.blocks.map((block, index) => (
        <LessonBlockBoundary key={`${step.id}:${index}`}>
          <LessonBlockView block={block} answer={answer} onAnswer={onAnswer} />
        </LessonBlockBoundary>
      ))}
    </>
  );
}
