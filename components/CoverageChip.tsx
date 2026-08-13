import React from 'react';
import type { CoverageCount } from '../utils/starterQuestions';

interface CoverageChipProps {
  coverage: CoverageCount;
  /** Spelt out for the tooltip, e.g. "HSC Biology". */
  label: string;
}

/**
 * How much of a course or topic actually has questions in it.
 *
 * Seeding produces structure long before it produces questions, and a syllabus
 * tree with no questions looks identical in the picker to a finished one — so
 * "which of my courses are ready to show someone" could only be answered by
 * clicking through every topic. The percentage is the answer at a glance; the
 * exact counts are in the tooltip, because the number that matters when you are
 * finishing a course is how many are left.
 *
 * Curators only. A student choosing a course cannot act on it, and a half-built
 * course reads to them as a broken one.
 */
const CoverageChip: React.FC<CoverageChipProps> = ({ coverage, label }) => {
  // Nothing to cover is not 0% — an empty topic has no coverage to report, and
  // showing "0%" would mark it as neglected rather than unwritten.
  if (coverage.dotPoints === 0) return null;

  const percent = Math.round((coverage.withQuestions / coverage.dotPoints) * 100);
  const complete = coverage.withQuestions === coverage.dotPoints;
  const remaining = coverage.dotPoints - coverage.withQuestions;

  const tone = complete
    ? 'bg-green-500/15 text-green-400 light:bg-green-100 light:text-green-700 border-green-500/25 light:border-green-200'
    : percent >= 50
      ? 'bg-amber-500/15 text-amber-400 light:bg-amber-100 light:text-amber-700 border-amber-500/25 light:border-amber-200'
      : 'bg-slate-500/15 text-slate-400 light:bg-slate-200 light:text-slate-600 border-slate-500/25 light:border-slate-300';

  return (
    <span
      className={`flex-shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${tone}`}
      title={
        complete
          ? `${label}: every one of its ${coverage.dotPoints} syllabus points has a question.`
          : `${label}: ${coverage.withQuestions} of ${coverage.dotPoints} syllabus points have a question — ${remaining} to go.`
      }
    >
      {complete ? 'Ready' : `${percent}%`}
    </span>
  );
};

export default CoverageChip;
