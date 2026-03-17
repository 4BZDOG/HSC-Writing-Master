import React from 'react';
import { Course, StatePath, SubTopic, Topic, User } from '../types';
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
import TopicGeneratorModal from './TopicGeneratorModal';
import DotPointGeneratorModal from './DotPointGeneratorModal';
import SyllabusImportModal from './SyllabusImportModal';
import TopicImportModal from './TopicImportModal';
import QualityCheckModal from './QualityCheckModal';
import UserProfileModal from './UserProfileModal';
import { regenerateTopicIds } from '../utils/dataManagerUtils';
import { findAndUpdateItem } from '../utils/stateUtils';

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
  onLogout
}) => {
  const { currentCourse, currentTopic, currentSubTopic, currentDotPoint } = currentSelection;

  const isModalOpen = (name: string) => activeModals.has(name);
  const closeModal = modalHandlers.closeModal;

  return (
    <>
      <CourseCreatorModal
        isOpen={isModalOpen('courseCreator')}
        onClose={() => closeModal('courseCreator')}
        onCourseCreated={(name, outcomes) => {
            const newCourse = syllabusHandlers.handleCreateCourse(name, outcomes);
            if (newCourse) {
              setStatePath({ courseId: newCourse.id });
              setNewlyAddedIds(prev => new Set(prev).add(newCourse.id));
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
            setStatePath({ ...statePath, topicId: newTopic.id, subTopicId: undefined, dotPointId: undefined, promptId: undefined });
          }
        }}
        existingNames={currentCourse?.topics.map(t => t.name) || []}
      />
      
      <SubTopicCreatorModal
        isOpen={isModalOpen('subTopicCreator')}
        onClose={() => closeModal('subTopicCreator')}
        onItemCreated={async (name, { generateDotPoints }) => {
          const newSubTopic = syllabusHandlers.handleCreateSubTopic(statePath, name);
          if (newSubTopic) {
            if (generateDotPoints && currentCourse && currentTopic) {
              const generatedDotPoints = await geminiHandlers.generateDotPointsForSubTopic(currentCourse.name, currentTopic.name, newSubTopic.name);
              if (generatedDotPoints) {
                const pathForNewSubTopic = { ...statePath, subTopicId: newSubTopic.id };
                syllabusHandlers.handleAddDotPoints(pathForNewSubTopic, generatedDotPoints);
              }
            }
            setStatePath({ ...statePath, subTopicId: newSubTopic.id, dotPointId: undefined, promptId: undefined });
          }
        }}
        existingNames={currentTopic?.subTopics.map(st => st.name) || []}
      />
      
      <PromptGeneratorModal
        isOpen={isModalOpen('promptGenerator')}
        onClose={() => closeModal('promptGenerator')}
        onPromptGenerated={async (prompt) => {
          const newPrompt = await syllabusHandlers.handleGeneratePrompt(statePath, prompt);
          if (newPrompt) {
            setStatePath({ ...statePath, promptId: newPrompt.id });
            setNewlyAddedIds(prev => new Set(prev).add(newPrompt.id));
          }
        }}
        courseName={currentCourse?.name || ''}
        topicName={currentTopic?.name || ''}
        subTopicName={currentSubTopic?.name || ''}
        dotPoint={currentDotPoint?.description || ''}
        marks={7}
        courseOutcomes={currentCourse?.outcomes || []}
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
              setStatePath({ courseId: newIds[0], topicId: undefined, subTopicId: undefined, dotPointId: undefined, promptId: undefined });
              setNewlyAddedIds(prev => {
                const newSet = new Set(prev);
                newIds.forEach(id => newSet.add(id));
                return newSet;
              });
            }
        }}
        onImportTopic={syllabusHandlers.handleImportTopic}
        onClearAll={() => {
            modalHandlers.showConfirmation({
                title: "Clear All Data?",
                message: "This will permanently delete all your courses and questions. This action cannot be undone.",
                confirmButtonText: "Yes, Clear Everything",
                isDestructive: true,
                onConfirm: () => {
                    syllabusHandlers.handleClearAllData();
                    setStatePath({});
                }
            })
        }}
        onResetToDefault={() => {
            modalHandlers.showConfirmation({
                title: "Reset to Default Data?",
                message: "This will delete all your current data and load the default sample courses. This action cannot be undone.",
                confirmButtonText: "Yes, Reset Data",
                isDestructive: true,
                onConfirm: () => {
                    syllabusHandlers.handleResetToDefault();
                    setStatePath({});
                }
            })
        }}
        onResetApiStats={syllabusHandlers.onResetApiStats}
        showToast={showToast}
      />
      
      <SyllabusImportModal
        isOpen={isModalOpen('fullSyllabusImport')}
        onClose={() => closeModal('fullSyllabusImport')}
        onImport={geminiHandlers.handleStartFullSyllabusImport}
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
              setStatePath({ ...statePath, topicId: newTopic.id, subTopicId: undefined, dotPointId: undefined, promptId: undefined });
            }
          }}
        />
      )}
      
      {modalProps.qualityCheckProps && (
          <QualityCheckModal 
             isOpen={isModalOpen('qualityCheck')}
             onClose={() => closeModal('qualityCheck')}
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
          />
      )}

      {modalProps.renameTarget && (
        <RenameModal
          isOpen={isModalOpen('rename')}
          onClose={modalHandlers.cancelRename}
          onRename={modalHandlers.confirmRename}
          targetType={modalProps.renameTarget.type}
          initialName={modalProps.renameTarget.name}
          existingNames={[]}
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
          title={`Delete ${modalProps.deleteTarget.type}?`}
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
      
      {currentTopic && (
        <TopicSyllabusImportModal
            isOpen={isModalOpen('topicSyllabusImport')}
            onClose={() => closeModal('topicSyllabusImport')}
            courseName={currentCourse?.name || ''}
            topicName={currentTopic.name}
            onImport={(newSubTopics: SubTopic[]) => {
                syllabusHandlers.updateCourses((draft: Draft<Course[]>) => {
                    const course = draft.find(c => c.id === currentCourse?.id);
                    if (!course) return;
                    const topic = course.topics.find(t => t.id === currentTopic?.id);
                    if (topic) {
                        topic.subTopics.push(...newSubTopics);
                    }
                });

                const subTopicCount = newSubTopics.length;
                const dotPointCount = newSubTopics.reduce((acc, st) => acc + (st.dotPoints?.length || 0), 0);
                showToast(`Imported ${subTopicCount} sub-topics and ${dotPointCount} dot points for "${currentTopic.name}".`, 'success');

                if (newSubTopics.length > 0) {
                    setStatePath({ ...statePath, subTopicId: newSubTopics[0].id, dotPointId: undefined, promptId: undefined });
                }
            }}
        />
      )}

       {currentCourse && (
        <TopicGeneratorModal
            isOpen={isModalOpen('topicGenerator')}
            onClose={() => closeModal('topicGenerator')}
            courseName={currentCourse.name}
            existingTopics={currentCourse.topics.map(t => t.name)}
            onTopicGenerated={(name) => {
                const newTopic = syllabusHandlers.handleCreateTopic(currentCourse.id, name);
                if (newTopic) {
                  setStatePath({ ...statePath, topicId: newTopic.id, subTopicId: undefined, dotPointId: undefined, promptId: undefined });
                }
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