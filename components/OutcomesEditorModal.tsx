import React, { useState, useEffect } from 'react';
import { CourseOutcome } from '../types';
import { parseOutcomesFromText } from '../services/geminiService';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import { Target, X, Sparkles, Plus, Trash2 } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

interface OutcomesEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (newOutcomes: CourseOutcome[]) => void;
  initialOutcomes: CourseOutcome[];
  courseName: string;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

const OutcomesEditorModal: React.FC<OutcomesEditorModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialOutcomes,
  courseName,
  showToast,
}) => {
  const [outcomes, setOutcomes] = useState<CourseOutcome[]>([]);
  const [pastedText, setPastedText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setOutcomes(
        initialOutcomes.length > 0
          ? [...initialOutcomes].sort((a, b) => a.code.localeCompare(b.code))
          : [{ code: '', description: '' }]
      );
      setPastedText('');
      setError(null);
    }
  }, [isOpen, initialOutcomes]);

  const handleAddOutcome = () => {
    setOutcomes([...outcomes, { code: '', description: '' }]);
  };

  const handleDeleteOutcome = (index: number) => {
    setOutcomes(outcomes.filter((_, i) => i !== index));
  };

  const handleOutcomeChange = (index: number, field: keyof CourseOutcome, value: string) => {
    const newOutcomes = [...outcomes];
    newOutcomes[index][field] = value;
    setOutcomes(newOutcomes);
  };

  const handleParseText = async () => {
    if (!pastedText.trim()) return;
    // The parser is a plan-gated AI Content Studio call, so the lock has to be
    // checked HERE too. Without it the proxy's 402 arrives as a raw inline
    // error on a deployment that prices the studio above this caller's plan —
    // a dead end instead of the upgrade prompt every other studio control
    // opens.
    if (isFeatureLocked('aiContentStudio')) {
      requestUpgrade('aiContentStudio');
      return;
    }
    setIsParsing(true);
    setError(null);
    try {
      const parsed = await parseOutcomesFromText(pastedText);
      const manualOutcomes = outcomes.filter((o) => o.code.trim() && o.description.trim());
      const newOutcomeCodes = new Set(manualOutcomes.map((o) => o.code.toLowerCase()));
      const filteredParsed = parsed.filter((p) => !newOutcomeCodes.has(p.code.toLowerCase()));
      setOutcomes(
        [...manualOutcomes, ...filteredParsed].sort((a, b) => a.code.localeCompare(b.code))
      );
      setPastedText('');
      showToast(
        `Successfully parsed and added ${filteredParsed.length} new outcome(s).`,
        'success'
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse outcomes.';
      setError(message);
    } finally {
      setIsParsing(false);
    }
  };

  const handleSave = () => {
    const validOutcomes = outcomes.filter((o) => o.code.trim() && o.description.trim());
    onSave(validOutcomes);
    onClose();
  };

  const handleClose = () => {
    if (isParsing) return;
    onClose();
  };

  useEscapeKey(isOpen && !isParsing, handleClose);
  useScrollLock(isOpen);

  if (!isOpen) {
    return null;
  }

  const validCount = outcomes.filter((o) => o.code.trim() && o.description.trim()).length;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={handleClose}
    >
      <div
        className="relative bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-5xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
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
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Edit Outcomes
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  {courseName}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        {/* Content — stacks vertically on mobile, side-by-side on desktop */}
        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          {/* AI Parser Panel */}
          <div className="md:w-80 lg:w-96 flex-shrink-0 border-b md:border-b-0 md:border-r border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex flex-col bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50">
            <div className="p-5 flex flex-col h-full">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                <h3 className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                  Parse from Text
                </h3>
              </div>
              <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-3">
                Paste syllabus outcomes text and AI will extract the codes and descriptions
                automatically.
              </p>
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder={`e.g.\nSE-12-01 Describes methods used to plan, develop...\nSE-12-02 Applies appropriate development...`}
                className="flex-grow bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-3 px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] resize-none min-h-[100px] md:min-h-0 leading-relaxed text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder:text-[rgb(var(--color-text-muted))]/60"
              />
              <button
                onClick={handleParseText}
                disabled={isParsing || !pastedText.trim()}
                className="mt-3 w-full py-2.5 px-4 rounded-lg text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 hover:shadow-lg active:scale-[0.98] transition-all"
              >
                <Sparkles className="w-4 h-4" />
                {isParsing ? 'Parsing...' : 'Parse with AI'}
              </button>
              {error && (
                <p className="text-red-400 light:text-red-600 mt-3 text-xs bg-red-900/20 light:bg-red-50 p-2.5 rounded-md border border-red-500/20 light:border-red-200">
                  {error}
                </p>
              )}
            </div>
          </div>

          {/* Manual Outcomes Editor */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            <div className="px-5 pt-5 pb-3 flex items-center justify-between flex-shrink-0 border-b border-[rgb(var(--color-border-secondary))]/50 light:border-slate-100">
              <div className="flex items-center gap-2.5">
                <h3 className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                  Outcomes
                </h3>
                <span className="text-xs font-medium text-[rgb(var(--color-text-muted))] light:text-slate-500 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 px-2.5 py-0.5 rounded-full">
                  {validCount} valid
                </span>
              </div>
              <button
                type="button"
                onClick={handleAddOutcome}
                className="py-1.5 px-3.5 rounded-lg text-xs font-semibold text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10 hover:bg-[rgb(var(--color-accent))]/20 transition flex items-center gap-1.5 border border-[rgb(var(--color-accent))]/20"
              >
                <Plus className="w-3.5 h-3.5" /> Add Row
              </button>
            </div>

            <div className="flex-grow overflow-y-auto px-5 py-4">
              {outcomes.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <Target className="w-8 h-8 text-[rgb(var(--color-text-muted))]/40 light:text-slate-300 mb-3" />
                  <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    No outcomes yet. Add them manually or paste text to parse with AI.
                  </p>
                  <button
                    type="button"
                    onClick={handleAddOutcome}
                    className="mt-4 py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10 hover:bg-[rgb(var(--color-accent))]/20 transition border border-dashed border-[rgb(var(--color-accent))]/30"
                  >
                    <Plus className="inline w-4 h-4 mr-1" /> Add Outcome
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {outcomes.map((outcome, index) => (
                    <div
                      key={index}
                      className="group flex items-start gap-2.5 p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50/80 border border-[rgb(var(--color-border-secondary))]/60 light:border-slate-200 hover:border-[rgb(var(--color-border-secondary))] light:hover:border-slate-300 transition-colors"
                    >
                      <span className="hidden sm:flex items-center justify-center w-6 h-6 rounded-md bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200/80 text-[10px] font-bold text-[rgb(var(--color-text-muted))]/60 light:text-slate-500 flex-shrink-0 mt-1.5">
                        {index + 1}
                      </span>
                      <div className="flex flex-col gap-2.5 flex-1 min-w-0">
                        <input
                          type="text"
                          value={outcome.code}
                          onChange={(e) => handleOutcomeChange(index, 'code', e.target.value)}
                          placeholder="e.g., SE-12-01"
                          className="bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-3.5 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-full sm:w-40 font-mono text-sm font-semibold flex-shrink-0"
                        />
                        <textarea
                          value={outcome.description}
                          onChange={(e) =>
                            handleOutcomeChange(index, 'description', e.target.value)
                          }
                          placeholder="Outcome description..."
                          rows={2}
                          className="bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-3.5 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-full text-sm resize-y min-h-[56px] leading-relaxed"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteOutcome(index)}
                        className="p-2 text-[rgb(var(--color-text-muted))]/50 light:text-slate-300 hover:text-red-400 light:hover:text-red-500 transition rounded-lg flex items-center hover:bg-red-500/10 light:hover:bg-red-50 flex-shrink-0 mt-1"
                        title="Delete Outcome"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    onClick={handleAddOutcome}
                    className="w-full py-3 px-4 rounded-xl text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/5 hover:bg-[rgb(var(--color-accent))]/10 transition text-sm font-semibold border border-dashed border-[rgb(var(--color-accent))]/30 hover:border-[rgb(var(--color-accent))]/50"
                  >
                    <Plus className="inline w-4 h-4 mr-1" /> Add Outcome
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 hidden sm:block">
            Incomplete rows (missing code or description) are ignored on save.
          </p>
          <div className="flex items-center gap-3 ml-auto">
            <button
              type="button"
              onClick={handleClose}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition"
            >
              Save Changes
            </button>
          </div>
        </div>

        <AiBusyOverlay show={isParsing}>
          <LoadingIndicator message="Parsing outcomes..." task="enrichment" />
        </AiBusyOverlay>
      </div>
    </div>
  );
};

export default OutcomesEditorModal;
