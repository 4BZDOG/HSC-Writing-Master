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
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-[rgb(var(--color-border-secondary))] light:border-slate-200 animate-fade-in-up overflow-hidden relative flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-hidden bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50">
          {/* Cubic Mesh Texture Overlay */}
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-amber))] to-[rgb(var(--color-yellow))] flex items-center justify-center shadow-lg">
                <Lightbulb className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Suggest a Topic
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  Let AI find a new topic for "{courseName}".
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-4 bg-[rgb(var(--color-bg-surface))] light:bg-white">
          {!isLoading && suggestedTopic && (
            <div className="bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-amber-50 p-6 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-amber-100 flex flex-col items-center text-center gap-2">
              <p className="text-gray-400 light:text-amber-800/60 text-xs font-bold uppercase tracking-widest">
                AI Suggestion
              </p>
              <p className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-amber-900 leading-tight">
                {suggestedTopic}
              </p>
            </div>
          )}
          {error && !isLoading && (
            <div className="text-red-400 light:text-red-600 bg-red-900/30 light:bg-red-50 border border-red-500/20 light:border-red-200 p-3 rounded-md text-sm">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-5 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 flex items-center justify-end">
          <div className="flex items-center gap-3">
            <button
              onClick={handleClose}
              className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-white hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 border border-transparent light:border-slate-200 transition-all duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleGenerate}
              disabled={isLoading}
              className="py-2.5 px-5 rounded-lg font-semibold text-white bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] light:bg-slate-400 light:hover:bg-slate-500 transition-all duration-200 disabled:opacity-50 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate
            </button>
            <button
              onClick={handleAccept}
              disabled={isLoading || !suggestedTopic || !!error}
              className="py-2.5 px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-amber-500 to-yellow-500 hover:shadow-lg hover:shadow-amber-500/30 active:scale-[0.98] transition-all duration-200 disabled:opacity-50"
            >
              Accept and Add
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/95 light:bg-white/95 backdrop-blur-sm flex items-center justify-center">
            <div className="w-full max-w-md mx-6">
              <LoadingIndicator
                messages={['Analysing syllabus...', 'Finding an uncovered topic...']}
                duration={8}
                band={3}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TopicGeneratorModal;
