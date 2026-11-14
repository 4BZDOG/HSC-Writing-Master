import React, { useId } from 'react';
import { Compass, GraduationCap } from 'lucide-react';
import { EXAM_BOOKLET_BORDER, EXAM_PANEL_SURFACE } from '../utils/panelStyles';

interface ExamConditionsPlacardProps {
  /** Switches the workspace back to Coach Mode. */
  onBackToCoach: () => void;
}

/**
 * Where the reference rail sits in Exam Mode.
 *
 * The rail (syllabus terms, marking guide) is put away under exam conditions, and
 * a student who came out of Focus Mode with Exam on used to find that space simply
 * empty. This says why it is empty and how to get the material back, in the
 * exam booklet's own edge, so the gap reads as a deliberate state rather than a
 * missing panel.
 */
const ExamConditionsPlacard: React.FC<ExamConditionsPlacardProps> = ({ onBackToCoach }) => {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className={`${EXAM_PANEL_SURFACE} p-5`}>
      <div className="flex items-start gap-4">
        <div
          className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center border ${EXAM_BOOKLET_BORDER} bg-slate-100 dark:bg-black/20 text-slate-700 dark:text-slate-200`}
        >
          <GraduationCap className="w-4 h-4" aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h3
            id={headingId}
            className="text-base font-bold leading-tight tracking-tight text-slate-900 dark:text-white"
          >
            Exam conditions
          </h3>
          <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">
            Syllabus terms, the marking guide, sample answers and the draft check are put away until
            you submit your response for marking or go back to Coach mode.
          </p>
          <button
            type="button"
            onClick={onBackToCoach}
            className="t-label mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-500 bg-white dark:bg-white/5 text-slate-800 dark:text-slate-100 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[rgb(var(--color-bg-surface))]"
          >
            <Compass className="w-3.5 h-3.5" aria-hidden="true" />
            Back to Coach mode
          </button>
        </div>
      </div>
    </section>
  );
};

export default ExamConditionsPlacard;
