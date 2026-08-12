import { useImmer, type Updater } from 'use-immer';
import { useCallback, useEffect, useState, useRef } from 'react';
import { Draft } from 'immer';
import {
  Course,
  StatePath,
  Topic,
  SubTopic,
  DotPoint,
  Prompt,
  CourseOutcome,
  SampleAnswer,
  LibraryItem,
  SyllabusYear,
} from '../types';
import { findAndUpdateItem, deleteSyllabusItem } from '../utils/stateUtils';
import { DEFAULT_SYLLABUS_YEAR } from '../utils/syllabusYear';
import {
  DATA_VERSION,
  STORAGE_KEYS,
  safeGetItem,
  safeSetItem,
  runMigrations,
  createBackup,
  loadCoursesFromDB,
  saveCoursesToDB,
  StorageStatus,
  saveToLibrary,
  fetchLibrary,
  deleteFromLibrary,
} from '../utils/storageUtils';
import { AICache } from '../services/aiCache';
import { fetchRemoteCourses, isCurriculumRemote } from '../services/curriculumService';
import {
  saveSampleAnswerContribution,
  saveTopicContribution,
  saveSubTopicContribution,
  saveDotPointContribution,
} from '../services/contributionService';
import { screenContentQuality } from '../services/geminiService';
import { generateId } from '../utils/idUtils';
import {
  mergeCourseContents,
  mergeTopicContents,
  analyzeAndSanitizeImportData,
  migrateAnalyseVerb,
  regenerateTopicIds,
  recalculateSampleAnswerBands,
} from '../utils/dataManagerUtils';

type DiscoveredDocType = 'course' | 'topic';

/** User-facing labels for syllabus item types, used in rename/delete toasts. */
const ITEM_TYPE_LABELS: Record<string, string> = {
  course: 'Course',
  topic: 'Topic',
  subTopic: 'Sub-topic',
  dotPoint: 'Dot point',
  prompt: 'Question',
};

/**
 * The slice of this hook's handlers that the Workspace component tree
 * consumes. Typed (rather than `any`) so App's handler bag is structurally
 * checked at the JSX callsite — a missing member is a compile error instead of
 * a runtime crash when the button is clicked.
 */
export interface WorkspaceSyllabusHandlers {
  updateCourses: Updater<Course[]>;
  handleSampleAnswerGenerated: (path: StatePath, answer: SampleAnswer) => void;
  handleUpdateSampleAnswer: (path: StatePath, answer: SampleAnswer) => void;
  handleDeleteSampleAnswer: (path: StatePath, id: string) => void;
  handleContributeSampleAnswer: (path: StatePath, answer: SampleAnswer) => void | Promise<void>;
}

export interface DiscoveredDoc {
  id: string;
  name: string;
  source: string;
  subject?: string;
  type: DiscoveredDocType;
  data: Course | Topic;
  selected: boolean;
  targetCourseId?: string;
  targetCourseName?: string;
}

interface ManifestDocEntry {
  file: string;
  type?: DiscoveredDocType;
  selected?: boolean;
  subject?: string;
  name?: string;
  targetCourseId?: string;
  targetCourseName?: string;
}

const detectSubjectArea = (name: string): string => {
  const n = name.toLowerCase();
  if (
    n.includes('software') ||
    n.includes('computing') ||
    n.includes('engineering') ||
    n.includes('design') ||
    n.includes('technology') ||
    n.includes('ipt') ||
    n.includes('sdd')
  )
    return 'TAS';
  if (
    n.includes('biology') ||
    n.includes('chemistry') ||
    n.includes('physics') ||
    n.includes('science') ||
    n.includes('earth') ||
    n.includes('investigating')
  )
    return 'Science';
  if (n.includes('english') || n.includes('literature')) return 'English';
  if (n.includes('math') || n.includes('numeracy')) return 'Mathematics';
  if (
    n.includes('history') ||
    n.includes('business') ||
    n.includes('legal') ||
    n.includes('geography') ||
    n.includes('society') ||
    n.includes('economics') ||
    n.includes('studies of religion')
  )
    return 'HSIE';
  if (n.includes('music') || n.includes('art') || n.includes('drama') || n.includes('visual'))
    return 'Creative Arts';
  if (n.includes('pdhpe') || n.includes('health') || n.includes('sport') || n.includes('movement'))
    return 'PDHPE';
  return 'Other';
};

