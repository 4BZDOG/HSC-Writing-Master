
import { useImmer } from 'use-immer';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Draft } from 'immer';
import { Course, StatePath, Topic, SubTopic, DotPoint, Prompt, CourseOutcome, SampleAnswer, LibraryItem } from '../types';
import { findAndUpdateItem, deleteSyllabusItem } from '../utils/stateUtils';
import { DATA_VERSION, STORAGE_KEYS, safeGetItem, safeSetItem, runMigrations, createBackup, loadCoursesFromDB, saveCoursesToDB, StorageStatus, saveToLibrary, fetchLibrary, deleteFromLibrary } from '../utils/storageUtils';
import { preseededCourses } from '../data/seedData';
import { AICache } from '../services/aiCache';
import { generateId } from '../utils/idUtils';
import { mergeCourseContents, analyzeAndSanitizeImportData, migrateAnalyseVerb, regenerateTopicIds } from '../utils/dataManagerUtils';

export interface DiscoveredDoc {
    id: string;
    name: string;
    source: string;
    subject?: string;
    data: Course;
    selected: boolean;
}

const detectSubjectArea = (name: string): string => {
    const n = name.toLowerCase();
    if (n.includes('software') || n.includes('computing') || n.includes('engineering') || n.includes('design') || n.includes('technology') || n.includes('ipt') || n.includes('sdd')) return 'TAS';
    if (n.includes('biology') || n.includes('chemistry') || n.includes('physics') || n.includes('science') || n.includes('earth') || n.includes('investigating')) return 'Science';
    if (n.includes('english') || n.includes('literature')) return 'English';
    if (n.includes('math') || n.includes('numeracy')) return 'Mathematics';
    if (n.includes('history') || n.includes('business') || n.includes('legal') || n.includes('geography') || n.includes('society') || n.includes('economics') || n.includes('studies of religion')) return 'HSIE';
    if (n.includes('music') || n.includes('art') || n.includes('drama') || n.includes('visual')) return 'Creative Arts';
    if (n.includes('pdhpe') || n.includes('health') || n.includes('sport') || n.includes('movement')) return 'PDHPE';
    return 'Other';
};

