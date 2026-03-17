
import { useState, useCallback } from 'react';

export type ModalName = 
  | 'courseCreator' 
  | 'topicCreator' 
  | 'subTopicCreator' 
  | 'promptGenerator' 
  | 'outcomesEditor' 
  | 'dataManager' 
  | 'commandTermGuide' 
  | 'topicSyllabusImport' 
  | 'topicGenerator' 
  | 'dotPointGenerator' 
  | 'fullSyllabusImport'
  | 'sampleAnswerGenerator'
  | 'topicImport'
  | 'rename'
  | 'deleteConfirmation'
  | 'confirmation'
  | 'qualityCheck'
  | 'userProfile'
  | 'databaseDashboard'
  | 'manifestImport'
  | 'manualPrompt';

export type RenameTarget = { type: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt'; id: string; name: string };
export type DeleteTarget = { type: 'course' | 'topic' | 'subTopic' | 'dotPoint' | 'prompt'; id: string; name: string };
export type ConfirmationProps = { title: string; message: string; confirmButtonText: string; isDestructive?: boolean; onConfirm: () => void };
export type QualityCheckProps = { content: string; type: 'question' | 'code'; onUpdate: (newContent: string) => void; };

interface ModalManagerOptions {
  onRename: (target: RenameTarget, newName: string) => void;
  onDelete: (target: DeleteTarget) => void;
}

export const useModalManager = ({ onRename, onDelete }: ModalManagerOptions) => {
  const [activeModals, setActiveModals] = useState<Set<ModalName>>(new Set());
  const [renameTarget, setRenameTarget] = useState<RenameTarget | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [confirmationProps, setConfirmationProps] = useState<ConfirmationProps | null>(null);
  const [qualityCheckProps, setQualityCheckProps] = useState<QualityCheckProps | null>(null);

  const openModal = useCallback((name: ModalName) => {
    setActiveModals(prev => new Set(prev).add(name));
  }, []);

  const closeModal = useCallback((name: ModalName) => {
    setActiveModals(prev => {
      const newSet = new Set(prev);
      newSet.delete(name);
      return newSet;
    });
  }, []);
  
  const isModalOpen = useCallback((name: ModalName) => activeModals.has(name), [activeModals]);

  const requestRename = useCallback((type: RenameTarget['type'], id: string, name: string) => {
    setRenameTarget({ type, id, name });
    openModal('rename');
  }, [openModal]);

  const confirmRename = useCallback((newName: string) => {
    if (renameTarget) {
      onRename(renameTarget, newName);
    }
    setRenameTarget(null);
    closeModal('rename');
  }, [renameTarget, onRename, closeModal]);

  const requestDelete = useCallback((target: DeleteTarget) => {
    setDeleteTarget(target);
    openModal('deleteConfirmation');
  }, [openModal]);

  const confirmDelete = useCallback(() => {
    if (deleteTarget) {
      onDelete(deleteTarget);
    }
    setDeleteTarget(null);
    closeModal('deleteConfirmation');
  }, [deleteTarget, onDelete, closeModal]);

  const showConfirmation = useCallback((props: Omit<ConfirmationProps, 'onConfirm'> & { onConfirm: () => void }) => {
    setConfirmationProps(props);
    openModal('confirmation');
  }, [openModal]);

  const showQualityCheck = useCallback((props: QualityCheckProps) => {
      setQualityCheckProps(props);
      openModal('qualityCheck');
  }, [openModal]);

  const handleConfirmAction = () => {
    if (confirmationProps) {
      confirmationProps.onConfirm();
    }
    setConfirmationProps(null);
    closeModal('confirmation');
  };

  const cancelConfirmation = () => {
    setConfirmationProps(null);
    closeModal('confirmation');
  };

  return {
    activeModals,
    modalProps: {
      renameTarget,
      deleteTarget,
      confirmationProps,
      qualityCheckProps
    },
    openModal,
    closeModal,
    isModalOpen,
    requestRename,
    confirmRename,
    cancelRename: () => { setRenameTarget(null); closeModal('rename'); },
    requestDelete,
    confirmDelete,
    cancelDelete: () => { setDeleteTarget(null); closeModal('deleteConfirmation'); },
    showConfirmation,
    handleConfirmAction,
    cancelConfirmation,
    showQualityCheck
  };
};