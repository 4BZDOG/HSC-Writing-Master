import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, SampleAnswer } from '../types';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { X, Save, AlertCircle, Award } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

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
  const [band, setBand] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  useEffect(() => {
    if (isOpen && sampleToEdit) {
      setAnswerText(sampleToEdit.answer);
      setMark(sampleToEdit.mark);
      setBand(sampleToEdit.band);
      setError(null);
    }
  }, [isOpen, sampleToEdit]);

  const handleMarkChange = (val: number) => {
    setMark(val);
    // Auto-calculate suggested band based on mark, but user can override
    const suggestedBand = getBandForMark(val, prompt.totalMarks, commandTermInfo.tier);
    setBand(suggestedBand);
  };

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
      band: band,
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
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-accent))] to-[rgb(var(--color-primary))] flex items-center justify-center shadow-lg">
                <Save className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">
                  Edit Sample Answer
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">
                  Manually adjust the answer details and performance level.
                </p>
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
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8">
          <div>
            <label
              htmlFor="answer-text"
              className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-2"
            >
              Answer Text
            </label>
            <textarea
              id="answer-text"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              rows={10}
              className="w-full bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] transition font-serif leading-relaxed text-slate-200"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label
                htmlFor="mark-input"
                className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-3"
              >
                Mark ({`out of ${prompt.totalMarks}`})
              </label>
              <div className="flex items-center gap-4">
                <input
                  id="mark-input"
                  type="number"
                  value={mark}
                  onChange={(e) => handleMarkChange(parseInt(e.target.value, 10) || 0)}
                  min="0"
                  max={prompt.totalMarks}
                  className="w-24 bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-xl py-3 px-4 text-center text-lg font-black text-white focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] transition"
                />
                <div className="h-1.5 flex-1 bg-white/5 rounded-full overflow-hidden border border-white/5">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-500"
                    style={{ width: `${(mark / prompt.totalMarks) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">
                Performance Band
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((b) => {
                  const isSelected = band === b;
                  const bConfig = getBandConfig(b);
                  return (
                    <button
                      key={b}
                      onClick={() => setBand(b)}
                      type="button"
                      className={`
                                    w-9 h-10 rounded-lg text-sm font-black transition-all duration-200
                                    ${
                                      isSelected
                                        ? `${bConfig.solidBg} text-white shadow-lg scale-110 z-10 border border-white/20`
                                        : 'bg-white/5 text-slate-500 hover:bg-white/10 hover:text-slate-300'
                                    }
                                `}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                <Award className="w-3 h-3" /> Manually Overridable
              </p>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl border border-red-500/50 bg-red-500/10 flex items-start gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-red-300">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-5 border-t border-[rgb(var(--color-border-secondary))] bg-[rgb(var(--color-bg-surface-inset))]/30 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="py-2.5 px-6 rounded-xl font-bold text-[10px] uppercase tracking-widest text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-inset))]/50 hover:bg-[rgb(var(--color-border-secondary))] transition-all duration-200"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="py-2.5 px-8 rounded-xl font-bold text-white bg-gradient-to-r from-indigo-600 to-sky-600 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-[0.98] transition-all duration-200 flex items-center gap-2 text-[10px] uppercase tracking-widest"
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
