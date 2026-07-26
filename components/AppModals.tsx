import React from 'react';
import { Course, StatePath, Topic, User } from '../types';
import { Draft } from 'immer';
import CourseCreatorModal from './CourseCreatorModal';
import TopicCreatorModal from './TopicCreatorModal';
import SubTopicCreatorModal from './SubTopicCreatorModal';
import PromptGeneratorModal from './PromptGeneratorModal';
import OutcomesEditorModal from './OutcomesEditorModal';
import DataManagerModal from './DataManagerModal';
import RenameModal from './RenameModal';
import ConfirmationModal from './ConfirmationModal';
import TopicSyllabusImportModal from './TopicSyllabusImportModal';
import DotPointGeneratorModal from './DotPointGeneratorModal';
import SyllabusImportModal from './SyllabusImportModal';
import TopicImportModal from './TopicImportModal';
import QualityCheckModal from './QualityCheckModal';
import UserProfileModal from './UserProfileModal';
import DatabaseDashboard from './admin/DatabaseDashboard';
import ManualPromptModal from './ManualPromptModal';
import ManifestImportModal from './ManifestImportModal';
import QuickStartModal from './QuickStartModal';
import LegalDocumentModal from './LegalDocumentModal';
import { regenerateTopicIds, mergeTopicContents } from '../utils/dataManagerUtils';
import { findAndUpdateItem } from '../utils/stateUtils';
import { generateId } from '../utils/idUtils';
import type { TopicSyllabusImportPayload } from './TopicSyllabusImportModal';

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
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
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

  const isModalOpen = (name: string) => activeModals.has(name);
  const closeModal = modalHandlers.closeModal;

  // Which tab the quick-start guide should open on. "Compare plans" in the
  // profile goes straight to the plan table rather than making the user find
  // it behind the getting-started steps.
  const [quickStartTab, setQuickStartTab] = React.useState<'guide' | 'plans' | 'tips'>('guide');

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
  const renameSiblingNames = ((): string[] => {
    const target = modalProps.renameTarget;
    if (!target) return [];
    switch (target.type) {
      case 'course':
        return courses.filter((c) => c.id !== target.id).map((c) => c.name);
      case 'topic':
        return (currentCourse?.topics || [])
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

      <TopicCreatorModal
        isOpen={isModalOpen('topicCreator')}
        onClose={() => closeModal('topicCreator')}
        onItemCreated={(name) => {
          if (!currentCourse) return;
          const newTopic = syllabusHandlers.handleCreateTopic(currentCourse.id, name);
          if (newTopic) {
            setNewlyAddedIds((prev) => new Set(prev).add(newTopic.id));
            setStatePath({
              ...statePath,
              topicId: newTopic.id,
              subTopicId: undefined,
              dotPointId: undefined,
              promptId: undefined,
            });
          }
        }}
        existingNames={currentCourse?.topics.map((t) => t.name) || []}
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
        courseOutcomes={currentCourse?.outcomes || []}
        selectedFocusItems={statePath.selectedSubItems || []}
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
        outcomes={currentCourse?.outcomes || []}
      />

      {currentCourse && (
        <OutcomesEditorModal
          isOpen={isModalOpen('outcomesEditor')}
          onClose={() => closeModal('outcomesEditor')}
          onSave={(outcomes) => syllabusHandlers.handleUpdateOutcomes(currentCourse.id, outcomes)}
          initialOutcomes={currentCourse.outcomes}
          courseName={currentCourse.name}
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

      <DatabaseDashboard
        isOpen={isModalOpen('databaseDashboard')}
        onClose={() => closeModal('databaseDashboard')}
        courses={courses}
        showToast={showToast}
      />

      <SyllabusImportModal
        isOpen={isModalOpen('fullSyllabusImport')}
        onClose={() => closeModal('fullSyllabusImport')}
        courses={courses}
        onImport={async (courseName, structure, outcomes, targetCourseId, targetTopicId) => {
          const courseId = await geminiHandlers.handleStartFullSyllabusImport(
            courseName,
            structure,
            outcomes,
            targetCourseId,
            targetTopicId
          );
          // Land the user on a freshly created course; leave an in-progress
          // selection untouched when merging into an existing course.
          if (!targetCourseId && courseId) {
            setStatePath({ courseId });
          }
        }}
      />

      {currentCourse && (
        <TopicImportModal
          isOpen={isModalOpen('topicImport')}
          onClose={() => closeModal('topicImport')}
          courseName={currentCourse.name}
          onImport={(topic) => {
            const topicWithNewIds = regenerateTopicIds(topic);
            const newTopic = syllabusHandlers.handleImportTopic(currentCourse.id, topicWithNewIds);
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
          topics={currentCourse.topics.map((t: Topic) => ({ id: t.id, name: t.name }))}
          initialTopicId={currentTopic?.id ?? null}
          onImport={(payload: TopicSyllabusImportPayload) => {
            const importedTopic: Topic = {
              id: generateId('topic'),
              name: payload.topicName,
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
