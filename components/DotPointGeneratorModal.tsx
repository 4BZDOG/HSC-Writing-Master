import React, { useState, useEffect } from 'react';
import { generateDotPointsForSubTopic } from '../services/geminiService';
import LoadingIndicator from './LoadingIndicator';
import { X, Sparkles } from 'lucide-react';

interface DotPointGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDotPointsGenerated: (dotPoints: string[]) => void;
  courseName: string;
  topicName: string;
  subTopicName: string;
}

const DotPointGeneratorModal: React.FC<DotPointGeneratorModalProps> = ({
  isOpen,
  onClose,
  onDotPointsGenerated,
  courseName,
  topicName,
  subTopicName,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen]);

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const dotPoints = await generateDotPointsForSubTopic(courseName, topicName, subTopicName);
      onDotPointsGenerated(dotPoints);
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'An unknown error occurred.';
      setError(message);
    } finally {
      setIsLoading(false);
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
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 animate-fade-in-up overflow-hidden relative"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50">
          {/* Cubic Mesh Texture Overlay */}
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />

          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-accent))] to-[rgb(var(--color-primary))] flex items-center justify-center shadow-lg">
                <Sparkles className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Generate Syllabus Dot Points
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  For sub-topic:{' '}
                  <span className="font-semibold text-[rgb(var(--color-accent))]">
                    {subTopicName}
                  </span>
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

        <div className="p-8 text-center bg-[rgb(var(--color-bg-surface))] light:bg-white">
          <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600">
            Let AI generate the official syllabus dot points for this sub-topic.
          </p>
          {error && !isLoading && (
            <p className="text-red-400 light:text-red-600 mt-4 text-sm bg-red-900/30 light:bg-red-50 p-3 rounded-md border border-red-500/20 light:border-red-200">
              {error}
            </p>
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
              className="py-2.5 px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg hover:shadow-[rgb(var(--color-accent))/0.4] active:scale-[0.98] transition-all duration-200 flex items-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Generate
            </button>
          </div>
        </div>

        {isLoading && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/95 light:bg-white/95 backdrop-blur-sm flex items-center justify-center">
            <div className="w-full max-w-md mx-6">
              <LoadingIndicator
                messages={['Consulting syllabus...', 'Identifying dot points...']}
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

export default DotPointGeneratorModal;
