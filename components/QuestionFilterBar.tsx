import React, { useState } from 'react';
import { ListFilter, ChevronDown, RotateCcw, Landmark, AlertTriangle, Circle } from 'lucide-react';
import RangeSlider from './RangeSlider';
import {
  QuestionBounds,
  QuestionFilter,
  isFilterActive,
  summariseFilter,
  widestFilter,
} from '../utils/questionFilter';
import { tierShortLabel, TIER_GROUPS } from '../data/commandTerms';

interface QuestionFilterBarProps {
  bounds: QuestionBounds;
  filter: QuestionFilter;
  onChange: (next: QuestionFilter) => void;
  /** How many questions currently pass the filter, for the honest count. */
  shown: number;
}

/** The tier's full name, for the difficulty slider's tooltip. */
const tierTitle = (tier: number): string =>
  TIER_GROUPS.find((g) => g.tier === tier)?.title ?? `Tier ${tier}`;

/**
 * The refinement strip above a long question list.
 *
 * A dot point that has accumulated twenty questions is already grouped by
 * cognitive tier, which tells a reader what KIND each one is. This is for the
 * reader who already knows: "the hard ones", "the short ones", "the real
 * exam ones". It narrows what the picker offers without ever removing anything
 * permanently — the count line states the whole truth ("8 of 20 shown"), a
 * collapsed panel still lists what it is holding back, and one button puts it
 * all back.
 *
 * It is deliberately absent from short lists. Chrome that saves nobody any
 * reading is just one more thing on screen to interpret.
 */
