
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
    data: Course;
    selected: boolean;
}

export const useSyllabusData = ({ showToast }: { showToast: (message: string, type: 'success' | 'error' | 'info') => void }) => {
  const [courses, updateCourses] = useImmer<Course[]>([]);
  const [storageStatus, setStorageStatus] = useState<StorageStatus>('Loading');
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [discoveredDocs, setDiscoveredDocs] = useState<DiscoveredDoc[]>([]);
  
  const isDataLoaded = useRef(false);

  // Effect for initial data loading from IndexedDB or auto-discovery of local files
  useEffect(() => {
    const loadInitialData = async () => {
      // 1. Try loading from IndexedDB (includes auto-migration from LocalStorage if present)
      const loadResult = await loadCoursesFromDB();

      if (loadResult) {
        setStorageStatus(loadResult.source);
        // Data found, check for migrations
        const savedVersion = safeGetItem<string>(STORAGE_KEYS.DATA_VERSION, '1.0.0');
        let dataToLoad = loadResult.data;
        
        if (savedVersion !== DATA_VERSION) {
          console.log(`Migrating data from ${savedVersion} to ${DATA_VERSION}`);
          dataToLoad = runMigrations(dataToLoad, savedVersion);
          safeSetItem(STORAGE_KEYS.DATA_VERSION, DATA_VERSION);
        }
        updateCourses(() => dataToLoad);
      } else {
        // 2. No data found in DB, start Discovery Mode
        setStorageStatus('IndexedDB'); // Will default to IDB on save
        try {
            console.log('[Discovery] Starting course data discovery...');
            const potentialDocs: DiscoveredDoc[] = [];
            
            // Add built-in seed data as an option
            preseededCourses.forEach(c => {
                potentialDocs.push({
                    id: c.id,
                    name: c.name,
                    source: 'Built-in Sample',
                    data: c,
                    selected: true // Default selected
                });
            });

            // Fetch the manifest to know which files to load
            const manifestRes = await fetch('/courseData/manifest.json');
            if (manifestRes.ok) {
                const manifest = await manifestRes.json();
                if (manifest.files && Array.isArray(manifest.files)) {
                     // Fetch all files listed in manifest in parallel
                    await Promise.all(manifest.files.map(async (filename: string) => {
                        const url = `/courseData/${filename}`;
                        try {
                            const res = await fetch(url);
                            if (!res.ok) return;
                            
                            let rawData;
                            try { rawData = await res.json(); } catch { return; }

                            const analysis = analyzeAndSanitizeImportData(rawData);

                            if (analysis.type === 'courses' && analysis.data) {
                                (analysis.data as Course[]).forEach(c => {
                                    // Check duplicates against seed data
                                    if (!potentialDocs.some(existing => existing.id === c.id)) {
                                        potentialDocs.push({
                                            id: c.id,
                                            name: c.name,
                                            source: filename,
                                            data: c,
                                            selected: true
                                        });
                                    }
                                });
                            } 
                        } catch (e) {
                            console.warn(`[Discovery] Failed to process ${filename}:`, e);
                        }
                    }));
                }
            }
            
            if (potentialDocs.length > 0) {
                setDiscoveredDocs(potentialDocs);
            } else {
                // Ultimate fallback
                updateCourses(() => preseededCourses);
            }

        } catch (error) {
            console.error('[Discovery] Critical failure:', error);
            updateCourses(() => preseededCourses);
        }
      }
      isDataLoaded.current = true;
      
      // Initial fetch of library items
      fetchLibrary().then(setLibraryItems).catch(console.error);
    };

    if (!isDataLoaded.current) {
      loadInitialData();
    }
  }, [updateCourses, showToast]);

  // Handler for importing selected docs from the discovery modal
  // Returns Promise<boolean> to indicate success/failure to the UI
  const importDiscoveredDocs = useCallback(async (selectedIds: Set<string>): Promise<boolean> => {
      try {
          // Simulate a small delay for better UX (showing processing state)
          await new Promise(resolve => setTimeout(resolve, 600));

          const docsToImport = discoveredDocs.filter(d => selectedIds.has(d.id)).map(d => d.data);
          
          if (docsToImport.length > 0) {
              updateCourses(draft => {
                  docsToImport.forEach(c => {
                      // Ensure we don't duplicate if multiple sources had same ID
                      const exists = draft.find(existing => existing.id === c.id);
                      if (!exists) draft.push(c);
                  });
              });
              showToast(`Imported ${docsToImport.length} courses successfully.`, 'success');
              // Clear discovered docs as they are now processed
              setDiscoveredDocs([]); 
              return true;
          } else {
              // User selected nothing but clicked import (should be disabled in UI, but good safeguard)
              showToast("No courses selected for import.", 'info');
              return false;
          }
      } catch (error) {
          console.error("Import failed:", error);
          showToast("Failed to process course data.", 'error');
          return false;
      }
  }, [discoveredDocs, updateCourses, showToast]);


  // Persist courses to IndexedDB on change with DEBOUNCE
  useEffect(() => {
    if (!isDataLoaded.current) return;

    // Debounce writes to avoid freezing UI on rapid state changes (like typing)
    const handler = setTimeout(async () => {
      const status = await saveCoursesToDB(courses);
      setStorageStatus(status);
      
      // Try to create/update the daily backup (internally handles throttling to once per hour)
      if (courses.length > 0 && status !== 'Error') {
        createBackup(courses).catch(err => console.error("Failed to create backup:", err));
      }
    }, 1000); // 1 second delay

    return () => clearTimeout(handler);
  }, [courses]);

  const [isCreating, setIsCreating] = useState(false);

  const handleCreateCourse = useCallback((name: string, outcomes: CourseOutcome[]) => {
    const newCourse: Course = { id: generateId('course'), name, outcomes, topics: [] };
    updateCourses(draft => { draft.push(newCourse) });
    showToast(`Course "${name}" created.`, 'success');
    return newCourse;
  }, [updateCourses, showToast]);

  const handleCreateTopic = useCallback((courseId: string, name: string) => {
    if (isCreating) {
        showToast("An operation is already in progress.", 'info');
        return null;
    }
    setIsCreating(true);
    const newItem: Topic = { id: generateId('topic'), name, subTopics: [] };
    updateCourses(draft => {
      findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
        course.topics.push(newItem);
      });
    });
    showToast(`Topic "${name}" created.`, 'success');
    setIsCreating(false);
    return newItem;
  }, [updateCourses, showToast, isCreating]);
  
  const handleCreateSubTopic = useCallback((path: StatePath, name: string) => {
    if (isCreating) {
        showToast("An operation is already in progress.", 'info');
        return null;
    }
    setIsCreating(true);
    const newItem: SubTopic = { id: generateId('subTopic'), name, dotPoints: [] };
    updateCourses(draft => {
      findAndUpdateItem(draft, { courseId: path.courseId, topicId: path.topicId }, (topic: Draft<Topic>) => {
        topic.subTopics.push(newItem);
      });
    });
    showToast(`Sub-Topic "${name}" created.`, 'success');
    setIsCreating(false);
    return newItem;
  }, [updateCourses, showToast, isCreating]);
  
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
    await AICache.set(AICache.generatePromptKey(path.dotPointId!, `${newPrompt.totalMarks}`), newPrompt);
    updateCourses(draft => {
      findAndUpdateItem(draft, { ...path, promptId: undefined }, (dotPoint: Draft<DotPoint>) => {
        dotPoint.prompts.push(newPrompt);
      });
    });
    showToast(`New question generated.`, 'success');
    return newPrompt;
  }, [updateCourses, showToast]);

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
    showToast(`${target.type} renamed successfully.`, 'success');
  }, [updateCourses, showToast]);
  
  const confirmDelete = useCallback((path: StatePath, target: { type: any; id: string; name: string }) => {
    const { updatedCourses, newPath } = deleteSyllabusItem(courses, path, target.type, target.id);
    updateCourses(() => updatedCourses);
    showToast(`${target.type} "${target.name}" deleted.`, 'success');
    return newPath;
  }, [courses, updateCourses, showToast]);
  
  const handleUpdateOutcomes = useCallback((courseId: string, newOutcomes: CourseOutcome[]) => {
    updateCourses(draft => {
      findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
        course.outcomes = newOutcomes;
      });
    });
    showToast('Course outcomes updated.', 'success');
  }, [updateCourses, showToast]);

  const handleSampleAnswerGenerated = useCallback((path: StatePath, newAnswer: SampleAnswer) => {
    updateCourses(draft => {
      findAndUpdateItem(draft, path, (prompt: Draft<Prompt>) => {
        if (!prompt.sampleAnswers) prompt.sampleAnswers = [];
        prompt.sampleAnswers.push(newAnswer);
        showToast(`Sample answer for ${newAnswer.mark}/${prompt.totalMarks} marks has been generated.`, 'success');
      });
    });
  }, [updateCourses, showToast]);
  
  const handleUpdateSampleAnswer = useCallback((path: StatePath, updatedAnswer: SampleAnswer) => {
    updateCourses(draft => {
        findAndUpdateItem(draft, path, (prompt: Draft<Prompt>) => {
            const index = prompt.sampleAnswers?.findIndex(sa => sa.id === updatedAnswer.id);
            if (index !== undefined && index > -1) {
                prompt.sampleAnswers![index] = updatedAnswer;
                showToast(`Sample answer updated successfully.`, 'success');
            } else {
                showToast(`Could not find sample answer to update.`, 'error');
            }
        });
    });
  }, [updateCourses, showToast]);

  const handleDeleteSampleAnswer = useCallback((path: StatePath, sampleAnswerId: string) => {
      updateCourses(draft => {
          findAndUpdateItem(draft, path, (prompt: Draft<Prompt>) => {
              const initialLength = prompt.sampleAnswers?.length || 0;
              prompt.sampleAnswers = prompt.sampleAnswers?.filter(sa => sa.id !== sampleAnswerId) || [];
              if (prompt.sampleAnswers.length < initialLength) {
                  showToast(`Sample answer deleted.`, 'success');
              }
          });
      });
  }, [updateCourses, showToast]);

  // Reordering Topics Logic
  const handleMoveTopic = useCallback((courseId: string, topicId: string, direction: 'up' | 'down') => {
      updateCourses(draft => {
          const course = draft.find(c => c.id === courseId);
          if (!course) return;
          const idx = course.topics.findIndex(t => t.id === topicId);
          if (idx === -1) return;
          
          const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
          
          // Check bounds
          if (swapIdx >= 0 && swapIdx < course.topics.length) {
              const temp = course.topics[idx];
              course.topics[idx] = course.topics[swapIdx];
              course.topics[swapIdx] = temp;
          }
      });
  }, [updateCourses]);
  
  const handleImportCourses = useCallback((imported: Course[], resolutions: Map<string, 'merge' | 'skip'>): string[] => {
    let newCount = 0;
    let mergedCount = 0;
    const newCourseIds: string[] = [];

    updateCourses(draft => {
      imported.forEach(importedCourse => {
        const existingCourseIndex = draft.findIndex(c => c.id === importedCourse.id);

        if (existingCourseIndex !== -1) { // Conflict exists
          const resolution = resolutions.get(importedCourse.id);
          
          if (resolution === 'merge') { 
            mergedCount++;
            const existingCourse = draft[existingCourseIndex];
            draft[existingCourseIndex] = mergeCourseContents(existingCourse, importedCourse);
          }
        } else {
          newCount++;
          newCourseIds.push(importedCourse.id);
          draft.push(importedCourse);
        }
      });
    });
    
    const messages = [];
    if (newCount > 0) messages.push(`${newCount} new course(s) added`);
    if (mergedCount > 0) messages.push(`${mergedCount} course(s) merged/updated`);

    if (messages.length > 0) {
        showToast(`${messages.join('. ')}.`, 'success');
    } else {
        showToast('Import complete. No changes were made.', 'info');
    }
    return newCourseIds;
  }, [updateCourses, showToast]);

  const handleImportTopic = useCallback((courseId: string, topic: Topic) => {
    updateCourses(draft => {
      findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
        course.topics.push(topic);
      });
    });
    
    const subTopicCount = topic.subTopics?.length || 0;
    const dotPointCount = topic.subTopics?.reduce((acc, st) => acc + (st.dotPoints?.length || 0), 0) || 0;

    showToast(`Topic "${topic.name}" imported with ${subTopicCount} sub-topics and ${dotPointCount} dot points.`, 'success');
    return topic;
  }, [updateCourses, showToast]);

  const handleClearAllData = useCallback(() => {
    updateCourses(() => []);
    showToast('All data has been cleared.', 'success');
  }, [updateCourses, showToast]);
  
  const handleResetToDefault = useCallback(async () => {
    await AICache.clear();
    updateCourses(() => preseededCourses);
    showToast('Data has been reset to default.', 'success');
  }, [updateCourses, showToast]);

  // --- Library Handlers ---

  const handlePublishToLibrary = useCallback(async (item: LibraryItem) => {
      try {
          await saveToLibrary(item);
          const updatedLibrary = await fetchLibrary();
          setLibraryItems(updatedLibrary);
          showToast(`"${item.title}" saved to Library.`, 'success');
      } catch (e) {
          showToast("Failed to save to Library.", 'error');
      }
  }, [showToast]);

  const handleImportFromLibrary = useCallback(async (item: LibraryItem, targetCourseId?: string) => {
      if (item.type === 'course') {
          handleImportCourses([item.data as Course], new Map());
      } else if (item.type === 'topic' && targetCourseId) {
          // Regenerate IDs to avoid conflicts if imported multiple times
          const freshTopic = regenerateTopicIds(item.data as Topic);
          handleImportTopic(targetCourseId, freshTopic);
      } else if (item.type === 'subTopic' && targetCourseId) {
          showToast("Direct Sub-Topic import from library not yet supported in this view.", 'info');
      }
  }, [handleImportCourses, handleImportTopic, showToast]);

  const handleDeleteFromLibrary = useCallback(async (id: string) => {
      try {
          await deleteFromLibrary(id);
          const updatedLibrary = await fetchLibrary();
          setLibraryItems(updatedLibrary);
          showToast("Item removed from Library.", 'success');
      } catch (e) {
          showToast("Failed to delete from Library.", 'error');
      }
  }, [showToast]);

  return {
    courses,
    updateCourses,
    storageStatus,
    libraryItems,
    discoveredDocs,
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
