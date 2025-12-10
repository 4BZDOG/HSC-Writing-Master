import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, SampleAnswer } from '../types';
import { getBandForMark } from '../data/commandTerms';
import { X, Save, AlertCircle } from 'lucide-react';

interface SampleAnswerEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: Prompt;
  sampleToEdit: SampleAnswer;
  onSave: (updatedAnswer: SampleAnswer) => void;
}

const SampleAnswerEditorModal: React.FC<SampleAnswerEditorModalProps> = ({
  isOpen,
  onClose,
  prompt,
  sampleToEdit,
  onSave,
}) => {
  const [answerText, setAnswerText] = useState('');
  const [mark, setMark] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && sampleToEdit) {
      setAnswerText(sampleToEdit.answer);
      setMark(sampleToEdit.mark);
      setError(null);
    }
  }, [isOpen, sampleToEdit]);

  const handleSave = () => {
    if (mark < 0 || mark > prompt.totalMarks) {
      setError(`Mark must be between 0 and ${prompt.totalMarks}.`);
      return;
    }
    setError(null);
    const updatedAnswer: SampleAnswer = {
      ...sampleToEdit,
      answer: answerText,
      mark: mark,
      band: getBandForMark(mark, prompt.totalMarks),
    };
    onSave(updatedAnswer);
    onClose();
  };

  if (!isOpen || !sampleToEdit) return null;

  return createPortal(
    <div 
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4" 
      onClick={onClose}
    >
      <div 
        className="
          bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl 
          w-full max-w-3xl border border-[rgb(var(--color-border-secondary))]
          animate-fade-in-up overflow-hidden
          flex flex-col max-h-[90vh]
        " 
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-accent))] to-[rgb(var(--color-primary))] flex items-center justify-center shadow-lg">
                <Save className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">Edit Sample Answer</h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">Manually adjust the answer details.</p>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] group-hover:text-[rgb(var(--color-text-primary))]" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6">
          <div>
            <label htmlFor="answer-text" className="block text-sm font-medium text-gray-300 mb-2">Answer Text</label>
            <textarea
              id="answer-text"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              rows={10}
              className="w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] transition"
            />
          </div>
          <div>
            <label htmlFor="mark-input" className="block text-sm font-medium text-gray-300 mb-2">
              Mark ({`out of ${prompt.totalMarks}`})
            </label>
            <input
              id="mark-input"
              type="number"
              value={mark}
              onChange={(e) => setMark(parseInt(e.target.value, 10) || 0)}
              min="0"
              max={prompt.totalMarks}
              className="w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-lg p-3 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] transition"
            />
          </div>
          {error && (
            <div className="p-3 rounded-lg border border-red-500/50 bg-red-500/10 flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex items-center justify-end gap-3">
          <button 
            onClick={onClose} 
            className="py-2.5 px-5 rounded-lg font-medium text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave} 
            className="py-2.5 px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg hover:shadow-[rgb(var(--color-accent))/0.4] active:scale-[0.98] transition-all duration-200 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Changes
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default SampleAnswerEditorModal;