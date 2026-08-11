import React, { useState } from 'react';
import { CourseOutcome } from '../types';
import { BookOpen, Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

interface CourseCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCourseCreated: (newCourseName: string, outcomes: CourseOutcome[]) => void;
  existingNames?: string[];
}

const CourseCreatorModal: React.FC<CourseCreatorModalProps> = ({
  isOpen,
  onClose,
  onCourseCreated,
  existingNames = [],
}) => {
  const [courseName, setCourseName] = useState('');
  const [outcomes, setOutcomes] = useState<CourseOutcome[]>([{ code: '', description: '' }]);
  const [outcomesExpanded, setOutcomesExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseName.trim()) {
      setError('Please enter a course name.');
      return;
    }
    // Duplicate course names break import auto-mapping, which matches by name.
    const trimmedName = courseName.trim();
    if (existingNames.some((n) => n.trim().toLowerCase() === trimmedName.toLowerCase())) {
      setError(`A course named "${trimmedName}" already exists.`);
      return;
    }
    const validOutcomes = outcomes.filter(
      (o) => o.code.trim() !== '' && o.description.trim() !== ''
    );
    onCourseCreated(courseName.trim(), validOutcomes);
    handleClose();
  };

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

  const handleClose = () => {
    setCourseName('');
    setOutcomes([{ code: '', description: '' }]);
    setOutcomesExpanded(true);
    setError(null);
    onClose();
  };

  useEscapeKey(isOpen, handleClose);
  useScrollLock(isOpen);

  if (!isOpen) {
    return null;
  }

  const validOutcomeCount = outcomes.filter((o) => o.code.trim() && o.description.trim()).length;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
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
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Create New Course
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  Define a course and its syllabus outcomes.
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

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="flex-grow flex flex-col overflow-hidden bg-[rgb(var(--color-bg-surface))] light:bg-white"
        >
          <div className="p-6 space-y-5 flex-grow overflow-y-auto">
            {/* Course Name */}
            <div>
              <label
                htmlFor="course-name"
                className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2"
              >
                Course Name
              </label>
              <input
                type="text"
                id="course-name"
                value={courseName}
                onChange={(e) => {
                  setCourseName(e.target.value);
                  if (error) setError(null);
                }}
                className="block w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-xl shadow-sm py-3 px-4 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] text-base"
                placeholder="e.g., HSC Chemistry"
                autoFocus
              />
            </div>

            {/* Outcomes Section */}
            <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-hidden">
              {/* Outcomes Header — collapsible */}
              <button
                type="button"
                onClick={() => setOutcomesExpanded(!outcomesExpanded)}
                className="w-full flex items-center justify-between px-4 py-3 bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 hover:bg-[rgb(var(--color-bg-surface-inset))]/60 light:hover:bg-slate-100 transition-colors"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                    Syllabus Outcomes
                  </span>
                  <span className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 px-2 py-0.5 rounded-full">
                    {validOutcomeCount > 0 ? `${validOutcomeCount} added` : 'optional'}
                  </span>
                </div>
                {outcomesExpanded ? (
                  <ChevronUp className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500" />
                )}
              </button>

              {outcomesExpanded && (
                <div className="p-4 space-y-4">
                  <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    Add outcomes now, or use the Outcomes Editor later to paste and parse them with
                    AI.
                  </p>

                  <div className="space-y-3">
                    {outcomes.map((outcome, index) => (
                      <div
                        key={index}
                        className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/80 border border-[rgb(var(--color-border-secondary))]/50 light:border-slate-200 hover:border-[rgb(var(--color-border-secondary))] light:hover:border-slate-300 transition-colors"
                      >
                        <span className="hidden sm:flex items-center justify-center w-5 h-5 rounded-md bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200/80 text-[10px] font-bold text-[rgb(var(--color-text-muted))]/60 light:text-slate-500 flex-shrink-0 mt-2">
                          {index + 1}
                        </span>
                        <div className="flex flex-col gap-2 flex-1 min-w-0">
                          <input
                            type="text"
                            value={outcome.code}
                            onChange={(e) => handleOutcomeChange(index, 'code', e.target.value)}
                            placeholder="e.g. SE-12-01"
                            className="bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-3.5 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-full sm:w-48 font-mono text-sm font-semibold flex-shrink-0"
                          />
                          <textarea
                            value={outcome.description}
                            onChange={(e) =>
                              handleOutcomeChange(index, 'description', e.target.value)
                            }
                            placeholder="Outcome description..."
                            rows={2}
                            className="bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg py-2.5 px-3.5 text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] w-full text-sm resize-y min-h-[52px] leading-relaxed"
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
                  </div>

                  <button
                    type="button"
                    onClick={handleAddOutcome}
                    className="w-full py-2.5 px-4 rounded-xl text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/5 hover:bg-[rgb(var(--color-accent))]/10 transition text-sm font-semibold border border-dashed border-[rgb(var(--color-accent))]/30 hover:border-[rgb(var(--color-accent))]/50"
                  >
                    <Plus className="inline w-4 h-4 mr-1" /> Add Outcome
                  </button>
                </div>
              )}
            </div>
          </div>

          {error && (
            <p className="mx-6 mb-4 text-red-400 light:text-red-600 text-sm bg-red-900/30 light:bg-red-50 p-3 rounded-lg border border-red-500/20 light:border-red-200">
              {error}
            </p>
          )}

          {/* Footer */}
          <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={handleClose}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!courseName.trim()}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create Course
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CourseCreatorModal;
