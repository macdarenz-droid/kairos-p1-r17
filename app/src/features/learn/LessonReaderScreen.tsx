import { useEffect, useId, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { findLesson, findLessonAfter, readLessonCatalog } from '../../application/learn/lessons';
import type { Lesson, LessonCatalog } from '../../domain/learn/lessons';
import { Button, Card } from '../../design-system/primitives';
import { LessonStepBlocks } from './LessonBlocks';
import { lessonHref } from './LessonListScreen';
import './learn.css';

type Position = number | 'done';

const STEP_PATTERN = /^[1-9]\d*$/;

/** Where the reader is, from `?step=`: a step number in range, 'done', or step 1 for anything else. */
function readPosition(step: string | null, count: number): Position {
  if (step === 'done') return 'done';
  if (step !== null && STEP_PATTERN.test(step)) {
    const number = Number(step);
    if (number <= count) return number;
  }
  return 1;
}

/** One lesson, one step per screen. The step lives in the address; answers live only for this visit. */
function LessonReader({ lesson, next }: { readonly lesson: Lesson; readonly next: Lesson | null }) {
  const [params, setParams] = useSearchParams();
  const count = lesson.steps.length;
  const position = readPosition(params.get('step'), count);
  const [answers, setAnswers] = useState<Readonly<Record<string, number>>>({});
  const heading = useRef<HTMLHeadingElement>(null);
  const shown = useRef<Position>(position);
  const stepTitleId = useId();
  const endTitleId = useId();

  // The first screen keeps focus where it is; every step change moves it to the new title (which also scrolls it into view).
  useEffect(() => {
    if (position === shown.current) return;
    shown.current = position;
    heading.current?.focus();
  }, [position]);

  const go = (to: Position) => setParams({ step: String(to) }, { replace: true });
  const answer = (stepId: string, choice: number) => setAnswers((current) => (Object.hasOwn(current, stepId) ? current : { ...current, [stepId]: choice }));
  const restart = () => { setAnswers({}); go(1); };
  const current = position === 'done' ? count + 1 : position;
  const step = position === 'done' ? null : lesson.steps[position - 1];

  return (
    <section className="kairos-route kairos-learn kairos-lesson" aria-labelledby="kairos-lesson-title">
      <Link className="kairos-learn__back" to="/library/lessons">All lessons</Link>
      <h1 id="kairos-lesson-title">{lesson.title}</h1>
      <p className="kairos-lesson__progress">{position === 'done' ? `All ${count} steps done` : `Step ${position} of ${count}`}</p>
      <ol className="kairos-lesson__dots" aria-hidden="true">
        {lesson.steps.map((item, index) => (
          <li key={item.id} data-state={index + 1 < current ? 'done' : index + 1 === current ? 'current' : 'todo'} />
        ))}
      </ol>
      {step !== null && position !== 'done' ? (
        <>
          <Card key={step.id} as="section" className="kairos-lesson__step" aria-labelledby={stepTitleId}>
            <h2 id={stepTitleId} ref={heading} tabIndex={-1}>{step.title}</h2>
            <LessonStepBlocks step={step} answer={answers[step.id] ?? null} onAnswer={(choice) => answer(step.id, choice)} />
          </Card>
          <div className="kairos-lesson__nav">
            {position > 1 ? <Button variant="secondary" size="lg" onClick={() => go(position - 1)}>Back</Button> : null}
            <Button size="lg" onClick={() => go(position === count ? 'done' : position + 1)}>{position === count ? 'Finish' : 'Next'}</Button>
          </div>
        </>
      ) : (
        <Card as="section" className="kairos-lesson__step" aria-labelledby={endTitleId}>
          <h2 id={endTitleId} ref={heading} tabIndex={-1}>Lesson finished</h2>
          <p>You reached the end of this lesson. Your answers are not saved.</p>
          {next !== null ? <Link className="kairos-lesson__next-lesson" to={lessonHref(next.id)}>Next lesson: {next.title}</Link> : null}
          <Button variant="secondary" size="lg" onClick={restart}>Start again</Button>
        </Card>
      )}
    </section>
  );
}

/** The lesson reader page: one lesson from the catalog, or a plain line when the id is unknown. */
export function LessonReaderScreen({ catalog }: { readonly catalog?: LessonCatalog } = {}) {
  const [data] = useState(() => catalog ?? readLessonCatalog());
  const { lessonId = '' } = useParams();
  const lesson = findLesson(lessonId, data);
  if (lesson === null) {
    return (
      <section className="kairos-route kairos-learn" aria-labelledby="kairos-lesson-title">
        <Link className="kairos-learn__back" to="/library/lessons">All lessons</Link>
        <h1 id="kairos-lesson-title">Lessons</h1>
        <p>That lesson is not in the list yet.</p>
      </section>
    );
  }
  return <LessonReader key={lesson.id} lesson={lesson} next={findLessonAfter(lesson.id, data)} />;
}
