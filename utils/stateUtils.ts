import { produce } from 'immer';
import { Course, StatePath, SubTopic, Topic, DotPoint, Prompt } from '../types';

/**
 * Helper to find an item in an array by ID. Returns undefined if not found.
 */
const findItem = <T extends { id: string }>(items: T[], id: string): T | undefined => {
  return items.find((i) => i.id === id);
};

/**
 * Resolves the currently-selected topic / sub-topic / dot point from a course
 * and a state path, without mutating anything. Read-only counterpart to
 * `findAndUpdateItem`, used to give AI features (keyword generation, enrichment)
 * the syllabus context around the selected question.
 */
export const findSelectionContext = (
  course: Course | null | undefined,
  path: Partial<StatePath> | undefined
): { topic?: Topic; subTopic?: SubTopic; dotPoint?: DotPoint } => {
  if (!course || !path) return {};
  const topic = path.topicId ? findItem(course.topics, path.topicId) : undefined;
  const subTopic =
    topic && path.subTopicId ? findItem(topic.subTopics, path.subTopicId) : undefined;
  const dotPoint =
    subTopic && path.dotPointId ? findItem(subTopic.dotPoints, path.dotPointId) : undefined;
  return { topic, subTopic, dotPoint };
};

/**
 * Safely traverses a draft of the course structure and applies an updater function
 * to the target item identified by the path.
 *
 * Designed to be used within an Immer `produce` block.
 * Returns early if any part of the path is missing or invalid, preventing crashes.
 */
export const findAndUpdateItem = (
  draft: Course[],
  path: Partial<StatePath>,
  updater: (item: any) => void
): void => {
  if (!path.courseId) {
    console.warn('findAndUpdateItem: Path must include a courseId.');
    return;
  }

  const course = findItem<Course>(draft, path.courseId);
  if (!course) {
    // This is common if a course was deleted while an async task was running
    console.debug(`findAndUpdateItem: Course ${path.courseId} not found (likely deleted).`);
    return;
  }

  if (!path.topicId) {
    updater(course);
    return;
  }

  const topic = findItem<Topic>(course.topics, path.topicId);
  if (!topic) {
    console.debug(`findAndUpdateItem: Topic ${path.topicId} not found.`);
    return;
  }

  if (!path.subTopicId) {
    updater(topic);
    return;
  }

  const subTopic = findItem<SubTopic>(topic.subTopics, path.subTopicId);
  if (!subTopic) {
    console.debug(`findAndUpdateItem: SubTopic ${path.subTopicId} not found.`);
    return;
  }

  if (!path.dotPointId) {
    updater(subTopic);
    return;
  }

  const dotPoint = findItem<DotPoint>(subTopic.dotPoints, path.dotPointId);
  if (!dotPoint) {
    console.debug(`findAndUpdateItem: DotPoint ${path.dotPointId} not found.`);
    return;
  }

  if (!path.promptId) {
    updater(dotPoint);
    return;
  }

  const prompt = findItem<Prompt>(dotPoint.prompts, path.promptId);
  if (!prompt) {
    console.debug(`findAndUpdateItem: Prompt ${path.promptId} not found.`);
    return;
  }

  updater(prompt);
};

/**
 * Deletes a syllabus item immutably.
 *
 * Built on Immer's `produce` rather than `JSON.parse(JSON.stringify(courses))`:
 * the full-tree deep clone ran on every delete regardless of how deep the
 * target sat, so removing one prompt from a dot point paid to re-serialise
 * every course, topic, sub-topic and prompt in the whole library. `produce`
 * gives the same "safe to mutate the copy" ergonomics — the splices below are
 * unchanged — but only clones the path actually touched, via structural
 * sharing, and does it off the main-thread-blocking JSON round-trip.
 *
 * `newPath` is computed as a side effect inside the recipe (a plain outer
 * variable, not part of the draft) rather than returned from it, because a
 * `produce` recipe's return value IS the new state — returning `{ newPath }`
 * from a branch would try to replace the whole courses array with that object.
 */
/**
 * Clears every question (prompt) reachable under a scope node, leaving the
 * Topic/SubTopic/DotPoint structure — names, ids, `focusAreas` — untouched.
 *
 * This is the "delete questions, keep structure" counterpart to
 * `deleteSyllabusItem`: instead of splicing the target node out of its
 * parent array, it walks down to every `DotPoint` reachable under the target
 * and empties `dotPoint.prompts`, so the tree shape survives and a teacher
 * can reimport questions straight back into the same nodes.
 *
 * Mirrors `deleteSyllabusItem`'s no-op-on-missing behaviour: if the scope
 * node can't be found, returns the original `courses` reference unchanged
 * and a `clearedCount` of 0, rather than throwing.
 */
