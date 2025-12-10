import { useState, useEffect, useMemo, useCallback } from 'react';
import { Course, StatePath, Topic, SubTopic, DotPoint, Prompt } from '../types';
import { STORAGE_KEYS, safeGetItem, safeSetItem, validateStatePath } from '../utils/storageUtils';

export const useNavigation = (courses: Course[]) => {
  const [statePath, setStatePath] = useState<StatePath>(() => {
    // Initialize with first course if available and no path is saved
    const defaultPath = courses.length > 0 ? { courseId: courses[0].id } : {};
    return safeGetItem(STORAGE_KEYS.STATE_PATH, defaultPath, validateStatePath)
  });

  // Persist path changes to localStorage
  useEffect(() => {
    safeSetItem(STORAGE_KEYS.STATE_PATH, statePath);
  }, [statePath]);
  
  const handlePathChange = useCallback((newPath: Partial<StatePath>) => {
    setStatePath(prev => ({ ...prev, ...newPath }));
  }, []);

  // Derive current selection from path and courses data
  const { currentCourse, currentTopic, currentSubTopic, currentDotPoint, currentPrompt } = useMemo(() => {
    const course = courses.find(c => c.id === statePath.courseId);
    const topic = course?.topics.find(t => t.id === statePath.topicId);
    const subTopic = topic?.subTopics.find(st => st.id === statePath.subTopicId);
    const dotPoint = subTopic?.dotPoints.find(dp => dp.id === statePath.dotPointId);
    const prompt = dotPoint?.prompts.find(p => p.id === statePath.promptId);
    return { currentCourse: course, currentTopic: topic, currentSubTopic: subTopic, currentDotPoint: dotPoint, currentPrompt: prompt };
  }, [courses, statePath]);
  
  // Path validation and auto-selection logic to handle data changes gracefully
  useEffect(() => {
    if (courses.length === 0) {
      if (Object.keys(statePath).length > 0) setStatePath({});
      return;
    }

    setStatePath(currentPath => {
      let newPath: StatePath = { ...currentPath };
      let pathChanged = false;
      
      const course = courses.find(c => c.id === newPath.courseId);
      if (!course) {
        newPath = { courseId: courses[0]?.id };
        pathChanged = true;
      } else {
          const topic = course.topics.find(t => t.id === newPath.topicId);
          if (newPath.topicId && !topic) {
              newPath.topicId = undefined;
              newPath.subTopicId = undefined;
              newPath.dotPointId = undefined;
              newPath.promptId = undefined;
              pathChanged = true;
          } else if (topic) {
              const subTopic = topic.subTopics.find(st => st.id === newPath.subTopicId);
              if (newPath.subTopicId && !subTopic) {
                  newPath.subTopicId = undefined;
                  newPath.dotPointId = undefined;
                  newPath.promptId = undefined;
                  pathChanged = true;
              } else if (subTopic) {
                  const dotPoint = subTopic.dotPoints.find(dp => dp.id === newPath.dotPointId);
                  if (newPath.dotPointId && !dotPoint) {
                      newPath.dotPointId = undefined;
                      newPath.promptId = undefined;
                      pathChanged = true;
                  } else if (dotPoint) {
                      const prompt = dotPoint.prompts.find(p => p.id === newPath.promptId);
                      if (newPath.promptId && !prompt) {
                          newPath.promptId = undefined;
                          pathChanged = true;
                      }
                  }
              }
          }
      }
      
      return pathChanged ? newPath : currentPath;
    });
  }, [courses]); // Re-run only when courses data changes

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