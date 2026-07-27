import React, { useState, useEffect } from 'react';
import { Folder, Sparkles, X } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

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
  useEscapeKey(isOpen, onClose);
  useScrollLock(isOpen);
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
    if (existingNames.some((name) => name.toLowerCase() === newItemName.trim().toLowerCase())) {
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
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-md border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50">
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <Folder className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Add New Sub-Topic
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  Create a new syllabus sub-topic.
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-[rgb(var(--color-bg-surface))] light:bg-white">
          <div className="p-6 space-y-5">
            {/* Name Input */}
            <div>
              <label
                htmlFor="subtopic-name"
                className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2"
              >
                Sub-Topic Name
              </label>
              <input
                type="text"
                id="subtopic-name"
                value={newItemName}
                onChange={(e) => setNewItemName(e.target.value)}
                className={`block w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border rounded-xl shadow-sm py-3 px-4 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none transition ${validationError ? 'border-red-500 ring-1 ring-red-500' : 'border-[rgb(var(--color-border-secondary))] light:border-slate-300 focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]'}`}
                placeholder="e.g., Inquiry Question 1"
                autoFocus
              />
              {validationError && (
                <p className="text-red-400 light:text-red-600 text-xs mt-2">{validationError}</p>
              )}
            </div>

            {/* AI Generation Option */}
            <div
              className={`rounded-xl border transition-colors cursor-pointer ${
                shouldGenerate
                  ? 'border-[rgb(var(--color-accent))]/30 bg-[rgb(var(--color-accent))]/5 light:border-indigo-200 light:bg-indigo-50/50'
                  : 'border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50'
              }`}
              onClick={() => setShouldGenerate(!shouldGenerate)}
            >
              <label className="flex items-start gap-3 p-4 cursor-pointer">
                <input
                  type="checkbox"
                  checked={shouldGenerate}
                  onChange={(e) => setShouldGenerate(e.target.checked)}
                  className="h-4 w-4 mt-0.5 rounded bg-gray-700 light:bg-white border-gray-600 light:border-slate-300 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]/50 flex-shrink-0"
                />
                <div className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 font-semibold text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800">
                    <Sparkles className="w-4 h-4 text-[rgb(var(--color-accent))] flex-shrink-0" />
                    Generate dot points with AI
                  </span>
                  <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-1">
                    AI will suggest syllabus dot points for this sub-topic based on the course and
                    topic context.
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isButtonDisabled}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add Sub-Topic
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default SubTopicCreatorModal;
