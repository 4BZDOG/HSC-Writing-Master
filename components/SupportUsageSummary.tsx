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
}

const Row: React.FC<{ id: SupportResourceId; opened: boolean }> = ({ id, opened }) => (
  <li
    className={`flex items-start gap-2.5 text-sm ${
      opened ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'
    }`}
  >
    <span
      aria-hidden="true"
      className={`mt-0.5 w-4 h-4 shrink-0 rounded-full flex items-center justify-center border ${
        opened
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
          : 'bg-slate-500/10 border-slate-400/30 text-slate-400'
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
        <span className="text-slate-500 dark:text-slate-400">
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
 * section closes that loop once, plainly, at the moment the student is looking
 * at the consequence.
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
const SupportUsageSummary: React.FC<SupportUsageSummaryProps> = ({ promptId }) => {
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
  const visible = expanded ? usage.available : usage.available.slice(0, 4);

  return (
    <section className="no-print">
      <div className="rounded-3xl border border-slate-200/80 dark:border-white/10 bg-white dark:bg-white/5 shadow-sm p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 shrink-0">
            <BookOpenCheck className="w-4 h-4" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Before you wrote
            </h3>
            <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-100">
              {readAll
                ? `You opened all ${usage.available.length} supports for this question.`
                : readNone
                  ? `You wrote this without opening any of the ${usage.available.length} supports for this question.`
                  : `You opened ${usage.opened.length} of ${usage.available.length} supports for this question.`}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {readAll
                ? 'Nothing on this question was left unread — that preparation is what the feedback above is measuring.'
                : 'Not a mark, and not a rule: some of the advice above may already be sitting in a panel you have not opened yet.'}
            </p>
          </div>
        </div>

        <ul className="mt-4 space-y-2">
          {visible.map((id) => (
            <Row key={id} id={id} opened={usage.opened.includes(id)} />
          ))}
        </ul>

        {usage.available.length > visible.length && (
          <button
            type="button"
            onClick={() => setExpanded(true)}
            className="mt-3 text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            Show all {usage.available.length}
          </button>
        )}
      </div>
    </section>
  );
};

export default SupportUsageSummary;
