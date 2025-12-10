import React, { useState, useEffect } from 'react';
import { BookOpen, Folder, X } from 'lucide-react';

interface SyllabusItemCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemCreated: (newItemName: string) => void;
  itemType: 'Topic' | 'Sub-Topic';
  placeholder: string;
  existingNames: string[];
}

const SyllabusItemCreatorModal: React.FC<SyllabusItemCreatorModalProps> = ({
  isOpen,
  onClose,
  onItemCreated,
  itemType,
  placeholder,
  existingNames,
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNewItemName('');
      setValidationError(null);
    }
  }, [isOpen]);

  // Real-time validation for duplicate names
  useEffect(() => {
    if (existingNames.some(name => name.toLowerCase() === newItemName.trim().toLowerCase())) {
        setValidationError(`A ${itemType.toLowerCase()} with this name already exists.`);
    } else {
        setValidationError(null);
    }
  }, [newItemName, existingNames, itemType]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItemName.trim() && !validationError) {
      onItemCreated(newItemName.trim());
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }
  
  const isButtonDisabled = !newItemName.trim() || !!validationError;
  const icon = itemType === 'Topic' ? <BookOpen className="w-5 h-5 text-white" /> : <Folder className="w-5 h-5 text-white" />;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-md border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden" 
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                {icon}
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">Add New {itemType}</h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">Manually create a new syllabus item.</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 flex items-center justify-center group">
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))]" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6">
            <label htmlFor="item-name" className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] mb-2">
              {itemType} Name
            </label>
            <input
              type="text"
              id="item-name"
              value={newItemName}
              onChange={(e) => setNewItemName(e.target.value)}
              className={`block w-full bg-[rgb(var(--color-bg-surface-light))] border rounded-lg shadow-sm py-3 px-4 focus:outline-none transition ${validationError ? 'border-red-500 ring-1 ring-red-500' : 'border-[rgb(var(--color-border-secondary))] focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]'}`}
              placeholder={placeholder}
              autoFocus
            />
            {validationError && <p className="text-red-400 text-xs mt-2">{validationError}</p>}
          </div>

          <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-[rgb(var(--color-border-secondary))] flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition">
              Cancel
            </button>
            <button type="submit" disabled={isButtonDisabled} className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50">
              Add {itemType}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SyllabusItemCreatorModal;