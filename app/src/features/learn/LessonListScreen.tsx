import { useState } from 'react';
import { Link } from 'react-router';
import { readLessonCatalog } from '../../application/learn/lessons';
import { lessonCoverPicture, type LessonCatalog } from '../../domain/learn/lessons';
import { LearnPicture } from './LearnPicture';
import './learn.css';

/** The one place that builds a link to a lesson. */
export function lessonHref(id: string): string {
  return `/library/lessons/${encodeURIComponent(id)}`;
}

const minutesText = (minutes: number): string => (minutes === 1 ? 'about 1 minute' : `about ${minutes} minutes`);

/** Lessons: every lesson in file order, with its picture, one sentence and how long it takes. Nothing is saved. */
export function LessonListScreen({ catalog }: { readonly catalog?: LessonCatalog } = {}) {
  const [data] = useState(() => catalog ?? readLessonCatalog());
  return (
    <section className="kairos-route kairos-learn" aria-labelledby="kairos-lessons-title">
      <Link className="kairos-learn__back" to="/library">Back to the Library</Link>
      <h1 id="kairos-lessons-title">Lessons</h1>
      <p>Short lessons with pictures, a few minutes each. Your answers are not saved.</p>
      {data.problems.length > 0 ? <p>Some lessons could not be shown.</p> : null}
      {data.lessons.length === 0 ? <p>No lessons in this version yet.</p> : (
        <ol className="kairos-lessons__list">
          {data.lessons.map((lesson) => {
            const cover = lessonCoverPicture(lesson);
            return (
              <li key={lesson.id}>
                <Link className="kairos-lessons__link" to={lessonHref(lesson.id)}>
                  {cover ? <span className="kairos-lessons__picture" aria-hidden="true"><LearnPicture spec={cover} /></span> : null}
                  <strong>{lesson.title}</strong>
                  <span>{lesson.summary}</span>
                  <span className="kairos-lessons__facts">{`Level ${lesson.level} · ${minutesText(lesson.minutes)} · ${lesson.steps.length} steps`}</span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