export const clearQuestionsInScope = (
  courses: Course[],
  scope: { courseId: string; type: 'course' | 'topic' | 'subTopic' | 'dotPoint'; id: string }
): { updatedCourses: Course[]; clearedCount: number } => {
  let clearedCount = 0;
  let found = false;

  const clearDotPoint = (dotPoint: DotPoint): void => {
    clearedCount += dotPoint.prompts.length;
    dotPoint.prompts = [];
  };

  const clearSubTopic = (subTopic: SubTopic): void => {
    subTopic.dotPoints.forEach(clearDotPoint);
  };

  const clearTopic = (topic: Topic): void => {
    topic.subTopics.forEach(clearSubTopic);
  };

  const updatedCourses = produce(courses, (coursesCopy) => {
    const course = coursesCopy.find((c) => c.id === scope.courseId);
    if (!course) return;

    if (scope.type === 'course') {
      if (course.id !== scope.id) return;
      found = true;
      course.topics.forEach(clearTopic);
      return;
    }

    if (scope.type === 'topic') {
      const topic = course.topics.find((t) => t.id === scope.id);
      if (!topic) return;
      found = true;
      clearTopic(topic);
      return;
    }

    if (scope.type === 'subTopic') {
      for (const topic of course.topics) {
        const subTopic = topic.subTopics.find((st) => st.id === scope.id);
        if (subTopic) {
          found = true;
          clearSubTopic(subTopic);
          return;
        }
      }
      return;
    }

    // scope.type === 'dotPoint'
    for (const topic of course.topics) {
      for (const subTopic of topic.subTopics) {
        const dotPoint = subTopic.dotPoints.find((dp) => dp.id === scope.id);
        if (dotPoint) {
          found = true;
          clearDotPoint(dotPoint);
          return;
        }
      }
    }
  });

  if (!found) {
    return { updatedCourses: courses, clearedCount: 0 };
  }

  return { updatedCourses, clearedCount };
};

export const deleteSyllabusItem = (
  courses: Course[],
  currentPath: StatePath,
  type: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt',
  idToDelete: string
): { updatedCourses: Course[]; newPath: StatePath } => {
  let newPath = { ...currentPath };

  const getNextSelection = <T extends { id: string }>(
    list: T[],
    deletedIndex: number
  ): T | undefined => {
    if (list.length === 0) return undefined;
    const newIndex = Math.min(deletedIndex, list.length - 1);
    return list[newIndex];
  };

  const updatedCourses = produce(courses, (coursesCopy) => {
    if (type === 'course') {
      const index = coursesCopy.findIndex((c) => c.id === idToDelete);
      if (index > -1) {
        coursesCopy.splice(index, 1);
        if (currentPath.courseId === idToDelete) {
          const nextCourse = getNextSelection(coursesCopy, index);
          newPath = { courseId: nextCourse?.id };
        }
      }
      return;
    }

    const course = coursesCopy.find((c) => c.id === currentPath.courseId);
    if (!course) return;

    if (type === 'topic') {
      const index = course.topics.findIndex((t) => t.id === idToDelete);
      if (index > -1) {
        course.topics.splice(index, 1);
        if (currentPath.topicId === idToDelete) {
          const nextTopic = getNextSelection(course.topics, index);
          newPath = { courseId: course.id, topicId: nextTopic?.id };
        }
      }
      return;
    }

    const topic = course.topics.find((t) => t.id === currentPath.topicId);
    if (!topic) return;

    if (type === 'subTopic') {
      const index = topic.subTopics.findIndex((st) => st.id === idToDelete);
      if (index > -1) {
        topic.subTopics.splice(index, 1);
        if (currentPath.subTopicId === idToDelete) {
          const nextSubTopic = getNextSelection(topic.subTopics, index);
          newPath = { courseId: course.id, topicId: topic.id, subTopicId: nextSubTopic?.id };
        }
      }
      return;
    }

    const subTopic = topic.subTopics.find((st) => st.id === currentPath.subTopicId);
    if (!subTopic) return;

    if (type === 'dotPoint') {
      const index = subTopic.dotPoints.findIndex((dp) => dp.id === idToDelete);
      if (index > -1) {
        subTopic.dotPoints.splice(index, 1);
        if (currentPath.dotPointId === idToDelete) {
          const nextDotPoint = getNextSelection(subTopic.dotPoints, index);
          newPath = {
            courseId: course.id,
            topicId: topic.id,
            subTopicId: subTopic.id,
            dotPointId: nextDotPoint?.id,
          };
        }
      }
      return;
    }

    const dotPoint = subTopic.dotPoints.find((dp) => dp.id === currentPath.dotPointId);
    if (!dotPoint) return;

    if (type === 'prompt') {
      const index = dotPoint.prompts.findIndex((p) => p.id === idToDelete);
      if (index > -1) {
        dotPoint.prompts.splice(index, 1);
        if (currentPath.promptId === idToDelete) {
          const nextPrompt = getNextSelection(dotPoint.prompts, index);
          newPath = { ...currentPath, promptId: nextPrompt?.id };
        }
      }
    }
  });

  return { updatedCourses, newPath };
};
