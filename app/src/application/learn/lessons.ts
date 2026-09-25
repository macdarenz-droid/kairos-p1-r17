/**
 * The only module that imports the lesson data. It checks each lesson's words against the glossary and each size example against the position-size owner. Only the lesson screens import it, so the Journal and the Library page never carry the data.
 */

import lessonsJson from '../../content/learn/lessons.json';
import { parseLessonCatalog, type Lesson, type LessonCatalog, type LessonCatalogLinks } from '../../domain/learn/lessons';
import { readGlossary } from './glossary';
import { projectPositionSizePlan } from './positionSizePlan';

/** The glossary ids and the "How much can I buy?" owner, as the lesson checks. */
export function lessonCatalogLinks(): LessonCatalogLinks {
  return {
    termIds: new Set(readGlossary().terms.map((term) => term.id)),
    sizeExampleWorks: (example) => projectPositionSizePlan({ accountSize: example.accountSize, riskPercent: example.riskPercent, entryPrice: example.entryPrice, stopPrice: example.stopPrice }).ok,
  };
}

let catalog: LessonCatalog | null = null;

/** The shipped lessons, parsed once. */
export function readLessonCatalog(): LessonCatalog {
  catalog ??= parseLessonCatalog(lessonsJson as unknown, lessonCatalogLinks());
  return catalog;
}

export function findLesson(id: string, from: LessonCatalog = readLessonCatalog()): Lesson | null {
  return from.lessons.find((lesson) => lesson.id === id) ?? null;
}

/** The next lesson in file order; null for the last lesson or an unknown id. */
export function findLessonAfter(id: string, from: LessonCatalog = readLessonCatalog()): Lesson | null {
  const index = from.lessons.findIndex((lesson) => lesson.id === id);
  return index === -1 ? null : from.lessons[index + 1] ?? null;
}
