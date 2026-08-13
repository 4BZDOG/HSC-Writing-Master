import React, { lazy, Suspense } from 'react';
import { Course, StatePath, Topic, User } from '../types';
import { Draft } from 'immer';
import CourseCreatorModal from './CourseCreatorModal';
import SubTopicCreatorModal from './SubTopicCreatorModal';
import PromptGeneratorModal from './PromptGeneratorModal';
import OutcomesEditorModal from './OutcomesEditorModal';
import DataManagerModal from './DataManagerModal';
import RenameModal from './RenameModal';
import ConfirmationModal from './ConfirmationModal';
import TopicSyllabusImportModal from './TopicSyllabusImportModal';
import DotPointGeneratorModal from './DotPointGeneratorModal';
import SyllabusImportModal from './SyllabusImportModal';
import StarterQuestionsModal from './StarterQuestionsModal';
import TopicImportModal from './TopicImportModal';
import QualityCheckModal from './QualityCheckModal';
import UserProfileModal from './UserProfileModal';
import ManualPromptModal from './ManualPromptModal';
import ManifestImportModal from './ManifestImportModal';
import QuickStartModal from './QuickStartModal';
import LegalDocumentModal from './LegalDocumentModal';
import {
  regenerateTopicIds,
  mergeTopicContents,
  getFocusAreas,
  parseSubItemsFromDescription,
} from '../utils/dataManagerUtils';
import type { RenameFocusAreaGuard } from './RenameModal';
import { findAndUpdateItem } from '../utils/stateUtils';
import { canCurateContent, isSystemAdmin } from '../utils/permissions';
import {
  activeSyllabusYear,
  outcomesForYear,
  topicsForYear,
  yearShortLabel,
} from '../utils/syllabusYear';
import { generateId } from '../utils/idUtils';
import type { TopicSyllabusImportPayload } from './TopicSyllabusImportModal';

/**
 * System-admin only, and lazy for it: mounted eagerly it pulled the whole
 * admin chunk into every student's first load for a modal they can never open.
 */
const DatabaseDashboard = lazy(() => import('./admin/DatabaseDashboard'));

interface AppModalsProps {
  activeModals: Set<string>;
  modalProps: any;
  modalHandlers: any;
  syllabusHandlers: any;
  geminiHandlers: any;
  currentSelection: any;
  statePath: StatePath;
  courses: Course[];
  setStatePath: (path: Partial<StatePath>) => void;
  showToast: (
    message: string,
    type: 'success' | 'error' | 'info',
    action?: { label: string; onClick: () => void }
  ) => void;
  setNewlyAddedIds: React.Dispatch<React.SetStateAction<Set<string>>>;
  user: User | null;
  onUpdateUser: (user: User) => void;
  onLogout: () => void;
}

