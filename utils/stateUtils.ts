import { Course, StatePath, SubTopic, Topic, DotPoint, Prompt } from '../types';

/**
 * Helper to find an item in an array by ID. Returns undefined if not found.
 */
const findItem = <T extends { id: string }>(items: T[], id: string): T | undefined => {
  return items.find((i) => i.id === id);
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
 */
export const deleteSyllabusItem = (
  courses: Course[],
  currentPath: StatePath,
  type: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt',
  idToDelete: string
): { updatedCourses: Course[]; newPath: StatePath } => {
  // Always work with a deep copy to ensure immutability and prevent side effects.
  const coursesCopy = JSON.parse(JSON.stringify(courses));
  let newPath = { ...currentPath };

  const getNextSelection = <T extends { id: string }>(
    list: T[],
    deletedIndex: number
  ): T | undefined => {
    if (list.length === 0) return undefined;
    const newIndex = Math.min(deletedIndex, list.length - 1);
    return list[newIndex];
  };

  if (type === 'course') {
    const index = coursesCopy.findIndex((c: Course) => c.id === idToDelete);
    if (index > -1) {
      coursesCopy.splice(index, 1);
      if (currentPath.courseId === idToDelete) {
        const nextCourse = getNextSelection(coursesCopy, index);
        newPath = { courseId: nextCourse?.id };
      }
    }
    return { updatedCourses: coursesCopy, newPath };
  }

  const course = coursesCopy.find((c: Course) => c.id === currentPath.courseId);
  if (!course) return { updatedCourses: coursesCopy, newPath: currentPath };

  if (type === 'topic') {
    const index = course.topics.findIndex((t: Topic) => t.id === idToDelete);
    if (index > -1) {
      course.topics.splice(index, 1);
      if (currentPath.topicId === idToDelete) {
        const nextTopic = getNextSelection(course.topics, index);
        newPath = { courseId: course.id, topicId: nextTopic?.id };
      }
    }
    return { updatedCourses: coursesCopy, newPath };
  }

  const topic = course.topics.find((t: Topic) => t.id === currentPath.topicId);
  if (!topic) return { updatedCourses: coursesCopy, newPath };

  if (type === 'subTopic') {
    const index = topic.subTopics.findIndex((st: SubTopic) => st.id === idToDelete);
    if (index > -1) {
      topic.subTopics.splice(index, 1);
      if (currentPath.subTopicId === idToDelete) {
        const nextSubTopic = getNextSelection(topic.subTopics, index);
        newPath = { courseId: course.id, topicId: topic.id, subTopicId: nextSubTopic?.id };
      }
    }
    return { updatedCourses: coursesCopy, newPath };
  }

  const subTopic = topic.subTopics.find((st: SubTopic) => st.id === currentPath.subTopicId);
  if (!subTopic) return { updatedCourses: coursesCopy, newPath };

  if (type === 'dotPoint') {
    const index = subTopic.dotPoints.findIndex((dp: DotPoint) => dp.id === idToDelete);
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
    return { updatedCourses: coursesCopy, newPath };
  }

  const dotPoint = subTopic.dotPoints.find((dp: DotPoint) => dp.id === currentPath.dotPointId);
  if (!dotPoint) return { updatedCourses: coursesCopy, newPath };

  if (type === 'prompt') {
    const index = dotPoint.prompts.findIndex((p: Prompt) => p.id === idToDelete);
    if (index > -1) {
      dotPoint.prompts.splice(index, 1);
      if (currentPath.promptId === idToDelete) {
        const nextPrompt = getNextSelection(dotPoint.prompts, index);
        newPath = { ...currentPath, promptId: nextPrompt?.id };
      }
    }
  }

  return { updatedCourses: coursesCopy, newPath };
};
