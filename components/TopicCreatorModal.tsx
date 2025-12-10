import React from 'react';
import SyllabusItemCreatorModal from './SyllabusItemCreatorModal';

interface TopicCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemCreated: (newItemName: string) => void;
  existingNames: string[];
}

const TopicCreatorModal: React.FC<TopicCreatorModalProps> = (props) => {
  return (
    <SyllabusItemCreatorModal
      {...props}
      itemType="Topic"
      placeholder="e.g., Module 4: Ecosystem Dynamics"
    />
  );
};

export default TopicCreatorModal;