const AppModals: React.FC<AppModalsProps> = ({
  activeModals,
  modalProps,
  modalHandlers,
  syllabusHandlers,
  geminiHandlers,
  currentSelection,
  statePath,
  courses,
  setStatePath,
  showToast,
  setNewlyAddedIds,
  user,
  onUpdateUser,
  onLogout,
}) => {
  const { currentCourse, currentTopic, currentSubTopic, currentDotPoint } = currentSelection;

  // The year the navigator is showing — resolved exactly as IT resolves it,
  // `allowEmpty` included. A curator standing in an empty Year 11 is there to
  // fill it, so everything created or imported from here belongs to Year 11,
  // not to whichever year happens to have content already.
  const activeYear = activeSyllabusYear(
    currentCourse,
    statePath.syllabusYear,
    !!user && canCurateContent(user.role)
  );

  const isModalOpen = (name: string) => activeModals.has(name);
  const closeModal = modalHandlers.closeModal;

  // Which tab the quick-start guide should open on. "Compare plans" in the
  // profile goes straight to the plan table rather than making the user find
  // it behind the getting-started steps.
  const [quickStartTab, setQuickStartTab] = React.useState<'guide' | 'plans' | 'tips'>('guide');

  /**
   * Which course the starter-questions offer is about.
   *
   * Held explicitly rather than read from the navigator: merging a syllabus
   * into a course that is NOT the one on screen leaves the selection where it
   * was, so the offer would have counted the empty dot points of whatever
   * course the person happened to be looking at and written questions into it.
   */
  const [starterCourseId, setStarterCourseId] = React.useState<string | null>(null);

  /**
   * The library as it is NOW, for callbacks that outlive their render.
   *
   * The import is awaited, so by the time it returns, the `courses` prop
   * captured in that callback's closure is the list from BEFORE it ran — and a
   * newly created course is not in it at all. Reading it there found nothing,
   * counted zero empty syllabus points, and silently skipped the offer in
   * exactly the case the offer is for.
   */
  const coursesRef = React.useRef(courses);
  coursesRef.current = courses;

  // User-facing labels for syllabus item types — the raw type names
  // (subTopic, dotPoint) must never leak into modal titles or messages.
  const ITEM_LABELS: Record<string, string> = {
    course: 'Course',
    topic: 'Topic',
    subTopic: 'Sub-topic',
    dotPoint: 'Dot point',
    prompt: 'Question',
  };

  // Sibling names for the item being renamed, so RenameModal can flag
  // duplicates. Renaming to a sibling's name breaks import matching, which
  // pairs topics/sub-topics/dot points by normalised name.
  /**
   * Renaming a dot point rewrites the text its focus areas are read from, so
   * unless the teacher has already set them by hand the rename silently changes
   * what generated questions are narrowed to. Handed to RenameModal, which
   * surfaces the change and offers to pin the current list.
   */
  const renameFocusAreaGuard = ((): RenameFocusAreaGuard | undefined => {
    const target = modalProps.renameTarget;
    if (target?.type !== 'dotPoint') return undefined;
    const dotPoint = courses
      .flatMap((c) => c.topics)
      .flatMap((t) => t.subTopics)
      .flatMap((st) => st.dotPoints)
      .find((dp) => dp.id === target.id);
    if (!dotPoint) return undefined;
    return {
      current: getFocusAreas(dotPoint),
      previewFor: (name: string) => parseSubItemsFromDescription(name),
      isOverridden: !!dotPoint.focusAreas,
      onKeep: (focusAreas) => syllabusHandlers.handleUpdateFocusAreas(dotPoint.id, focusAreas),
    };
  })();

  const renameSiblingNames = ((): string[] => {
    const target = modalProps.renameTarget;
    if (!target) return [];
    switch (target.type) {
      case 'course':
        return courses.filter((c) => c.id !== target.id).map((c) => c.name);
      case 'topic':
        return topicsForYear(currentCourse, activeYear)
          .filter((t: Topic) => t.id !== target.id)
          .map((t: Topic) => t.name);
      case 'subTopic':
        return (currentTopic?.subTopics || [])
          .filter((st: { id: string }) => st.id !== target.id)
          .map((st: { name: string }) => st.name);
      case 'dotPoint':
        return (currentSubTopic?.dotPoints || [])
          .filter((dp: { id: string }) => dp.id !== target.id)
          .map((dp: { description: string }) => dp.description);
      default:
        return [];
    }
  })();

  return (
    <>
      <CourseCreatorModal
        isOpen={isModalOpen('courseCreator')}
        onClose={() => closeModal('courseCreator')}
        existingNames={courses.map((c) => c.name)}
        onCourseCreated={(name, outcomes) => {
          const newCourse = syllabusHandlers.handleCreateCourse(name, outcomes);
          if (newCourse) {
            setStatePath({ courseId: newCourse.id });
            setNewlyAddedIds((prev) => new Set(prev).add(newCourse.id));
          }
        }}
      />

      <SubTopicCreatorModal
        isOpen={isModalOpen('subTopicCreator')}
        onClose={() => closeModal('subTopicCreator')}
        onItemCreated={async (name, { generateDotPoints }) => {
          const newSubTopic = syllabusHandlers.handleCreateSubTopic(statePath, name);
          if (newSubTopic) {
            setNewlyAddedIds((prev) => new Set(prev).add(newSubTopic.id));
            // Navigate to the new sub-topic straight away — dot point
            // generation targets its path explicitly, so the user shouldn't
            // wait on a multi-second AI call to see their new sub-topic.
            setStatePath({
              ...statePath,
              subTopicId: newSubTopic.id,
              dotPointId: undefined,
              promptId: undefined,
            });
            if (generateDotPoints && currentCourse && currentTopic) {
              const generatedDotPoints = await geminiHandlers.generateDotPointsForSubTopic(
                currentCourse.name,
                currentTopic.name,
                newSubTopic.name
              );
              if (generatedDotPoints) {
                const pathForNewSubTopic = { ...statePath, subTopicId: newSubTopic.id };
                syllabusHandlers.handleAddDotPoints(pathForNewSubTopic, generatedDotPoints);
              }
            }
          }
        }}
        existingNames={currentTopic?.subTopics.map((st) => st.name) || []}
        destination={currentTopic?.name}
      />

      <PromptGeneratorModal
        isOpen={isModalOpen('promptGenerator')}
        onClose={() => closeModal('promptGenerator')}
        onPromptGenerated={async (prompt) => {
          const newPrompt = await syllabusHandlers.handleGeneratePrompt(statePath, prompt);
          if (newPrompt) {
            setStatePath({ ...statePath, promptId: newPrompt.id });
            setNewlyAddedIds((prev) => new Set(prev).add(newPrompt.id));
          }
        }}
        courseName={currentCourse?.name || ''}
        topicName={currentTopic?.name || ''}
        subTopicName={currentSubTopic?.name || ''}
        dotPoint={currentDotPoint?.description || ''}
        marks={0}
        // A Year 11 question must not be offered HSC outcomes to link itself
        // to. Lenient: a course that has never labelled its outcomes still
        // offers all of them, which is what it did before the split.
        courseOutcomes={outcomesForYear(currentCourse, activeYear)}
        selectedFocusItems={statePath.selectedSubItems || []}
        focusAreaOptions={getFocusAreas(currentDotPoint)}
      />

      <ManualPromptModal
        isOpen={isModalOpen('manualPrompt')}
        onClose={() => closeModal('manualPrompt')}
        onSave={async (prompt) => {
          const newPrompt = await syllabusHandlers.handleGeneratePrompt(statePath, prompt);
          if (newPrompt) {
            setStatePath({ ...statePath, promptId: newPrompt.id });
            setNewlyAddedIds((prev) => new Set(prev).add(newPrompt.id));
            showToast('Manual prompt refined and saved.', 'success');
          }
        }}
        courseName={currentCourse?.name || ''}
        topicName={currentTopic?.name || ''}
        subTopicName={currentSubTopic?.name || ''}
        dotPoint={currentDotPoint?.description || ''}
        outcomes={outcomesForYear(currentCourse, activeYear)}
      />

      {currentCourse && (
        <OutcomesEditorModal
          isOpen={isModalOpen('outcomesEditor')}
          onClose={() => closeModal('outcomesEditor')}
          onSave={(outcomes) => syllabusHandlers.handleUpdateOutcomes(currentCourse.id, outcomes)}
          // Both years: the editor has a tab for each, so it can take a NESA
          // page that lists them together.
          initialOutcomes={currentCourse.outcomes}
          courseName={currentCourse.name}
          year={activeYear}
          showToast={showToast}
        />
      )}

      <DataManagerModal
        isOpen={isModalOpen('dataManager')}
        onClose={() => closeModal('dataManager')}
        courses={courses}
        onImportCourses={(importedCourses, conflictResolutions) => {
          const newIds = syllabusHandlers.handleImportCourses(importedCourses, conflictResolutions);
          if (newIds && newIds.length > 0) {
            setStatePath({
              courseId: newIds[0],
              topicId: undefined,
              subTopicId: undefined,
              dotPointId: undefined,
              promptId: undefined,
            });
            setNewlyAddedIds((prev) => {
              const newSet = new Set(prev);
              newIds.forEach((id) => newSet.add(id));
              return newSet;
            });
          }
          const newCount = newIds?.length || 0;
          const mergedCount = importedCourses.filter(
            (c) => conflictResolutions.get(c.id) === 'merge'
          ).length;
          const parts: string[] = [];
          if (newCount > 0) parts.push(`${newCount} new course${newCount !== 1 ? 's' : ''} added`);
          if (mergedCount > 0)
            parts.push(`${mergedCount} course${mergedCount !== 1 ? 's' : ''} merged`);
          if (parts.length > 0) {
            showToast(`Import complete: ${parts.join(', ')}.`, 'success');
          } else {
            showToast('Import finished — all courses were skipped.', 'info');
          }
        }}
        onImportTopic={syllabusHandlers.handleImportTopic}
        onClearAll={() => {
          modalHandlers.showConfirmation({
            title: 'Clear All Data?',
            message:
              'This will permanently delete all your courses and questions. This action cannot be undone.',
            confirmButtonText: 'Yes, Clear Everything',
            isDestructive: true,
            onConfirm: () => {
              syllabusHandlers.handleClearAllData();
              setStatePath({});
            },
          });
        }}
        onResetToDefault={() => {
          modalHandlers.showConfirmation({
            title: 'Reset to Default Data?',
            message:
              'This will delete all your current data and load the default sample courses. This action cannot be undone.',
            confirmButtonText: 'Yes, Reset Data',
            isDestructive: true,
            onConfirm: () => {
              syllabusHandlers.handleResetToDefault();
              setStatePath({});
            },
          });
        }}
        onResetApiStats={syllabusHandlers.onResetApiStats}
        onMoveTopic={syllabusHandlers.handleMoveTopic}
        showToast={showToast}
      />

      {/* Gated on the role as well as the open flag — the Database Manager is
          a system-admin tool, and nobody else should be mounting it at all. */}
      {user && isSystemAdmin(user.role) && (
        <Suspense fallback={null}>
          <DatabaseDashboard
            isOpen={isModalOpen('databaseDashboard')}
            onClose={() => closeModal('databaseDashboard')}
            courses={courses}
            showToast={showToast}
          />
        </Suspense>
      )}

      <SyllabusImportModal
        isOpen={isModalOpen('fullSyllabusImport')}
        onClose={() => closeModal('fullSyllabusImport')}
        courses={courses}
        defaultYear={activeYear}
        onImport={async (courseName, structure, outcomes, targetCourseId, targetTopicId, year) => {
          const { courseId, emptyDotPoints } = await geminiHandlers.handleStartFullSyllabusImport(
            courseName,
            structure,
            outcomes,
            targetCourseId,
            targetTopicId,
            // The modal's own control, which opens on the navigator's year. A
            // NESA document is one year's, so the import needs to be told which
            // — including for a brand-new course, which is the whole point of
            // seeding one from a Year 11 syllabus in a single pass.
            year
          );
          // Land the user on a freshly created course; leave an in-progress
          // selection untouched when merging into an existing course.
          if (!targetCourseId && courseId) {
            setStatePath({ courseId });
          }
          if (!courseId) return;

          /**
           * Offer what comes next, rather than opening it at them.
           *
           * An imported syllabus has no questions in it, which is the one thing
           * a student opens the app for — so the offer belongs right here,
           * while the import is still what the person is thinking about. It
           * used to be a modal that opened itself, which is a heavy way to ask
           * a question the answer to which may well be "not now".
           *
           * Merging into a course that is NOT on screen gets a way to go there
           * instead: the navigator deliberately stays put, so without this the
           * message names a place the person cannot reach from it.
           */
          const imported = coursesRef.current.find((c) => c.id === courseId);
          // Counted by the import itself, from the merged course — see the note
          // on `coursesRef` for why this cannot be worked out here.
          const empty = emptyDotPoints;
          const wentElsewhere = !!targetCourseId && targetCourseId !== currentCourse?.id;

          if (empty > 0) {
            showToast(
              `${empty} syllabus point${empty === 1 ? '' : 's'} in "${imported?.name ?? 'the course'}" have no question yet.`,
              'info',
              {
                label: 'Write starter questions',
                onClick: () => {
                  setStarterCourseId(courseId);
                  if (wentElsewhere) setStatePath({ courseId });
                  modalHandlers.openModal('starterQuestions');
                },
              }
            );
          } else if (wentElsewhere) {
            showToast(`Merged into "${imported?.name ?? 'that course'}".`, 'success', {
              label: 'Go to it',
              onClick: () => setStatePath({ courseId }),
            });
          }
        }}
      />

      <StarterQuestionsModal
        isOpen={isModalOpen('starterQuestions')}
        onClose={() => {
          setStarterCourseId(null);
          closeModal('starterQuestions');
        }}
        course={courses.find((c) => c.id === starterCourseId) ?? currentCourse}
        updateCourses={syllabusHandlers.updateCourses}
        showToast={showToast}
      />

      {currentCourse && (
        <TopicImportModal
          isOpen={isModalOpen('topicImport')}
          onClose={() => closeModal('topicImport')}
          courseName={currentCourse.name}
          onImport={(topic) => {
            const topicWithNewIds = regenerateTopicIds(topic);
            // An export from before the two years existed says nothing about
            // which it belongs to; it joins the one being looked at. A file
            // that DOES declare a year keeps it — the file knows better.
            const placed: Topic =
              topicWithNewIds.year || activeYear === 'year12'
                ? topicWithNewIds
                : { ...topicWithNewIds, year: activeYear };
            const newTopic = syllabusHandlers.handleImportTopic(currentCourse.id, placed);
            if (newTopic) {
              setStatePath({
                ...statePath,
                topicId: newTopic.id,
                subTopicId: undefined,
                dotPointId: undefined,
                promptId: undefined,
              });
            }
          }}
        />
      )}

      <ManifestImportModal
        isOpen={isModalOpen('manifestImport')}
        onClose={() => closeModal('manifestImport')}
        discoveredDocs={syllabusHandlers.discoveredDocs}
        onImport={syllabusHandlers.importDiscoveredDocs}
      />

      {modalProps.qualityCheckProps && (
        <QualityCheckModal
          isOpen={isModalOpen('qualityCheck')}
          onClose={modalHandlers.closeQualityCheck}
          content={modalProps.qualityCheckProps.content}
          contentType={modalProps.qualityCheckProps.type}
          onUpdateContent={modalProps.qualityCheckProps.onUpdate}
        />
      )}

      {user && (
        <UserProfileModal
          isOpen={isModalOpen('userProfile')}
          onClose={() => closeModal('userProfile')}
          user={user}
          onUpdateUser={onUpdateUser}
          onLogout={onLogout}
          onOpenQuickStart={() => {
            setQuickStartTab('guide');
            modalHandlers.openModal('quickStart');
          }}
          onComparePlans={() => {
            setQuickStartTab('plans');
            modalHandlers.openModal('quickStart');
          }}
          onOpenLegal={() => modalHandlers.openModal('legalDocuments')}
        />
      )}

      {user && (
        // Keyed on the requested tab: the guide stays mounted while closed, so
        // without this a second open would reuse the tab from the first.
        <QuickStartModal
          key={quickStartTab}
          isOpen={isModalOpen('quickStart')}
          onClose={() => closeModal('quickStart')}
          user={user}
          initialTab={quickStartTab}
          onOpenLegal={() => modalHandlers.openModal('legalDocuments')}
        />
      )}

      <LegalDocumentModal
        isOpen={isModalOpen('legalDocuments')}
        onClose={() => closeModal('legalDocuments')}
      />

      {modalProps.renameTarget && (
        <RenameModal
          isOpen={isModalOpen('rename')}
          onClose={modalHandlers.cancelRename}
          onRename={modalHandlers.confirmRename}
          targetType={ITEM_LABELS[modalProps.renameTarget.type] ?? 'Item'}
          initialName={modalProps.renameTarget.name}
          existingNames={renameSiblingNames}
          focusAreaGuard={renameFocusAreaGuard}
          // Dot points and questions are the two that run to several lines —
          // see RenameModal's `multiline`.
          multiline={
            modalProps.renameTarget.type === 'dotPoint' || modalProps.renameTarget.type === 'prompt'
          }
        />
      )}

      {modalProps.deleteTarget && (
        <ConfirmationModal
          isOpen={isModalOpen('deleteConfirmation')}
          onClose={modalHandlers.cancelDelete}
          onConfirm={() => {
            const newPath = syllabusHandlers.confirmDelete(statePath, modalProps.deleteTarget);
            setStatePath(newPath);
            modalHandlers.cancelDelete();
          }}
          title={`Delete ${(ITEM_LABELS[modalProps.deleteTarget.type] ?? 'item').toLowerCase()}?`}
          message={`Are you sure you want to delete "${modalProps.deleteTarget.name}"? This action cannot be undone.`}
          confirmButtonText="Delete"
          isDestructive
        />
      )}

      {modalProps.confirmationProps && (
        <ConfirmationModal
          isOpen={isModalOpen('confirmation')}
          onClose={modalHandlers.cancelConfirmation}
          onConfirm={modalHandlers.handleConfirmAction}
          {...modalProps.confirmationProps}
        />
      )}

      {currentCourse && (
        <TopicSyllabusImportModal
          isOpen={isModalOpen('topicSyllabusImport')}
          onClose={() => closeModal('topicSyllabusImport')}
          courseName={currentCourse.name}
          year={activeYear}
          topics={topicsForYear(currentCourse, activeYear).map((t: Topic) => ({
            id: t.id,
            name: t.name,
          }))}
          initialTopicId={currentTopic?.id ?? null}
          onImport={(payload: TopicSyllabusImportPayload) => {
            const importedTopic: Topic = {
              id: generateId('topic'),
              name: payload.topicName,
              // Year 11 syllabus text pasted while looking at Year 11 lands in
              // Year 11. Written only for the non-default year, so Year 12
              // content keeps meaning "no year field" as it always has.
              ...(activeYear === 'year12' ? {} : { year: activeYear }),
              subTopics: payload.subTopics.map((st) => ({
                id: generateId('subTopic'),
                name: st.name,
                dotPoints: st.dotPoints.map((dp) => ({
                  id: generateId('dp'),
                  description: dp,
                  prompts: [],
                })),
              })),
            };

            let resultTopicId = importedTopic.id;
            let mergedIntoName = '';
            syllabusHandlers.updateCourses((draft: Draft<Course[]>) => {
              const course = draft.find((c) => c.id === currentCourse.id);
              if (!course) return;
              // An explicit destination topic, or an existing topic whose name
              // matches the new one — merge rather than create a duplicate.
              const target = payload.targetTopicId
                ? course.topics.find((t) => t.id === payload.targetTopicId)
                : course.topics.find(
                    (t) => t.name.trim().toLowerCase() === payload.topicName.trim().toLowerCase()
                  );
              if (target) {
                const merged = mergeTopicContents(target, {
                  ...importedTopic,
                  id: target.id,
                  name: target.name,
                });
                const idx = course.topics.findIndex((t) => t.id === target.id);
                course.topics[idx] = merged;
                resultTopicId = target.id;
                mergedIntoName = target.name;
              } else {
                course.topics.push(importedTopic);
              }
            });

            const subTopicCount = payload.subTopics.length;
            const dotPointCount = payload.subTopics.reduce(
              (acc, st) => acc + st.dotPoints.length,
              0
            );
            showToast(
              mergedIntoName
                ? `Added ${subTopicCount} sub-topics and ${dotPointCount} dot points to "${mergedIntoName}".`
                : `Created "${payload.topicName}" with ${subTopicCount} sub-topics and ${dotPointCount} dot points.`,
              'success'
            );

            if (!mergedIntoName) {
              setNewlyAddedIds((prev) => new Set(prev).add(resultTopicId));
            }
            setStatePath({
              ...statePath,
              topicId: resultTopicId,
              subTopicId: undefined,
              dotPointId: undefined,
              promptId: undefined,
            });
          }}
        />
      )}

      {currentSubTopic && (
        <DotPointGeneratorModal
          isOpen={isModalOpen('dotPointGenerator')}
          onClose={() => closeModal('dotPointGenerator')}
          courseName={currentCourse?.name || ''}
          topicName={currentTopic?.name || ''}
          subTopicName={currentSubTopic.name}
          onDotPointsGenerated={(dotPoints) => {
            syllabusHandlers.handleAddDotPoints(statePath, dotPoints);
          }}
        />
      )}
    </>
  );
};

export default AppModals;
