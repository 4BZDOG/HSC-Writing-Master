import React, { useState } from 'react';
import { BookOpenCheck, Check, Minus } from 'lucide-react';
import {
  readSupportUsage,
  SUPPORT_RESOURCES,
  type SupportResourceId,
} from '../utils/supportEngagement';

interface SupportUsageSummaryProps {
  /** The question that was just marked. */
  promptId: string;
  className?: string;
}

const Row: React.FC<{ id: SupportResourceId; opened: boolean }> = ({ id, opened }) => (
  <li
    className={`flex items-start gap-2.5 text-sm ${
      opened ? 'text-slate-700 dark:text-slate-200' : 'text-slate-600 dark:text-slate-400'
    }`}
  >
    <span
      aria-hidden="true"
      className={`mt-0.5 w-4 h-4 shrink-0 rounded-full flex items-center justify-center border ${
        opened
          ? 'bg-emerald-100 border-emerald-300 text-emerald-800 dark:bg-emerald-500/15 dark:border-emerald-500/40 dark:text-emerald-400'
          : 'bg-slate-500/10 border-slate-400 text-slate-600 dark:border-slate-400/40 dark:text-slate-400'
      }`}
    >
      {opened ? (
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
      ) : (
        <Minus className="w-2.5 h-2.5" />
      )}
    </span>
    <span className="min-w-0">
      <span className="font-semibold">{SUPPORT_RESOURCES[id].label}</span>
      {!opened && (
        <span className="text-slate-600 dark:text-slate-400">
          {' '}
          — you did not open {SUPPORT_RESOURCES[id].missed}
        </span>
      )}
    </span>
  </li>
);

/**
 * "What you had open before you wrote."
 *
 * The workspace surrounds a question with help, all of it folded shut, so it
 * is entirely possible to write an answer having read none of it — and then to
 * read feedback about a mark the marking guide had already explained. This
 * closes that loop once, plainly, at the end of the report.
 *
 * It used to be a card of its own in the middle of the feedback, with the
 * unopened supports listed as a checklist. That made a habit of reading into a
 * judgement on the answer, so it is one line now, and the list is behind it for
 * the student who wants to see which supports those were.
 *
 * Two things it deliberately is not. It is not a score: nothing here is added
 * to a mark, and a student who wrote a strong answer cold is told so first. And
 * it is not a scold — the unopened supports are named with what they would have
 * told them, which is the only version of this observation worth reading.
 *
 * The record is per-session and in memory (utils/supportEngagement.ts), so a
 * result restored from storage in a later session simply has nothing to show
 * and the section does not render at all.
 */
const SupportUsageSummary: React.FC<SupportUsageSummaryProps> = ({ promptId, className = '' }) => {
  // Frozen at mount. This lands on screen when the marking comes back, which is
  // the moment the reading actually happened by — and the panels behind it have
  // already unmounted, so nothing can change it after this point.
  const [usage] = useState(() => readSupportUsage(promptId));
  const [expanded, setExpanded] = useState(false);

  // Nothing was on offer (or nothing was recorded — a restored result, a
  // deep-linked assignment). Silence beats an empty checklist.
  if (usage.available.length < 2) return null;

  const readAll = usage.skipped.length === 0;
  const readNone = usage.opened.length === 0;
  const total = usage.available.length;

  return (
    <section className={`no-print ${className}`}>
      <div className="flex items-start gap-2.5 text-sm">
        <BookOpenCheck
          className="w-4 h-4 mt-0.5 shrink-0 text-slate-600 dark:text-slate-400"
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
            {readAll
              ? `You opened all ${total} supports for this question. Nothing on it was left unread.`
              : readNone
                ? `You wrote this without opening any of the ${total} supports for this question.`
                : `You opened ${usage.opened.length} of ${total} supports for this question.`}{' '}
            {!readAll && (
              <span className="text-slate-600 dark:text-slate-400">
                Not a mark, and not a rule.
              </span>
            )}
          </p>
          {!expanded && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="t-label mt-1 inline-flex items-center min-h-11 sm:min-h-0 text-indigo-700 dark:text-indigo-300 hover:underline"
            >
              Show all {total}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <ul className="mt-3 ml-6 space-y-2">
          {usage.available.map((id) => (
            <Row key={id} id={id} opened={usage.opened.includes(id)} />
          ))}
        </ul>
      )}
    </section>
  );
};

export default SupportUsageSummary;
