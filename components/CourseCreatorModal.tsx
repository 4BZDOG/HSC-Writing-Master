import React, { useState } from 'react';
import { CourseOutcome, SyllabusYear } from '../types';
import { SYLLABUS_YEARS, yearShortLabel } from '../utils/syllabusYear';
import { duplicateCodeRows, withoutDuplicateCodes } from '../utils/outcomeCodes';
import { BookOpen, Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

interface CourseCreatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCourseCreated: (newCourseName: string, outcomes: CourseOutcome[]) => void;
  existingNames?: string[];
}

/** One blank row, so a tab is never an empty box with nothing to type into. */
const blankRow = (): CourseOutcome[] => [{ code: '', description: '' }];

const CourseCreatorModal: React.FC<CourseCreatorModalProps> = ({
  isOpen,
  onClose,
  onCourseCreated,
  existingNames = [],
}) => {
  const [courseName, setCourseName] = useState('');
  /**
   * Outcomes per year, because NESA writes a separate set for each.
   *
   * A course created here used to take one list, which meant a teacher setting
   * up "HSC Physics" could only enter the HSC outcomes and had to come back
   * through the navigator to add the Year 11 ones — after creating a Year 11
   * topic, since the year control cannot be reached on a course with no
   * content. Both sets are entered where the course is defined.
   */
  const [outcomesByYear, setOutcomesByYear] = useState<Record<SyllabusYear, CourseOutcome[]>>({
    year11: blankRow(),
    year12: blankRow(),
  });
  const [outcomeYear, setOutcomeYear] = useState<SyllabusYear>('year12');
  const [outcomesExpanded, setOutcomesExpanded] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const outcomes = outcomesByYear[outcomeYear];
  const setOutcomes = (next: CourseOutcome[]) =>
    setOutcomesByYear((prev) => ({ ...prev, [outcomeYear]: next }));

  const complete = (list: CourseOutcome[]) =>
    list.filter((o) => o.code.trim() !== '' && o.description.trim() !== '');

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
    // Year 12 stays spelled as the absence of a year, as it is everywhere else.
    // Repeated codes are dropped here as well as flagged on screen — a question
    // links to an outcome by code, and two rows sharing one make the link
    // ambiguous.
    const validOutcomes = [
      ...withoutDuplicateCodes(complete(outcomesByYear.year12)),
      ...withoutDuplicateCodes(complete(outcomesByYear.year11)).map((o) => ({
        ...o,
        year: 'year11' as const,
      })),
    ];
    onCourseCreated(courseName.trim(), validOutcomes);
    handleClose();
  };

  const handleAddOutcome = () => {
    setOutcomes([...outcomes, { code: '', description: '' }]);
  };

  const handleDeleteOutcome = (index: number) => {
    setOutcomes(outcomes.filter((_, i) => i !== index));
  };

  // The two TEXT fields only. `keyof CourseOutcome` also covers `year`, which
  // is not a free-text field and must not be written by a text input — the tab
  // decides the year.
  const handleOutcomeChange = (index: number, field: 'code' | 'description', value: string) => {
    const newOutcomes = [...outcomes];
    newOutcomes[index] = { ...newOutcomes[index], [field]: value };
    setOutcomes(newOutcomes);
  };

  const handleClose = () => {
    setCourseName('');
    setOutcomesByYear({ year11: blankRow(), year12: blankRow() });
    setOutcomeYear('year12');
    setOutcomesExpanded(true);
    setError(null);
    onClose();
  };

  useEscapeKey(isOpen, handleClose);
  useScrollLock(isOpen);

  if (!isOpen) {
    return null;
  }

  const countFor = (year: SyllabusYear) => complete(outcomesByYear[year]).length;
  // The collapsed header must count BOTH years, or closing the section after
  // filling in Year 11 would read as though that work had been lost.
  const validOutcomeCount = countFor('year11') + countFor('year12');
  // BI-11-01 vs BI-12-01: the year is the middle segment of every NESA code.
  const stem = outcomeYear === 'year11' ? '11' : '12';
  const repeatedRows = duplicateCodeRows(outcomes);

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
                  {/* Year 11 and Year 12 have entirely separate outcomes. */}
                  <div
                    role="tablist"
                    aria-label="Outcome year"
                    className="flex items-center gap-1 p-1 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-100"
                  >
                    {SYLLABUS_YEARS.map((y) => {
                      const selected = y.id === outcomeYear;
                      const count = countFor(y.id);
                      return (
                        <button
                          key={y.id}
                          type="button"
                          role="tab"
                          id={`outcome-year-tab-${y.id}`}
                          aria-selected={selected}
                          aria-controls="outcome-year-panel"
                          onClick={() => setOutcomeYear(y.id)}
                          // The selected tab carries a border as well as a
                          // lighter fill: in the light theme white-on-slate-100
                          // alone is too near a difference to read at a glance.
                          className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold border transition-colors ${
                            selected
                              ? 'bg-[rgb(var(--color-bg-surface-light))] light:bg-white border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-[rgb(var(--color-text-primary))] light:text-slate-900 shadow-sm'
                              : 'border-transparent text-[rgb(var(--color-text-muted))] light:text-slate-600 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900'
                          }`}
                        >
                          {y.label}
                          {count > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))]">
                              {count}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    {yearShortLabel(outcomeYear)} outcomes. Add them now, or use the Outcomes Editor
                    later to paste and parse them with AI.
                  </p>

                  <div
                    role="tabpanel"
                    id="outcome-year-panel"
                    aria-labelledby={`outcome-year-tab-${outcomeYear}`}
                    className="space-y-3"
                  >
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
                            placeholder={`e.g. SE-${stem}-01`}
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
                          {repeatedRows.has(index) && (
                            <p className="text-[11px] text-amber-400 light:text-amber-600">
                              {outcome.code.trim()} is already listed above — this row will be
                              ignored.
                            </p>
                          )}
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
                      className="w-full py-2.5 px-4 rounded-xl text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/5 hover:bg-[rgb(var(--color-accent))]/10 transition text-sm font-semibold border border-dashed border-[rgb(var(--color-accent))]/30 hover:border-[rgb(var(--color-accent))]/50"
                    >
                      <Plus className="inline w-4 h-4 mr-1" /> Add {yearShortLabel(outcomeYear)}{' '}
                      Outcome
                    </button>
                  </div>
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