const normalizeText = (value?: string) => (value || '').trim().toLowerCase();

const parseManifestEntries = (manifest: {
  files?: Array<string | ManifestDocEntry>;
  entries?: Array<string | ManifestDocEntry>;
}): ManifestDocEntry[] => {
  const rawEntries = manifest.entries || manifest.files || [];
  return rawEntries
    .map((entry) => (typeof entry === 'string' ? { file: entry } : entry))
    .filter((entry): entry is ManifestDocEntry => Boolean(entry?.file));
};

const resolveTopicTargetCourse = (
  doc: DiscoveredDoc,
  availableCourses: Course[]
): Course | undefined => {
  if (doc.targetCourseId) {
    return availableCourses.find((course) => course.id === doc.targetCourseId);
  }

  if (doc.targetCourseName) {
    return availableCourses.find(
      (course) => normalizeText(course.name) === normalizeText(doc.targetCourseName)
    );
  }

  const subjectMatches = doc.subject
    ? availableCourses.filter(
        (course) =>
          normalizeText(course.subject || detectSubjectArea(course.name)) ===
          normalizeText(doc.subject)
      )
    : [];

  if (subjectMatches.length === 1) {
    return subjectMatches[0];
  }

  return undefined;
};

/**
 * The `year` field a newly created topic should carry.
 *
 * Year 12 is written as ABSENCE, not as `'year12'`: every topic authored before
 * the two years existed has no year and is read as Year 12, and having two
 * spellings of the same fact is how a filter comes to disagree with itself.
 */
const yearTag = (year?: SyllabusYear): { year?: SyllabusYear } =>
  year && year !== DEFAULT_SYLLABUS_YEAR ? { year } : {};

