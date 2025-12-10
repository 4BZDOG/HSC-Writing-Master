import React, { useState, useEffect, useCallback } from 'react';
import { generateNewTopic } from '../services/geminiService';
import LoadingIndicator from './LoadingIndicator';
import { X, Lightbulb, RefreshCw } from 'lucide-react';

interface TopicGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onTopicGenerated: (newTopicName: string) => void;
  courseName: string;
  existingTopics: string[];
}

const TopicGeneratorModal: React.FC<TopicGeneratorModalProps> = ({
  isOpen,
  onClose,
  onTopicGenerated,
  courseName,
  existingTopics,
}) => {
  const [suggestedTopic, setSuggestedTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGenerate = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const topic = await generateNewTopic(courseName, existingTopics);
      setSuggestedTopic(topic);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, [courseName, existingTopics]);

  useEffect(() => {
    if (isOpen) {
      handleGenerate();
    } else {
      // Reset state when closed
      setSuggestedTopic('');
      setIsLoading(false);
      setError(null);
    }
  }, [isOpen, handleGenerate]);
  
  const handleAccept = () => {
    if (suggestedTopic) {
        onTopicGenerated(suggestedTopic);
        onClose();
    }
  };
  
  const handleClose = () => {
    if (isLoading) return;
    onClose();
  }

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={handleClose}>
      <div 
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-lg border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden relative flex flex-col" 
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-amber))] to-[rgb(var(--color-yellow))] flex items-center justify-center shadow-lg">
                <Lightbulb className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">Suggest a Topic</h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">Let AI find a new topic for "{courseName}".</p>
              </div>
            </div>
            <button onClick={handleClose} className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 flex items-center justify-center group">
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))]" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="p-6 space-y-4">
          {!isLoading && suggestedTopic && (
            <div className="bg-[rgb(var(--color-bg-surface-inset))]/50 p-4 rounded-lg border border-[rgb(var(--color-border-secondary))]">
              <p className="text-gray-400 text-sm">Suggested Topic:</p>
              <p className="text-xl font-semibold text-amber-300">{suggestedTopic}</p>
            </div>
          )}
          {error && !isLoading && (
            <div className="text-red-400 bg-red-900/30 p-3 rounded-md text-sm">{error}</div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex items-center justify-end">
          <div className="flex items-center gap-3">
            <button onClick={handleClose} className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200">
              Cancel
            </button>
            <button onClick={handleGenerate} disabled={isLoading} className="py-2.5 px-5 rounded-lg font-semibold text-white bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 disabled:opacity-50 flex items-center gap-2">
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </button>
            <button onClick={handleAccept} disabled={isLoading || !suggestedTopic || !!error} className="py-2.5 px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-amber-500 to-yellow-500 hover:shadow-lg hover:shadow-amber-500/30 active:scale-[0.98] transition-all duration-200 disabled:opacity-50">
              Accept and Add
            </button>
          </div>
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/95 backdrop-blur-sm flex items-center justify-center">
            <div className="w-full max-w-md mx-6">
              <LoadingIndicator messages={['Analysing syllabus...', 'Finding an uncovered topic...']} duration={8} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicGeneratorModal;