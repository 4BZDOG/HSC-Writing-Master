import React, { useState, useEffect } from 'react';
import { Folder, Sparkles, X } from 'lucide-react';

interface SubTopicCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onItemCreated: (newItemName: string, options: { generateDotPoints: boolean }) => void;
  existingNames: string[];
}

const SubTopicCreatorModal: React.FC<SubTopicCreatorModalProps> = ({
  isOpen,
  onClose,
  onItemCreated,
  existingNames,
}) => {
  const [newItemName, setNewItemName] = useState('');
  const [shouldGenerate, setShouldGenerate] = useState(true);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setNewItemName('');
      setValidationError(null);
      setShouldGenerate(true);
    }
  }, [isOpen]);

  useEffect(() => {
    if (existingNames.some(name => name.toLowerCase() === newItemName.trim().toLowerCase())) {
        setValidationError(`A sub-topic with this name already exists.`);
    } else {
        setValidationError(null);
    }
  }, [newItemName, existingNames]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newItemName.trim() && !validationError) {
      onItemCreated(newItemName.trim(), { generateDotPoints: shouldGenerate });
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }
  
  const isButtonDisabled = !newItemName.trim() || !!validationError;

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
                <Folder className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">Add New Sub-Topic</h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">Manually create a new syllabus item.</p>
              </div>
            </div>
            <button onClick={onClose} className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 flex items-center justify-center group">
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))]" />
            </button>
          </div>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-4">
            <div>
              <label htmlFor="item-name" className="block text-sm font-medium text-[rgb(var(--color-text-secondary))] mb-2">
                Sub-Topic Name
              </label>
              <input
                type="text"
                id="item-name"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className={`block w-full bg-[rgb(var(--color-bg-surface-light))] border rounded-lg shadow-sm py-3 px-4 focus:outline-none transition ${validationError ? 'border-red-500 ring-1 ring-red-500' : 'border-[rgb(var(--color-border-secondary))] focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]'}`}
                placeholder="e.g., Inquiry Question 1"
                autoFocus
              />
              {validationError && <p className="text-red-400 text-xs mt-2">{validationError}</p>}
            </div>

            <div className="pt-2">
              <label className="flex items-center space-x-3 text-sm text-gray-300 cursor-pointer p-3 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-bg-surface-light))] transition-colors">
                  <input 
                    type="checkbox" 
                    checked={shouldGenerate} 
                    onChange={e => setShouldGenerate(e.target.checked)} 
                    className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]/50" 
                  />
                  <span className="flex items-center gap-2 font-medium">
                    <Sparkles className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                    Generate dot points with AI
                  </span>
              </label>
            </div>
          </div>

          <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-[rgb(var(--color-border-secondary))] flex justify-end space-x-3">
            <button type="button" onClick={onClose} className="py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition">
              Cancel
            </button>
            <button type="submit" disabled={isButtonDisabled} className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50">
              Add Sub-Topic
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubTopicCreatorModal;