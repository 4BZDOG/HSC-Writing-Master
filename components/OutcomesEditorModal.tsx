import React, { useState, useEffect } from 'react';
import { CourseOutcome } from '../types';
import { parseOutcomesFromText } from '../services/geminiService';
import LoadingSpinner from './LoadingSpinner';
import { Target, X, Sparkles, Plus, Trash2 } from 'lucide-react';

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
      setPastedText(''); // Clear text area on success
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

  if (!isOpen) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] rounded-2xl shadow-2xl w-full max-w-5xl border border-[rgb(var(--color-border-secondary))] animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))]">
                  Edit Outcomes for {courseName}
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))]">
                  Add outcomes manually or paste text to parse with AI.
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

        <div className="flex-grow grid grid-cols-1 md:grid-cols-3 gap-6 p-6 overflow-hidden">
          {/* AI Parser */}
          <div className="md:col-span-1 flex flex-col h-full">
            <h3 className="text-base font-semibold text-gray-200 mb-2 flex-shrink-0">
              Parse from Text
            </h3>
            <div className="flex-grow flex flex-col bg-[rgb(var(--color-bg-surface-inset))]/50 p-4 rounded-lg border border-[rgb(var(--color-border-secondary))]">
              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="Paste syllabus outcomes here..."
                className="flex-grow bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-md py-2 px-3 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] text-sm resize-none"
              />
              <button
                onClick={handleParseText}
                disabled={isParsing || !pastedText.trim()}
                className="mt-3 w-full py-2.5 px-4 rounded-lg text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                {isParsing ? 'Parsing...' : 'Parse with AI'}
              </button>
              {error && <p className="text-red-400 mt-2 text-xs">{error}</p>}
            </div>
          </div>

          {/* Manual Editor */}
          <div className="md:col-span-2 flex flex-col h-full">
            <h3 className="text-base font-semibold text-gray-200 mb-2 flex-shrink-0">
              Outcomes List ({outcomes.length})
            </h3>
            <div className="flex-grow overflow-y-auto pr-2 -mr-2 space-y-2 bg-[rgb(var(--color-bg-surface-inset))]/50 p-4 rounded-lg border border-[rgb(var(--color-border-secondary))]">
              {outcomes.map((outcome, index) => (
                <div key={index} className="flex items-start space-x-2">
                  <input
                    type="text"
                    value={outcome.code}
                    onChange={(e) => handleOutcomeChange(index, 'code', e.target.value)}
                    placeholder="Code"
                    className="bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-md py-2 px-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-1/4 font-mono text-sm"
                  />
                  <textarea
                    value={outcome.description}
                    onChange={(e) => handleOutcomeChange(index, 'description', e.target.value)}
                    placeholder="Description"
                    rows={1}
                    className="bg-[rgb(var(--color-bg-surface-light))] border border-[rgb(var(--color-border-secondary))] rounded-md py-2 px-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-3/4 text-sm resize-y min-h-[42px]"
                  />
                  <button
                    type="button"
                    onClick={() => handleDeleteOutcome(index)}
                    className="p-2 text-gray-500 hover:text-red-400 transition rounded-md h-full flex items-center bg-[rgb(var(--color-bg-surface-light))] hover:bg-red-500/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={handleAddOutcome}
                className="w-full py-2 mt-2 rounded-lg text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/10 hover:bg-[rgb(var(--color-accent))]/20 transition text-sm font-semibold border border-dashed border-[rgb(var(--color-accent))]/30"
              >
                <Plus className="inline w-4 h-4 mr-1" /> Add Outcome
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 border-t border-[rgb(var(--color-border-secondary))] flex justify-end space-x-3">
          <button
            type="button"
            onClick={handleClose}
            className="py-2 px-4 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-light))] hover:bg-[rgb(var(--color-border-secondary))] transition"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="py-2 px-4 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition"
          >
            Save Changes
          </button>
        </div>

        {isParsing && (
          <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/95 backdrop-blur-sm flex items-center justify-center rounded-2xl">
            <LoadingSpinner message="Parsing outcomes..." />
          </div>
        )}
      </div>
    </div>
  );
};

export default OutcomesEditorModal;
