import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, SampleAnswer } from '../types';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { X, Save, AlertCircle, Award } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';

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
  // Escape closes this modal like every other modal surface.
  useEscapeKey(isOpen, onClose);
  useScrollLock(isOpen);
  const [answerText, setAnswerText] = useState('');
  const [mark, setMark] = useState(0);
  const [band, setBand] = useState(1);
  const [error, setError] = useState<string | null>(null);

  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  // The verb's cognitive tier caps the achievable band (same rule the
  // generator and the audit studio's recalibration enforce): full marks on a
  // Tier-2 'Describe' question is still not a Band 6 response.
  const tierMaxBand = useMemo(
    () => getBandForMark(prompt.totalMarks, prompt.totalMarks, commandTermInfo.tier),
    [prompt.totalMarks, commandTermInfo.tier]
  );

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
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen || !sampleToEdit) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Edit sample answer"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={onClose}
    >
      <div
        className="
          bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl
          w-full max-w-3xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200
          clip-stable animate-fade-in-up overflow-hidden
          flex flex-col max-h-[90vh]
        "
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-accent))] to-[rgb(var(--color-primary))] flex items-center justify-center shadow-lg">
                <Save className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Edit Sample Answer
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  Manually adjust the answer details and performance level.
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-6 space-y-8 bg-[rgb(var(--color-bg-surface))] light:bg-white">
          <div>
            <label
              htmlFor="answer-text"
              className="block text-sm font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-2"
            >
              Answer Text
            </label>
            <textarea
              id="answer-text"
              value={answerText}
              onChange={(e) => setAnswerText(e.target.value)}
              rows={10}
              className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-xl p-4 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] transition font-serif leading-relaxed text-[rgb(var(--color-text-primary))] light:text-slate-900"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <label
                htmlFor="mark-input"
                className="block text-sm font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-3"
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
                  className="w-24 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-xl py-3 px-4 text-center text-lg font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] transition"
                />
                <div className="h-1.5 flex-1 bg-white/5 light:bg-slate-200 rounded-full overflow-hidden border border-white/5 light:border-slate-300">
                  <div
                    className="h-full bg-indigo-500 light:bg-indigo-500 transition-all duration-500"
                    style={{ width: `${(mark / prompt.totalMarks) * 100}%` }}
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500 uppercase tracking-wider mb-3">
                Performance Band
              </label>
              <div className="flex items-center gap-1.5">
                {[1, 2, 3, 4, 5, 6].map((b) => {
                  const isSelected = band === b;
                  const isCappedOut = b > tierMaxBand;
                  const bConfig = getBandConfig(b);
                  return (
                    <button
                      key={b}
                      onClick={() => !isCappedOut && setBand(b)}
                      disabled={isCappedOut && !isSelected}
                      type="button"
                      title={
                        isCappedOut
                          ? `'${prompt.verb}' caps this question at Band ${tierMaxBand}`
                          : `Band ${b}`
                      }
                      className={`
                                    w-9 h-10 rounded-lg text-sm font-black transition-all duration-200
                                    ${
                                      isSelected
                                        ? `${bConfig.solidBg} ${bConfig.solidText} shadow-lg scale-110 z-10 border border-white/20 light:border-white/40 ${isCappedOut ? 'ring-2 ring-amber-500/60' : ''}`
                                        : isCappedOut
                                          ? 'bg-white/[0.02] light:bg-slate-100 text-slate-700 light:text-slate-300 cursor-not-allowed line-through'
                                          : 'bg-white/5 light:bg-slate-100 text-slate-500 light:text-slate-500 hover:bg-white/10 light:hover:bg-slate-200 hover:text-slate-300 light:hover:text-slate-600'
                                    }
                                `}
                    >
                      {b}
                    </button>
                  );
                })}
              </div>
              {band > tierMaxBand ? (
                <p className="mt-2 text-[10px] font-bold text-amber-400 light:text-amber-600 uppercase tracking-widest flex items-center gap-1.5">
                  <AlertCircle className="w-3 h-3" /> Above the Band {tierMaxBand} cap for '
                  {prompt.verb}' — recalibration will lower it
                </p>
              ) : (
                <p className="mt-2 text-[10px] font-bold text-slate-500 light:text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Award className="w-3 h-3" /> Manually overridable up to Band {tierMaxBand} (
                  {`'${prompt.verb}'`} verb cap)
                </p>
              )}
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl border border-red-500/50 light:border-red-200 bg-red-500/10 light:bg-red-50 flex items-start gap-3 animate-fade-in">
              <AlertCircle className="w-5 h-5 text-red-400 light:text-red-500 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-bold text-red-300 light:text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 flex items-center justify-end gap-3 flex-shrink-0">
          <button
            onClick={onClose}
            className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition flex items-center gap-2"
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