export const useSyllabusData = ({ showToast }: { showToast: (message: string, type: 'success' | 'error' | 'info') => void }) => {
  const [courses, updateCourses] = useImmer<Course[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('Loading');
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [discoveredDocs, setDiscoveredDocs] = useState<DiscoveredDoc[]>([]);
  const [isReady, setIsReady] = useState(false);
  const [isDiscoveryInProgress, setIsDiscoveryInProgress] = useState(false);
  
  const initAttempted = useRef(false);

  useEffect(() => {
    const loadInitialData = async () => {
      if (initAttempted.current) return;
      initAttempted.current = true;
      setIsDiscoveryInProgress(true);

      const loadResult = await loadCoursesFromDB();

      if (loadResult && loadResult.data.length > 0) {
        setStorageStatus(loadResult.source);
        const savedVersion = safeGetItem<string>(STORAGE_KEYS.DATA_VERSION, '1.0.0');
        let dataToLoad = loadResult.data;
        
        if (savedVersion !== DATA_VERSION) {
          dataToLoad = runMigrations(dataToLoad, savedVersion);
          safeSetItem(STORAGE_KEYS.DATA_VERSION, DATA_VERSION);
        }
        updateCourses(() => dataToLoad);
        setIsDiscoveryInProgress(false);
        setIsReady(true);
      } else {
        setStorageStatus('IndexedDB');
        try {
            const potentialDocs: DiscoveredDoc[] = [];
            
            preseededCourses.forEach(c => {
                potentialDocs.push({
                    id: c.id,
                    name: c.name,
                    source: 'Built-in Samples',
                    subject: detectSubjectArea(c.name),
                    data: c,
                    selected: true
                });
            });

            try {
                const manifestRes = await fetch('/courseData/manifest.json');
                if (manifestRes.ok) {
                    const manifest = await manifestRes.json();
                    if (manifest.files && Array.isArray(manifest.files)) {
                        await Promise.all(manifest.files.map(async (filename: string) => {
                            try {
                                const res = await fetch(`/courseData/${filename}`);
                                if (!res.ok) return;
                                const rawData = await res.json();
                                const analysis = analyzeAndSanitizeImportData(rawData);
                                if (analysis.type === 'courses' && analysis.data) {
                                    (analysis.data as Course[]).forEach(c => {
                                        if (!potentialDocs.some(existing => existing.id === c.id)) {
                                            potentialDocs.push({
                                                id: c.id,
                                                name: c.name,
                                                source: filename,
                                                subject: c.subject || detectSubjectArea(c.name),
                                                data: c,
                                                selected: false
                                            });
                                        }
                                    });
                                }
                            } catch (e) {
                                console.warn(`[Discovery] Skipping ${filename}:`, e);
                            }
                        }));
                    }
                }
            } catch (manifestErr) {
                console.warn("[Discovery] Manifest fetch failed, relying on seeds.");
            }
            
            setDiscoveredDocs(potentialDocs);
        } catch (error) {
            console.error('[Discovery] Fatal:', error);
        } finally {
            setIsDiscoveryInProgress(false);
            setIsReady(true);
        }
      }
      
      fetchLibrary().then(setLibraryItems).catch(console.error);
    };

    loadInitialData();
  }, [updateCourses]);

  const importDiscoveredDocs = useCallback(async (docsToImport: DiscoveredDoc[]): Promise<boolean> => {
      try {
          if (docsToImport.length > 0) {
              updateCourses(draft => {
                  docsToImport.forEach(doc => {
                      if (!draft.some(existing => existing.id === doc.id)) {
                          draft.push({ ...doc.data, subject: doc.subject });
                      }
                  });
              });
              showToast(`Synchronized ${docsToImport.length} units to workspace.`, 'success');
              setDiscoveredDocs([]); 
              return true;
          }
          return false;
      } catch (error) {
          showToast("Data synthesis failed.", 'error');
          return false;
      }
  }, [updateCourses, showToast]);

  useEffect(() => {
    if (!isReady) return;
    const handler = setTimeout(async () => {
      const status = await saveCoursesToDB(courses);
      setStorageStatus(status);
      if (courses.length > 0 && status !== 'Error') {
        createBackup(courses).catch(err => console.error("Backup failed:", err));
      }
    }, 1000);
    return () => clearTimeout(handler);
  }, [courses, isReady]);

  const handleCreateCourse = useCallback((name: string, outcomes: CourseOutcome[]) => {
    const newCourse: Course = { id: generateId('course'), name, outcomes, topics: [] };
    updateCourses(draft => { draft.push(newCourse) });
    showToast(`Course "${name}" created.`, 'success');
    return newCourse;
  }, [updateCourses, showToast]);

  const handleCreateTopic = useCallback((courseId: string, name: string) => {
    const newItem: Topic = { id: generateId('topic'), name, subTopics: [] };
    updateCourses(draft => {
      findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
        course.topics.push(newItem);
      });
    });
    showToast(`Topic "${name}" created.`, 'success');
    return newItem;
  }, [updateCourses, showToast]);
  
  const handleCreateSubTopic = useCallback((path: StatePath, name: string) => {
    const newItem: SubTopic = { id: generateId('subTopic'), name, dotPoints: [] };
    updateCourses(draft => {
      findAndUpdateItem(draft, { courseId: path.courseId, topicId: path.topicId }, (topic: Draft<Topic>) => {
        topic.subTopics.push(newItem);
      });
    });
    showToast(`Sub-Topic "${name}" created.`, 'success');
    return newItem;
  }, [updateCourses, showToast]);
  
  const handleAddDotPoints = useCallback((path: StatePath, descriptions: string[]) => {
    const newDotPoints: DotPoint[] = descriptions.map(desc => ({
      id: generateId('dp'),
      description: desc,
      prompts: []
    }));
    updateCourses(draft => {
      findAndUpdateItem(draft, { ...path, dotPointId: undefined }, (subTopic: Draft<SubTopic>) => {
        subTopic.dotPoints.push(...newDotPoints);
      });
    });
    showToast(`${newDotPoints.length} dot points added.`, 'success');
  }, [updateCourses, showToast]);

  const handleGeneratePrompt = useCallback(async (path: StatePath, newPrompt: Prompt) => {
    updateCourses(draft => {
      findAndUpdateItem(draft, { ...path, promptId: undefined }, (dotPoint: Draft<DotPoint>) => {
        dotPoint.prompts.push(newPrompt);
      });
    });
    return newPrompt;
  }, [updateCourses]);

  const confirmRename = useCallback((target: { type: string; id: string }, newName: string) => {
    updateCourses(draft => {
      const updateLogic = (items: any[], type: string) => {
        const item = items.find(i => i.id === target.id);
        if (item) {
          if (type === 'dotPoint') item.description = newName;
          else item.name = newName;
        }
      };
      switch (target.type) {
        case 'course': updateLogic(draft, 'course'); break;
        case 'topic': draft.forEach(c => updateLogic(c.topics, 'topic')); break;
        case 'subTopic': draft.forEach(c => c.topics.forEach(t => updateLogic(t.subTopics, 'subTopic'))); break;
        case 'dotPoint': draft.forEach(c => c.topics.forEach(t => t.subTopics.forEach(st => updateLogic(st.dotPoints, 'dotPoint')))); break;
      }
    });
    showToast(`${target.type} renamed.`, 'success');
  }, [updateCourses, showToast]);
  
  const confirmDelete = useCallback((path: StatePath, target: { type: any; id: string; name: string }) => {
    const { updatedCourses, newPath } = deleteSyllabusItem(courses, path, target.type, target.id);
    updateCourses(() => updatedCourses);
    showToast(`${target.type} deleted.`, 'success');
    return newPath;
  }, [courses, updateCourses, showToast]);
  
  const handleUpdateOutcomes = useCallback((courseId: string, newOutcomes: CourseOutcome[]) => {
    updateCourses(draft => {
      findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
        course.outcomes = newOutcomes;
      });
    });
    showToast('Outcomes updated.', 'success');
  }, [updateCourses, showToast]);

  const handleSampleAnswerGenerated = useCallback((path: StatePath, newAnswer: SampleAnswer) => {
    updateCourses(draft => {
      findAndUpdateItem(draft, path, (prompt: Draft<Prompt>) => {
        if (!prompt.sampleAnswers) prompt.sampleAnswers = [];
        prompt.sampleAnswers.push(newAnswer);
      });
    });
    showToast(`Response saved to library.`, 'success');
  }, [updateCourses, showToast]);
  
  const handleUpdateSampleAnswer = useCallback((path: StatePath, updatedAnswer: SampleAnswer) => {
    updateCourses(draft => {
        findAndUpdateItem(draft, path, (prompt: Draft<Prompt>) => {
            const index = prompt.sampleAnswers?.findIndex(sa => sa.id === updatedAnswer.id);
            if (index !== undefined && index > -1) {
                prompt.sampleAnswers![index] = updatedAnswer;
            }
        });
    });
    showToast(`Response updated.`, 'success');
  }, [updateCourses, showToast]);

  const handleDeleteSampleAnswer = useCallback((path: StatePath, sampleAnswerId: string) => {
      updateCourses(draft => {
          findAndUpdateItem(draft, path, (prompt: Draft<Prompt>) => {
              prompt.sampleAnswers = prompt.sampleAnswers?.filter(sa => sa.id !== sampleAnswerId) || [];
          });
      });
      showToast(`Response deleted.`, 'success');
  }, [updateCourses, showToast]);

  const handleMoveTopic = useCallback((courseId: string, topicId: string, direction: 'up' | 'down') => {
      updateCourses(draft => {
          const course = draft.find(c => c.id === courseId);
          if (!course) return;
          const idx = course.topics.findIndex(t => t.id === topicId);
          if (idx === -1) return;
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (swapIdx >= 0 && swapIdx < course.topics.length) {
              const temp = course.topics[idx];
              course.topics[idx] = course.topics[swapIdx];
              course.topics[swapIdx] = temp;
          }
      });
  }, [updateCourses]);
  
  const handleImportCourses = useCallback((imported: Course[], resolutions: Map<string, 'merge' | 'skip'>): string[] => {
    const newCourseIds: string[] = [];
    updateCourses(draft => {
      imported.forEach(importedCourse => {
        const existingIdx = draft.findIndex(c => c.id === importedCourse.id);
        if (existingIdx !== -1) {
          if (resolutions.get(importedCourse.id) === 'merge') {
            draft[existingIdx] = mergeCourseContents(draft[existingIdx], importedCourse);
          }
        } else {
          newCourseIds.push(importedCourse.id);
          draft.push(importedCourse);
        }
      });
    });
    return newCourseIds;
  }, [updateCourses]);

  const handleImportTopic = useCallback((courseId: string, topic: Topic) => {
    updateCourses(draft => {
      findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
        course.topics.push(topic);
      });
    });
    return topic;
  }, [updateCourses]);

  const handleClearAllData = useCallback(() => {
    updateCourses(() => []);
    showToast('System wiped.', 'success');
  }, [updateCourses, showToast]);
  
  const handleResetToDefault = useCallback(async () => {
    await AICache.clear();
    updateCourses(() => preseededCourses);
    showToast('Factory reset successful.', 'success');
  }, [updateCourses, showToast]);

  const handlePublishToLibrary = useCallback(async (item: LibraryItem) => {
      try {
          await saveToLibrary(item);
          const updatedLibrary = await fetchLibrary();
          setLibraryItems(updatedLibrary);
          showToast(`"${item.title}" added to Global library.`, 'success');
      } catch (e) {
          showToast("Library publication failed.", 'error');
      }
  }, [showToast]);

  const handleImportFromLibrary = useCallback(async (item: LibraryItem, targetCourseId?: string) => {
      if (item.type === 'course') {
          handleImportCourses([item.data as Course], new Map());
      } else if (item.type === 'topic' && targetCourseId) {
          handleImportTopic(targetCourseId, regenerateTopicIds(item.data as Topic));
      }
  }, [handleImportCourses, handleImportTopic]);

  const handleDeleteFromLibrary = useCallback(async (id: string) => {
      try {
          await deleteFromLibrary(id);
          const updatedLibrary = await fetchLibrary();
          setLibraryItems(updatedLibrary);
      } catch (e) {
          showToast("Failed to remove from library.", 'error');
      }
  }, [showToast]);

  return {
    courses,
    updateCourses,
    storageStatus,
    libraryItems,
    discoveredDocs,
    isReady,
    isDiscoveryInProgress,
    importDiscoveredDocs,
    handleCreateCourse,
    handleCreateTopic,
    handleCreateSubTopic,
    handleAddDotPoints,
    handleGeneratePrompt,
    confirmRename,
    confirmDelete,
    handleUpdateOutcomes,
    handleSampleAnswerGenerated,
    handleUpdateSampleAnswer,
    handleDeleteSampleAnswer,
    handleImportCourses,
    handleImportTopic,
    handleClearAllData,
    handleResetToDefault,
    handlePublishToLibrary,
    handleImportFromLibrary,
    handleDeleteFromLibrary,
    handleMoveTopic
  };
};