export const useSyllabusData = ({
  showToast,
}: {
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}) => {
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

      // Remote-first: when Supabase is configured, the approved library there is
      // the source of truth. Cache it to IndexedDB so offline still works, and
      // fall through to the local cache / seed discovery on any failure.
      if (isCurriculumRemote()) {
        try {
          const remoteCourses = await fetchRemoteCourses();
          if (remoteCourses.length > 0) {
            const recalibrated = recalculateSampleAnswerBands(remoteCourses);
            updateCourses(() => recalibrated);
            setStorageStatus('Supabase');
            saveCoursesToDB(recalibrated).catch((err) =>
              console.warn('[Curriculum] Failed to cache remote courses locally:', err)
            );
            setIsDiscoveryInProgress(false);
            setIsReady(true);
            fetchLibrary().then(setLibraryItems).catch(console.error);
            return;
          }
          // Configured but empty (not seeded yet) — fall back to local seeds.
        } catch (err) {
          console.warn('[Curriculum] Supabase load failed; using local cache.', err);
        }
      }

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
          const { preseededCourses } = await import('../data/seedData');

          preseededCourses.forEach((c) => {
            potentialDocs.push({
              id: `course:${c.id}`,
              name: c.name,
              source: 'Built-in Samples',
              subject: detectSubjectArea(c.name),
              type: 'course',
              data: c,
              selected: true,
            });
          });

          try {
            // BASE_URL-relative so the library still loads when the app is
            // hosted under a sub-path (e.g. GitHub Pages /<repo>/).
            const courseDataBase = `${import.meta.env.BASE_URL}courseData`;
            const manifestRes = await fetch(`${courseDataBase}/manifest.json`);
            if (manifestRes.ok) {
              const manifest = await manifestRes.json();
              const manifestEntries = parseManifestEntries(manifest);
              if (manifestEntries.length > 0) {
                await Promise.all(
                  manifestEntries.map(async (entry) => {
                    try {
                      const res = await fetch(`${courseDataBase}/${entry.file}`);
                      if (!res.ok) return;
                      const rawData = await res.json();
                      const analysis = analyzeAndSanitizeImportData(rawData);
                      if (analysis.type === 'courses' && analysis.data) {
                        (analysis.data as Course[]).forEach((c) => {
                          const docId = `course:${c.id}`;
                          if (!potentialDocs.some((existing) => existing.id === docId)) {
                            potentialDocs.push({
                              id: docId,
                              name: entry.name || c.name,
                              source: entry.file,
                              subject: entry.subject || c.subject || detectSubjectArea(c.name),
                              type: 'course',
                              data: c,
                              selected: entry.selected ?? false,
                            });
                          }
                        });
                      } else if (analysis.type === 'topic' && analysis.data) {
                        const topic = analysis.data as Topic;
                        const docId = `topic:${entry.file}:${topic.id}`;
                        if (!potentialDocs.some((existing) => existing.id === docId)) {
                          potentialDocs.push({
                            id: docId,
                            name: entry.name || topic.name,
                            source: entry.file,
                            subject: entry.subject || detectSubjectArea(topic.name),
                            type: 'topic',
                            data: topic,
                            selected: entry.selected ?? false,
                            targetCourseId: entry.targetCourseId,
                            targetCourseName: entry.targetCourseName,
                          });
                        }
                      }
                    } catch (e) {
                      console.warn(`[Discovery] Skipping ${entry.file}:`, e);
                    }
                  })
                );
              }
            }
          } catch (manifestErr) {
            console.warn('[Discovery] Manifest fetch failed, relying on seeds.');
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

  const importDiscoveredDocs = useCallback(
    async (docsToImport: DiscoveredDoc[]): Promise<boolean> => {
      try {
        if (docsToImport.length === 0) return false;

        let importedCount = 0;
        let skippedTopics = 0;

        updateCourses((draft) => {
          const courseDocs = docsToImport.filter((doc) => doc.type === 'course');
          const topicDocs = docsToImport.filter((doc) => doc.type === 'topic');

          courseDocs.forEach((doc) => {
            const importedCourse = { ...(doc.data as Course), subject: doc.subject };
            const existingCourseIndex = draft.findIndex(
              (course) =>
                course.id === importedCourse.id ||
                normalizeText(course.name) === normalizeText(importedCourse.name)
            );

            if (existingCourseIndex !== -1) {
              draft[existingCourseIndex] = mergeCourseContents(
                draft[existingCourseIndex],
                importedCourse
              );
            } else {
              draft.push(importedCourse);
            }

            importedCount++;
          });

          topicDocs.forEach((doc) => {
            const targetCourse = resolveTopicTargetCourse(doc, draft);
            if (!targetCourse) {
              skippedTopics++;
              return;
            }

            const importedTopic = regenerateTopicIds(doc.data as Topic);
            const existingTopicIndex = targetCourse.topics.findIndex(
              (topic) =>
                topic.id === importedTopic.id ||
                normalizeText(topic.name) === normalizeText(importedTopic.name)
            );

            if (existingTopicIndex !== -1) {
              targetCourse.topics[existingTopicIndex] = mergeTopicContents(
                targetCourse.topics[existingTopicIndex],
                importedTopic
              );
            } else {
              targetCourse.topics.push(importedTopic);
            }

            importedCount++;
          });
        });

        setDiscoveredDocs((existingDocs) =>
          existingDocs.filter(
            (existingDoc) => !docsToImport.some((doc) => doc.id === existingDoc.id)
          )
        );

        if (importedCount > 0) {
          const syncMessage =
            skippedTopics > 0
              ? `Synchronised ${importedCount} items. ${skippedTopics} topic file${skippedTopics === 1 ? '' : 's'} still need a target course in manifest metadata.`
              : `Synchronised ${importedCount} items to workspace.`;
          showToast(syncMessage, skippedTopics > 0 ? 'info' : 'success');
          return true;
        }

        showToast('No discovered JSON files could be imported.', 'info');
        return false;
      } catch (error) {
        showToast('Data synthesis failed.', 'error');
        return false;
      }
    },
    [updateCourses, showToast]
  );

  useEffect(() => {
    if (!isReady) return;
    const handler = setTimeout(async () => {
      const status = await saveCoursesToDB(courses);
      // In Supabase mode the badge reports the source of truth; the local save
      // is just the offline cache, so don't let it overwrite 'Supabase' —
      // unless the cache write actually failed, which is worth surfacing.
      if (!isCurriculumRemote() || status === 'Error') {
        setStorageStatus(status);
      }
      if (courses.length > 0 && status !== 'Error') {
        createBackup(courses).catch((err) => console.error('Backup failed:', err));
      }
    }, 1000);
    return () => clearTimeout(handler);
  }, [courses, isReady]);

  const handleCreateCourse = useCallback(
    (name: string, outcomes: CourseOutcome[]) => {
      const newCourse: Course = { id: generateId('course'), name, outcomes, topics: [] };
      updateCourses((draft) => {
        draft.push(newCourse);
      });
      showToast(`Course "${name}" created.`, 'success');
      return newCourse;
    },
    [updateCourses, showToast]
  );

  const handleCreateTopic = useCallback(
    (courseId: string, name: string, year?: SyllabusYear) => {
      // Tagged with the year the curator is looking at, or it lands in the
      // other one and appears to have vanished. `undefined` stays undefined
      // rather than becoming 'year12' — absence is what every existing topic
      // has, and the two must keep meaning the same thing.
      const newItem: Topic = { id: generateId('topic'), name, subTopics: [], ...yearTag(year) };
      updateCourses((draft) => {
        findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
          course.topics.push(newItem);
        });
      });
      showToast(`Topic "${name}" created.`, 'success');
      // In Supabase mode, also push it to the shared library for review
      // (best-effort; silently skipped if the parent course isn't in the
      // library yet or the user has no session).
      if (isCurriculumRemote()) {
        saveTopicContribution(courseId, newItem)
          .then(() => showToast('Topic submitted to the shared library for review.', 'info'))
          .catch(() => {});
      }
      return newItem;
    },
    [updateCourses, showToast]
  );

  const handleCreateTopicWithContent = useCallback(
    (
      courseId: string,
      topicName: string,
      subTopics: { name: string; dotPoints: string[] }[],
      year?: SyllabusYear
    ) => {
      const newTopic: Topic = {
        id: generateId('topic'),
        name: topicName,
        ...yearTag(year),
        subTopics: subTopics.map((st) => ({
          id: generateId('subTopic'),
          name: st.name,
          dotPoints: (st.dotPoints || []).map((dpText) => ({
            id: generateId('dp'),
            description: dpText,
            prompts: [],
          })),
        })),
      };
      updateCourses((draft) => {
        findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
          course.topics.push(newTopic);
        });
      });
      const stCount = newTopic.subTopics.length;
      const dpCount = newTopic.subTopics.reduce((a, st) => a + st.dotPoints.length, 0);
      const details =
        stCount > 0
          ? ` with ${stCount} sub-topic${stCount !== 1 ? 's' : ''} and ${dpCount} dot point${dpCount !== 1 ? 's' : ''}`
          : '';
      showToast(`Topic "${topicName}" created${details}.`, 'success');
      return newTopic;
    },
    [updateCourses, showToast]
  );

  const handleCreateSubTopic = useCallback(
    (path: StatePath, name: string) => {
      const newItem: SubTopic = { id: generateId('subTopic'), name, dotPoints: [] };
      updateCourses((draft) => {
        findAndUpdateItem(
          draft,
          { courseId: path.courseId, topicId: path.topicId },
          (topic: Draft<Topic>) => {
            topic.subTopics.push(newItem);
          }
        );
      });
      showToast(`Sub-Topic "${name}" created.`, 'success');
      if (isCurriculumRemote() && path.topicId) {
        saveSubTopicContribution(path.topicId, newItem)
          .then(() => showToast('Sub-topic submitted to the shared library for review.', 'info'))
          .catch(() => {});
      }
      return newItem;
    },
    [updateCourses, showToast]
  );

  const handleAddDotPoints = useCallback(
    (path: StatePath, descriptions: string[]) => {
      const newDotPoints: DotPoint[] = descriptions.map((desc) => ({
        id: generateId('dp'),
        description: desc,
        prompts: [],
      }));
      updateCourses((draft) => {
        findAndUpdateItem(
          draft,
          { ...path, dotPointId: undefined },
          (subTopic: Draft<SubTopic>) => {
            subTopic.dotPoints.push(...newDotPoints);
          }
        );
      });
      showToast(`${newDotPoints.length} dot points added.`, 'success');
      if (isCurriculumRemote() && path.subTopicId) {
        Promise.allSettled(
          newDotPoints.map((dp) => saveDotPointContribution(path.subTopicId as string, dp))
        ).then((results) => {
          if (results.some((r) => r.status === 'fulfilled')) {
            showToast('Dot point(s) submitted to the shared library for review.', 'info');
          }
        });
      }
    },
    [updateCourses, showToast]
  );

  /**
   * Hand-set (or clear) a dot point's focus areas.
   *
   * `undefined` is meaningfully different from `[]` here: it drops the override
   * so the description is parsed again, while an empty array is a teacher
   * saying this dot point HAS no focus areas — see DotPoint.focusAreas.
   */
  const handleUpdateFocusAreas = useCallback(
    (dotPointId: string, focusAreas: string[] | undefined) => {
      updateCourses((draft) => {
        draft.forEach((c) =>
          c.topics.forEach((t) =>
            t.subTopics.forEach((st) =>
              st.dotPoints.forEach((dp) => {
                if (dp.id === dotPointId) {
                  if (focusAreas === undefined) delete dp.focusAreas;
                  else dp.focusAreas = focusAreas;
                }
              })
            )
          )
        );
      });
      showToast(
        focusAreas === undefined
          ? 'Focus areas reset — reading the syllabus wording again.'
          : `Focus areas updated (${focusAreas.length}).`,
        'success'
      );
    },
    [updateCourses, showToast]
  );

  const handleGeneratePrompt = useCallback(
    async (path: StatePath, newPrompt: Prompt) => {
      updateCourses((draft) => {
        findAndUpdateItem(draft, { ...path, promptId: undefined }, (dotPoint: Draft<DotPoint>) => {
          dotPoint.prompts.push(newPrompt);
        });
      });
      return newPrompt;
    },
    [updateCourses]
  );

  const confirmRename = useCallback(
    (target: { type: string; id: string }, newName: string) => {
      updateCourses((draft) => {
        const updateLogic = (items: any[], type: string) => {
          const item = items.find((i) => i.id === target.id);
          if (item) {
            if (type === 'dotPoint') item.description = newName;
            else if (type === 'prompt') item.question = newName;
            else item.name = newName;
          }
        };
        switch (target.type) {
          case 'course':
            updateLogic(draft, 'course');
            break;
          case 'topic':
            draft.forEach((c) => updateLogic(c.topics, 'topic'));
            break;
          case 'subTopic':
            draft.forEach((c) => c.topics.forEach((t) => updateLogic(t.subTopics, 'subTopic')));
            break;
          case 'dotPoint':
            draft.forEach((c) =>
              c.topics.forEach((t) =>
                t.subTopics.forEach((st) => updateLogic(st.dotPoints, 'dotPoint'))
              )
            );
            break;
          case 'prompt':
            draft.forEach((c) =>
              c.topics.forEach((t) =>
                t.subTopics.forEach((st) =>
                  st.dotPoints.forEach((dp) => updateLogic(dp.prompts, 'prompt'))
                )
              )
            );
            break;
        }
      });
      showToast(`${ITEM_TYPE_LABELS[target.type] ?? 'Item'} renamed.`, 'success');
    },
    [updateCourses, showToast]
  );

  const confirmDelete = useCallback(
    (path: StatePath, target: { type: any; id: string; name: string }) => {
      const { updatedCourses, newPath } = deleteSyllabusItem(courses, path, target.type, target.id);
      updateCourses(() => updatedCourses);
      showToast(`${ITEM_TYPE_LABELS[target.type] ?? 'Item'} deleted.`, 'success');
      return newPath;
    },
    [courses, updateCourses, showToast]
  );

  const handleUpdateOutcomes = useCallback(
    (courseId: string, newOutcomes: CourseOutcome[]) => {
      updateCourses((draft) => {
        findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
          course.outcomes = newOutcomes;
        });
      });
      showToast('Outcomes updated.', 'success');
    },
    [updateCourses, showToast]
  );

  const handleSampleAnswerGenerated = useCallback(
    (path: StatePath, newAnswer: SampleAnswer) => {
      updateCourses((draft) => {
        findAndUpdateItem(draft, path, (prompt: Draft<Prompt>) => {
          if (!prompt.sampleAnswers) prompt.sampleAnswers = [];
          prompt.sampleAnswers.push(newAnswer);
        });
      });
      showToast(`Response saved to library.`, 'success');
    },
    [updateCourses, showToast]
  );

  const handleUpdateSampleAnswer = useCallback(
    (path: StatePath, updatedAnswer: SampleAnswer) => {
      updateCourses((draft) => {
        findAndUpdateItem(draft, path, (prompt: Draft<Prompt>) => {
          const index = prompt.sampleAnswers?.findIndex((sa) => sa.id === updatedAnswer.id);
          if (index !== undefined && index > -1) {
            prompt.sampleAnswers![index] = updatedAnswer;
          }
        });
      });
      showToast(`Response updated.`, 'success');
    },
    [updateCourses, showToast]
  );

  const handleDeleteSampleAnswer = useCallback(
    (path: StatePath, sampleAnswerId: string) => {
      updateCourses((draft) => {
        findAndUpdateItem(draft, path, (prompt: Draft<Prompt>) => {
          prompt.sampleAnswers =
            prompt.sampleAnswers?.filter((sa) => sa.id !== sampleAnswerId) || [];
        });
      });
      showToast(`Response deleted.`, 'success');
    },
    [updateCourses, showToast]
  );

  // Submit a single sample answer to the shared Supabase library for review.
  // AI-pre-screens it (score attached for reviewers), then saves as `pending`.
  // No-op outside Supabase mode; the button that calls this is only shown then.
  const handleContributeSampleAnswer = useCallback(
    async (path: StatePath, answer: SampleAnswer) => {
      if (!isCurriculumRemote() || !path.promptId) return;
      try {
        const quality = await screenContentQuality(answer.answer, 'sample answer');
        await saveSampleAnswerContribution(path.promptId, answer, 'pending', quality);
        showToast(
          quality
            ? `Sample answer submitted for review (AI quality score ${quality.score}/100).`
            : 'Sample answer submitted to the shared library for review.',
          'success'
        );
      } catch (e) {
        showToast(e instanceof Error ? e.message : 'Submission failed.', 'error');
      }
    },
    [showToast]
  );

  const handleMoveTopic = useCallback(
    (courseId: string, topicId: string, direction: 'up' | 'down') => {
      updateCourses((draft) => {
        const course = draft.find((c) => c.id === courseId);
        if (!course) return;
        const idx = course.topics.findIndex((t) => t.id === topicId);
        if (idx === -1) return;
        const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
        if (swapIdx >= 0 && swapIdx < course.topics.length) {
          const temp = course.topics[idx];
          course.topics[idx] = course.topics[swapIdx];
          course.topics[swapIdx] = temp;
        }
      });
    },
    [updateCourses]
  );

  const handleImportCourses = useCallback(
    (imported: Course[], resolutions: Map<string, 'merge' | 'skip'>): string[] => {
      const newCourseIds: string[] = [];
      updateCourses((draft) => {
        imported.forEach((importedCourse) => {
          const existingIdx = draft.findIndex((c) => c.id === importedCourse.id);
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
    },
    [updateCourses]
  );

  const handleImportTopic = useCallback(
    (courseId: string, topic: Topic) => {
      // Return the topic that actually landed in the tree: when merging into
      // an existing topic the existing ID survives, and callers navigate to
      // the returned ID — returning the imported topic would point them at a
      // topic that doesn't exist.
      let resultTopic: Topic = topic;
      updateCourses((draft) => {
        findAndUpdateItem(draft, { courseId }, (course: Draft<Course>) => {
          const existingTopicIndex = course.topics.findIndex(
            (existingTopic) =>
              existingTopic.id === topic.id ||
              normalizeText(existingTopic.name) === normalizeText(topic.name)
          );

          if (existingTopicIndex !== -1) {
            const mergedTopic = mergeTopicContents(course.topics[existingTopicIndex], topic);
            course.topics[existingTopicIndex] = mergedTopic;
            resultTopic = mergedTopic;
          } else {
            course.topics.push(topic);
          }
        });
      });
      showToast(`Topic "${resultTopic.name}" imported.`, 'success');
      return resultTopic;
    },
    [updateCourses, showToast]
  );

  const handleClearAllData = useCallback(() => {
    updateCourses(() => []);
    showToast('System wiped.', 'success');
  }, [updateCourses, showToast]);

  const handleResetToDefault = useCallback(async () => {
    await AICache.clear();
    const { preseededCourses } = await import('../data/seedData');
    updateCourses(() => preseededCourses);
    showToast('Factory reset successful.', 'success');
  }, [updateCourses, showToast]);

  const handlePublishToLibrary = useCallback(
    async (item: LibraryItem) => {
      try {
        await saveToLibrary(item);
        const updatedLibrary = await fetchLibrary();
        setLibraryItems(updatedLibrary);
        showToast(`"${item.title}" added to Global library.`, 'success');
      } catch (e) {
        showToast('Library publication failed.', 'error');
      }
    },
    [showToast]
  );

  const handleImportFromLibrary = useCallback(
    async (item: LibraryItem, targetCourseId?: string) => {
      if (item.type === 'course') {
        handleImportCourses([item.data as Course], new Map());
      } else if (item.type === 'topic' && targetCourseId) {
        handleImportTopic(targetCourseId, regenerateTopicIds(item.data as Topic));
      }
    },
    [handleImportCourses, handleImportTopic]
  );

  const handleDeleteFromLibrary = useCallback(
    async (id: string) => {
      try {
        await deleteFromLibrary(id);
        const updatedLibrary = await fetchLibrary();
        setLibraryItems(updatedLibrary);
      } catch (e) {
        showToast('Failed to remove from library.', 'error');
      }
    },
    [showToast]
  );

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
    handleCreateTopicWithContent,
    handleCreateSubTopic,
    handleAddDotPoints,
    handleUpdateFocusAreas,
    handleGeneratePrompt,
    confirmRename,
    confirmDelete,
    handleUpdateOutcomes,
    handleSampleAnswerGenerated,
    handleUpdateSampleAnswer,
    handleDeleteSampleAnswer,
    handleContributeSampleAnswer,
    handleImportCourses,
    handleImportTopic,
    handleClearAllData,
    handleResetToDefault,
    handlePublishToLibrary,
    handleImportFromLibrary,
    handleDeleteFromLibrary,
    handleMoveTopic,
  };
};
