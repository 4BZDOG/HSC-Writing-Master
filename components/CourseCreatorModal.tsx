import React, { useState } from 'react';
import { CourseOutcome, SyllabusYear } from '../types';
import { SYLLABUS_YEARS, yearShortLabel } from '../utils/syllabusYear';
import { duplicateCodeRows, withoutDuplicateCodes } from '../utils/outcomeCodes';
import { BookOpen, Plus, Trash2, X, ChevronDown, ChevronUp } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import DiscardConfirmBar from './DiscardConfirmBar';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  CREATOR_BACKDROP,
  CREATOR_SHELL,
  CREATOR_HEADER,
  CREATOR_ICON_TILE,
  CREATOR_KICKER,
  CREATOR_TITLE,
  CREATOR_CLOSE,
  CREATOR_BODY,
  CREATOR_FOOTER,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_PRIMARY_BUTTON,
  CREATOR_FIELD_LABEL,
  CREATOR_INPUT,
} from '../utils/creatorChrome';

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
      setError('Enter a course name.');
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

  // A course name and two tabs of outcomes is typing worth protecting, and the
  // backdrop sits exactly where the pointer travels between the page and the
  // dialog. Same rule as the import modals.
  const hasWork =
    courseName.trim().length > 0 ||
    complete(outcomesByYear.year11).length > 0 ||
    complete(outcomesByYear.year12).length > 0;
  const guard = useDiscardGuard(isOpen, hasWork, handleClose);

  useEscapeKey(isOpen, guard.requestClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
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
    <div className={CREATOR_BACKDROP} onClick={guard.requestCloseFromBackdrop}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="course-creator-title"
        className={`${CREATOR_SHELL} max-w-3xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <BookOpen className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>New course</p>
            <h2 id="course-creator-title" className={CREATOR_TITLE}>
              Create a course
            </h2>
          </div>
          <button
            type="button"
            onClick={guard.requestClose}
            aria-label="Close"
            className={CREATOR_CLOSE}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className={`${CREATOR_BODY} space-y-5`}>
            {/* Course name */}
            <div>
              <label htmlFor="course-name" className={CREATOR_FIELD_LABEL}>
                Course name
              </label>
              <input
                type="text"
                id="course-name"
                value={courseName}
                onChange={(e) => {
                  setCourseName(e.target.value);
                  if (error) setError(null);
                }}
                className={CREATOR_INPUT}
                placeholder="e.g., HSC Chemistry"
                autoFocus
              />
            </div>

            {/* Outcomes section */}
            <div className="rounded-panel border border-slate-200 dark:border-white/15 overflow-hidden">
              {/* Outcomes header — collapsible */}
              <button
                type="button"
                onClick={() => setOutcomesExpanded(!outcomesExpanded)}
                aria-expanded={outcomesExpanded}
                aria-controls="course-outcomes-panel"
                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 hover:bg-slate-100 dark:bg-[rgb(var(--color-bg-surface-inset))]/40 dark:hover:bg-[rgb(var(--color-bg-surface-inset))]/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-[rgb(var(--color-text-primary))]">
                    Syllabus outcomes
                  </span>
                  <span className="t-label text-[rgb(var(--color-text-muted))] bg-slate-200 dark:bg-[rgb(var(--color-bg-surface-inset))] px-2 py-0.5 rounded-full">
                    {validOutcomeCount > 0 ? `${validOutcomeCount} added` : 'optional'}
                  </span>
                </div>
                {outcomesExpanded ? (
                  <ChevronUp
                    className="w-4 h-4 text-[rgb(var(--color-text-muted))] flex-shrink-0"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronDown
                    className="w-4 h-4 text-[rgb(var(--color-text-muted))] flex-shrink-0"
                    aria-hidden="true"
                  />
                )}
              </button>

              <div
                id="course-outcomes-panel"
                hidden={!outcomesExpanded}
                className="p-3 sm:p-4 space-y-4 border-t border-slate-200 dark:border-white/15"
              >
                {/* Year 11 and Year 12 have entirely separate outcomes. */}
                <div
                  role="tablist"
                  aria-label="Outcome year"
                  className="flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[rgb(var(--color-bg-surface-inset))]/50"
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
                        className={`min-h-11 sm:min-h-0 flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-semibold border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                          selected
                            ? 'bg-white border-slate-300 text-slate-900 shadow-sm dark:bg-[rgb(var(--color-bg-surface-light))] dark:border-white/15 dark:text-[rgb(var(--color-text-primary))]'
                            : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-[rgb(var(--color-text-muted))] dark:hover:text-[rgb(var(--color-text-primary))]'
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

                <p className="t-label text-[rgb(var(--color-text-muted))]">
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
                    // The code and its remove button share the first line, and the
                    // description takes the row's full width under them. Beside a
                    // number and a delete column, a phone left the description
                    // about 190px wide.
                    <div
                      key={index}
                      className="flex flex-col gap-2 p-3 sm:p-3.5 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-300 dark:bg-[rgb(var(--color-bg-surface-inset))]/30 dark:border-white/10 dark:hover:border-white/20 transition-colors"
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="hidden sm:flex items-center justify-center w-5 h-5 rounded-lg bg-slate-200 dark:bg-[rgb(var(--color-bg-surface-inset))] text-[10px] font-bold text-[rgb(var(--color-text-muted))] flex-shrink-0">
                          {index + 1}
                        </span>
                        <input
                          type="text"
                          value={outcome.code}
                          onChange={(e) => handleOutcomeChange(index, 'code', e.target.value)}
                          placeholder={`e.g. SE-${stem}-01`}
                          aria-label={`Outcome ${index + 1} code`}
                          className="min-w-0 flex-1 sm:flex-none sm:w-48 rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[rgb(var(--color-bg-surface-light))] py-2.5 px-3.5 font-mono text-base sm:text-sm font-semibold text-[rgb(var(--color-text-primary))] placeholder:text-[rgb(var(--color-text-dim))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                        />
                        <button
                          type="button"
                          onClick={() => handleDeleteOutcome(index)}
                          aria-label={`Remove outcome ${index + 1}`}
                          title={`Remove outcome ${index + 1}`}
                          className="ml-auto min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 p-2 flex items-center justify-center flex-shrink-0 rounded-lg text-slate-500 hover:text-red-500 hover:bg-red-50 dark:text-[rgb(var(--color-text-muted))] dark:hover:text-red-400 dark:hover:bg-red-500/10 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                      <textarea
                        value={outcome.description}
                        onChange={(e) => handleOutcomeChange(index, 'description', e.target.value)}
                        placeholder="Outcome description…"
                        aria-label={`Outcome ${index + 1} description`}
                        rows={2}
                        className="w-full min-h-[52px] rounded-lg border border-slate-300 dark:border-white/15 bg-white dark:bg-[rgb(var(--color-bg-surface-light))] py-2.5 px-3.5 text-base sm:text-sm leading-relaxed text-[rgb(var(--color-text-primary))] placeholder:text-[rgb(var(--color-text-dim))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] resize-y"
                      />
                      {repeatedRows.has(index) && (
                        <p className="t-label text-amber-600 dark:text-amber-400">
                          {outcome.code.trim()} is already listed above — this row will be ignored.
                        </p>
                      )}
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={handleAddOutcome}
                    className="min-h-11 sm:min-h-0 w-full flex items-center justify-center gap-1.5 py-2.5 px-4 rounded-xl text-sm font-semibold text-[rgb(var(--color-accent))] bg-[rgb(var(--color-accent))]/5 hover:bg-[rgb(var(--color-accent))]/10 border border-dashed border-[rgb(var(--color-accent))]/30 hover:border-[rgb(var(--color-accent))]/50 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Add {yearShortLabel(outcomeYear)} outcome
                  </button>
                </div>
              </div>
            </div>
          </div>

          {error && (
            <p
              role="alert"
              className="mx-5 sm:mx-6 mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 p-3 rounded-lg border border-red-200 dark:border-red-500/20"
            >
              {error}
            </p>
          )}

          {/* Footer */}
          {guard.isConfirming ? (
            <DiscardConfirmBar
              summary="this new course and its outcomes"
              onKeep={guard.cancelDiscard}
              onDiscard={guard.confirmDiscard}
            />
          ) : (
            <div className={CREATOR_FOOTER}>
              <button
                type="button"
                onClick={guard.requestClose}
                className={CREATOR_SECONDARY_BUTTON}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!courseName.trim()}
                className={CREATOR_PRIMARY_BUTTON}
              >
                Create course
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
};

export default CourseCreatorModal;
