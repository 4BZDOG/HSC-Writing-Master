import React, { useState } from 'react';
import { SubTopic } from '../types';
import { generateSubTopicsAndDotPoints } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import { X, Sparkles } from 'lucide-react';

interface TopicSyllabusImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseName: string;
  topicName: string;
  onImport: (newSubTopics: SubTopic[]) => void;
}

const TopicSyllabusImportModal: React.FC<TopicSyllabusImportModalProps> = ({
  isOpen,
  onClose,
  courseName,
  topicName,
  onImport,
}) => {
  const [syllabusText, setSyllabusText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleImport = async () => {
    if (!syllabusText.trim()) {
      setError('Please paste the syllabus content.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const newSubTopics = await generateSubTopicsAndDotPoints(courseName, topicName, syllabusText);
      onImport(newSubTopics);
      handleClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    setSyllabusText('');
    setIsLoading(false);
    setError(null);
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-3xl border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden relative flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-accent))] to-[rgb(var(--color-primary))] flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">
                  Import Sub-Topics for "{topicName}"
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">
                  Let AI extract sub-topics and dot points from text.
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 flex flex-col overflow-y-auto">
          <label htmlFor="topic-syllabus-text" className="sr-only">
            Syllabus Content
          </label>
          <textarea
            id="topic-syllabus-text"
            value={syllabusText}
            onChange={(e) => setSyllabusText(e.target.value)}
            placeholder={`Paste the syllabus content for ${topicName} here...`}
            className="w-full flex-1 bg-[rgb(var(--color-bg-surface-inset))]/50 border border-[rgb(var(--color-border-secondary))] rounded-md p-3 text-sm focus:ring-teal-500 focus:border-teal-500 resize-none"
            autoFocus
          />
          {error && (
            <p className="text-red-400 mt-4 text-sm bg-red-900/30 p-3 rounded-md">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex items-center justify-end">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleImport}
              disabled={isLoading || !syllabusText.trim()}
              className="py-2.5 px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg hover:shadow-[rgb(var(--color-accent))/0.4] active:scale-[0.98] transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Import
            </button>
          </div>
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/95 backdrop-blur-sm flex items-center justify-center">
            <div className="w-full max-w-md mx-6">
              <LoadingSpinner message="Analysing syllabus text..." />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicSyllabusImportModal;
