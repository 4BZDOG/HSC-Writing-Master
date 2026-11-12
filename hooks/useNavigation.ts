import { useState, useEffect, useMemo, useCallback } from 'react';
import { Course, StatePath, Topic, SubTopic, DotPoint, Prompt } from '../types';
import { resolveSyllabusYear, yearOfTopic } from '../utils/syllabusYear';
import { getFocusAreas } from '../utils/dataManagerUtils';
import { STORAGE_KEYS, safeGetItem, safeSetItem, validateStatePath } from '../utils/storageUtils';

export const useNavigation = (courses: Course[], isDataReady: boolean = true) => {
  const [statePath, setStatePath] = useState<StatePath>(() => {
    // Initialize with first course if available and no path is saved
    const defaultPath = courses.length > 0 ? { courseId: courses[0].id } : {};
    return safeGetItem(STORAGE_KEYS.STATE_PATH, defaultPath, validateStatePath);
  });

  // Persist path changes to localStorage
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.STATE_PATH, statePath);
  }, [statePath]);

  const handlePathChange = useCallback((newPath: Partial<StatePath>) => {
    setStatePath((prev) => ({ ...prev, ...newPath }));
  }, []);

  // Derive current selection from path and courses data
  const { currentCourse, currentTopic, currentSubTopic, currentDotPoint, currentPrompt } =
    useMemo(() => {
      const course = courses.find((c) => c.id === statePath.courseId);
      // The path's topic only counts when it belongs to the year on screen.
      // Without this the workspace would go on showing a Year 12 question while
      // the picker sat on Year 11 with nothing selected — one selection, two
      // answers, and the breadcrumb naming a topic that is not in the list.
      const year = resolveSyllabusYear(course, statePath.syllabusYear);
      const topicInPath = course?.topics.find((t) => t.id === statePath.topicId);
      const topic = topicInPath && yearOfTopic(topicInPath) === year ? topicInPath : undefined;
      const subTopic = topic?.subTopics.find((st) => st.id === statePath.subTopicId);
      const dotPoint = subTopic?.dotPoints.find((dp) => dp.id === statePath.dotPointId);
      const prompt = dotPoint?.prompts.find((p) => p.id === statePath.promptId);
      return {
        currentCourse: course,
        currentTopic: topic,
        currentSubTopic: subTopic,
        currentDotPoint: dotPoint,
        currentPrompt: prompt,
      };
    }, [courses, statePath]);

  // Path validation and auto-selection logic to handle data changes gracefully
  useEffect(() => {
    // Courses load asynchronously; until they have, `courses` is [] and
    // validating against it would WIPE the path restored from localStorage —
    // losing the user's saved position on every reload.
    if (!isDataReady) return;

    if (courses.length === 0) {
      if (Object.keys(statePath).length > 0) setStatePath({});
      return;
    }

    setStatePath((currentPath) => {
      let newPath: StatePath = { ...currentPath };
      let pathChanged = false;
      // The dot point the path still resolves to, if any: its focus areas are
      // the only ones the selection may keep.
      let focusOwner: DotPoint | undefined;

      const course = courses.find((c) => c.id === newPath.courseId);
      if (!course) {
        newPath = { courseId: courses[0]?.id };
        pathChanged = true;
      } else {
        const year = resolveSyllabusYear(course, newPath.syllabusYear);
        const found = course.topics.find((t) => t.id === newPath.topicId);
        // A topic from the other year is as gone as a deleted one, as far as
        // this path is concerned.
        const topic = found && yearOfTopic(found) === year ? found : undefined;
        if (newPath.topicId && !topic) {
          newPath.topicId = undefined;
          newPath.subTopicId = undefined;
          newPath.dotPointId = undefined;
          newPath.promptId = undefined;
          pathChanged = true;
        } else if (topic) {
          const subTopic = topic.subTopics.find((st) => st.id === newPath.subTopicId);
          if (newPath.subTopicId && !subTopic) {
            newPath.subTopicId = undefined;
            newPath.dotPointId = undefined;
            newPath.promptId = undefined;
            pathChanged = true;
          } else if (subTopic) {
            const dotPoint = subTopic.dotPoints.find((dp) => dp.id === newPath.dotPointId);
            if (newPath.dotPointId && !dotPoint) {
              newPath.dotPointId = undefined;
              newPath.promptId = undefined;
              pathChanged = true;
            } else if (dotPoint) {
              focusOwner = dotPoint;
              const prompt = dotPoint.prompts.find((p) => p.id === newPath.promptId);
              if (newPath.promptId && !prompt) {
                newPath.promptId = undefined;
                pathChanged = true;
              }
            }
          }
        }
      }

      // Focus areas are read from the current dot point's wording, which can
      // change under the reader (new data, another device, a dot point gone).
      // Keep only what that dot point still offers, so the count and the AI
      // briefing never name a phrase the syllabus no longer has.
      const selected = newPath.selectedSubItems ?? [];
      const offered = getFocusAreas(focusOwner);
      const kept = selected.filter((item) => offered.includes(item));
      if (kept.length !== selected.length) {
        newPath.selectedSubItems = kept.length ? kept : undefined;
        pathChanged = true;
      }

      return pathChanged ? newPath : currentPath;
    });
  }, [courses, isDataReady]); // Re-run when courses data changes or finishes loading

  return {
    statePath,
    setStatePath,
    handlePathChange,
    currentCourse,
    currentTopic,
    currentSubTopic,
    currentDotPoint,
    currentPrompt,
  };
};