const QuestionFilterBar: React.FC<QuestionFilterBarProps> = ({
  bounds,
  filter,
  onChange,
  shown,
}) => {
  const [open, setOpen] = useState(false);

  const active = isFilterActive(filter, bounds);
  const summary = summariseFilter(filter, bounds);
  // An axis every question shares is not a choice — a slider over it would be a
  // control that cannot change the list.
  const canFilterTier = bounds.tier[1] > bounds.tier[0];
  const canFilterMarks = bounds.marks[1] > bounds.marks[0];
  if (!canFilterTier && !canFilterMarks && !bounds.hasPastHsc && !bounds.hasAttempts) return null;

  const reset = () => onChange(widestFilter(bounds));

  return (
    <div className="mb-3 rounded-xl border border-white/10 light:border-slate-300 bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 overflow-hidden transition-all">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 flex-1 min-w-0 text-left group"
        >
          <ListFilter
            className={`w-3.5 h-3.5 flex-shrink-0 ${active ? 'text-amber-400 light:text-amber-600' : 'text-[rgb(var(--color-text-muted))] light:text-slate-500'}`}
          />
          <span className="text-[10px] font-black uppercase tracking-[0.15em] text-[rgb(var(--color-text-secondary))] light:text-slate-600 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors">
            Refine
          </span>
          {/* The count is the honesty clause: a filtered list always says how
              much of the library it is standing in front of. */}
          <span className="text-[10px] font-bold tabular-nums text-[rgb(var(--color-text-muted))] light:text-slate-500 truncate">
            {active ? `${shown} of ${bounds.total} shown` : `${bounds.total} questions`}
          </span>
          <ChevronDown
            className={`w-3.5 h-3.5 ml-auto flex-shrink-0 text-[rgb(var(--color-text-muted))] transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
          />
        </button>
        {/* The same count again, as a live region, because the visible one is
            inside a button: `role="button"` takes presentational children, so a
            `role="status"` on that span would be dropped from the accessibility
            tree and never announced. Out here, dragging a slider says what it
            did instead of changing the list in silence. */}
        <span role="status" className="sr-only">
          {active
            ? `${shown} of ${bounds.total} questions shown`
            : `All ${bounds.total} questions shown`}
        </span>
        {active && (
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide bg-red-500/10 light:bg-red-50 text-red-400 light:text-red-700 border border-red-500/20 light:border-red-300 hover:bg-red-500 hover:text-white transition-all flex-shrink-0"
            title="Show every question again"
          >
            <RotateCcw className="w-3 h-3" />
            Clear
          </button>
        )}
      </div>

      {/* Shut, the panel still names what it is holding back — a list that is
          shorter than it was, for reasons that have scrolled out of sight, is
          how a picker comes to look broken. */}
      {!open && active && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2">
          {summary.map((part) => (
            <span
              key={part}
              className="px-1.5 py-px rounded border text-[9px] font-black uppercase tracking-wider bg-amber-500/15 light:bg-amber-100 text-amber-400 light:text-amber-800 border-amber-500/30 light:border-amber-400"
            >
              {part}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="px-3 pb-3 pt-1 flex flex-col gap-4 border-t border-white/5 light:border-slate-200 animate-fade-in">
          {canFilterTier && (
            <RangeSlider
              label="Difficulty"
              min={bounds.tier[0]}
              max={bounds.tier[1]}
              value={filter.tier}
              onChange={(tier) => onChange({ ...filter, tier })}
              format={tierShortLabel}
              accent="text-amber-400 light:text-amber-600"
            />
          )}
          {canFilterMarks && (
            <RangeSlider
              label="Length"
              min={bounds.marks[0]}
              max={bounds.marks[1]}
              value={filter.marks}
              onChange={(marks) => onChange({ ...filter, marks })}
              format={(m) => `${m} mark${m === 1 ? '' : 's'}`}
              accent="text-sky-400 light:text-sky-600"
            />
          )}
          {(bounds.hasAttempts || bounds.hasPastHsc) && (
            <div className="flex flex-wrap items-center gap-2">
              {/* "Not yet attempted" is only offered once the reader HAS a
                  history here — before that it filters on a distinction that
                  does not exist for them, hiding nothing while looking as
                  though it should. */}
              {bounds.hasAttempts && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filter, unattemptedOnly: !filter.unattemptedOnly })}
                  aria-pressed={filter.unattemptedOnly}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${
                    filter.unattemptedOnly
                      ? 'bg-emerald-500 text-white border-emerald-400 shadow-sm'
                      : 'bg-[rgb(var(--color-bg-surface))] light:bg-white text-emerald-400 light:text-emerald-700 border-white/10 light:border-slate-300 hover:border-emerald-500/40'
                  }`}
                >
                  <Circle className="w-3 h-3" />
                  Not yet attempted
                </button>
              )}
              {bounds.hasPastHsc && (
                <button
                  type="button"
                  onClick={() => onChange({ ...filter, pastHscOnly: !filter.pastHscOnly })}
                  aria-pressed={filter.pastHscOnly}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider transition-all ${
                    // Amber is the provenance colour the rows use for a past-HSC
                    // chip, so it stays on the icon and label either way — but
                    // the fill is what says pressed, and an amber-tinted OFF
                    // state read as half-on.
                    filter.pastHscOnly
                      ? 'bg-amber-500 text-white border-amber-400 shadow-sm'
                      : 'bg-[rgb(var(--color-bg-surface))] light:bg-white text-amber-400 light:text-amber-700 border-white/10 light:border-slate-300 hover:border-amber-500/40'
                  }`}
                >
                  <Landmark className="w-3 h-3" />
                  Past HSC only
                </button>
              )}
            </div>
          )}
          {/* Tier names are short by necessity; the slider's ends say what they
              actually mean. */}
          {canFilterTier && (
            <p className="text-[10px] leading-snug text-[rgb(var(--color-text-muted))] light:text-slate-500">
              {tierTitle(filter.tier[0])}
              {filter.tier[1] !== filter.tier[0] && <> → {tierTitle(filter.tier[1])}</>}
            </p>
          )}
        </div>
      )}

      {shown === 0 && (
        <div className="flex items-start gap-2 px-3 py-2 border-t border-amber-500/20 bg-amber-500/10 light:bg-amber-50">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-400 light:text-amber-600 flex-shrink-0 mt-px" />
          <p className="text-[10px] font-medium leading-snug text-amber-300 light:text-amber-800">
            No question here matches those settings. Widen the range, or{' '}
            <button type="button" onClick={reset} className="underline font-bold">
              clear the filters
            </button>
            .
          </p>
        </div>
      )}
    </div>
  );
};

export default QuestionFilterBar;
