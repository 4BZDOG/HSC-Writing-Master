import React, { useId, useMemo, useState } from 'react';
import { CheckCircle2, Circle, ChevronDown } from 'lucide-react';
import type { WritingInsight } from '../utils/writingAnalysis';
import {
  PANEL_HEADER_CLOSED,
  PANEL_HEADER_OPEN,
  PANEL_ROW_MIN_H,
  PANEL_SURFACE,
} from '../utils/panelStyles';
import { PROSE_FLOW } from '../utils/prose';
import {
  buildDraftChecklist,
  summariseChecklist,
  type DraftChecklistRow,
} from '../utils/draftChecklist';
import { PanelReadChip, useOpenedOnce } from './PanelDisclosure';
import WordChip from './WordChip';

const NO_TERMS: string[] = [];

interface DraftCheckProps {
  insights: WritingInsight[];
  /** The draft's word count, which decides which checks apply yet. */
  wordCount: number;
  /** Syllabus terms still missing, must-use terms first. */
  missingTerms?: string[];
  /** Adds a missing term to the draft. Without it the terms are not offered as chips. */
  onInsertTerm?: (term: string) => void;
  /** Folded by default, like every other panel under the writing area. The
   *  summary line carries the news while it is shut. */
  defaultCollapsed?: boolean;
}

const RING_RADIUS = 13;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * How many checks are clear, as a ring in the slot the other panels give an
 * icon tile. The count sits in the middle, so the ring says the same thing
 * in words as it does in its arc, and colour is never the only signal.
 *
 * Emerald when every check is clear, amber while work remains, slate while
 * resting on a blank draft. The track is a neutral stroke in both themes.
 */
const ClearRing: React.FC<{ cleared: number; total: number; resting: boolean }> = ({
  cleared,
  total,
  resting,
}) => {
  const fraction = total > 0 && !resting ? cleared / total : 0;
  const allClear = !resting && total > 0 && cleared === total;
  const stroke = resting
    ? 'stroke-slate-400 dark:stroke-slate-500'
    : allClear
      ? 'stroke-emerald-600 dark:stroke-emerald-400'
      : 'stroke-amber-600 dark:stroke-amber-400';

  return (
    <div className="relative w-8 h-8 shrink-0">
      <svg viewBox="0 0 32 32" className="w-8 h-8 -rotate-90" aria-hidden="true">
        <circle
          cx="16"
          cy="16"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="3"
          className="stroke-slate-200 dark:stroke-white/10"
        />
        <circle
          cx="16"
          cy="16"
          r={RING_RADIUS}
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={RING_LENGTH}
          strokeDashoffset={RING_LENGTH * (1 - fraction)}
          className={`${stroke} transition-[stroke-dashoffset] duration-500 motion-reduce:transition-none`}
        />
      </svg>
      {/* An em dash while resting, not a nought. Zero is a RESULT: it says the
          draft has been read and nothing is clear yet, and there is no draft
          to read. */}
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-bold tabular-nums text-slate-900 dark:text-white">
        {resting ? '—' : cleared}
      </span>
    </div>
  );
};

/**
 * One check on the list: a glyph, the label, whether it is clear, the detail
 * beneath, and any missing terms it offers as chips.
 *
 * Status is the glyph and the word together, both in the tone's own colour. It
 * is never a tinted fill: colour as fill belongs to the band system alone.
 */
const CheckRow: React.FC<{
  row: DraftChecklistRow;
  onInsertTerm?: (term: string) => void;
}> = ({ row, onInsertTerm }) => {
  const done = row.state === 'done';
  const Glyph = done ? CheckCircle2 : Circle;

  return (
    <li className="flex items-start gap-3">
      <Glyph
        aria-hidden="true"
        className={`w-4 h-4 mt-0.5 shrink-0 ${
          done ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
        }`}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-3">
          <p className="t-label text-slate-900 dark:text-white">{row.label}</p>
          <span
            className={`t-label ml-auto shrink-0 ${
              done ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-300'
            }`}
          >
            {done ? 'Clear' : 'To do'}
          </span>
        </div>
        <p
          className={`text-xs ${PROSE_FLOW} leading-relaxed text-slate-700 dark:text-slate-300 mt-0.5`}
        >
          {row.detail}
        </p>
        {onInsertTerm && row.terms && row.terms.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {row.terms.map((term) => (
              <WordChip key={term} word={term} onInsert={onInsertTerm} />
            ))}
          </div>
        )}
      </div>
    </li>
  );
};

/**
 * What to fix in the draft so far, shown directly beneath the writing surface.
 * These are while-writing prompts, so they sit within a glance of the caret
 * rather than inside the metrics dashboard further down the page.
 *
 * It is a checklist of the four things a draft is checked for — length, syllabus
 * terms, sentences and structure — and the header says how many are clear. The
 * terms still missing are offered as words to add, so a student can act on the
 * list without retyping what it names.
 *
 * Collapsible, like every other panel around it. The header carries the count
 * while it is shut, so folding it away is a choice rather than a blindfold.
 *
 * On a blank draft it rests rather than disappearing: same row, same height,
 * saying what it will do. It is not a disclosure in that state, because there
 * is nothing behind it.
 */
const DraftCheck: React.FC<DraftCheckProps> = React.memo(
  ({ insights, wordCount, missingTerms = NO_TERMS, onInsertTerm, defaultCollapsed = true }) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const panelId = useId();
    // No reset key: this panel is about the student's own draft, which follows
    // them rather than belonging to one question.
    const opened = useOpenedOnce(!isCollapsed, undefined);

    const rows = useMemo(
      () => buildDraftChecklist({ insights, wordCount, missingTerms }),
      [insights, wordCount, missingTerms]
    );
    const { cleared, total, allClear } = useMemo(() => summariseChecklist(rows), [rows]);
    const resting = rows.length === 0;

    const summary = useMemo(() => {
      if (resting) return 'Checks your length, syllabus terms and structure as you write';
      if (allClear) return 'All checks clear';
      return `${cleared} of ${total} checks clear`;
    }, [resting, allClear, cleared, total]);

    return (
      <div className={`${PANEL_SURFACE} animate-fade-in`}>
        <button
          onClick={() => setIsCollapsed((c) => !c)}
          disabled={resting}
          aria-expanded={resting ? undefined : !isCollapsed}
          aria-controls={resting ? undefined : panelId}
          className={`w-full ${PANEL_ROW_MIN_H} py-3.5 px-5 flex items-center gap-4 text-left transition-all ${
            resting ? 'cursor-default' : isCollapsed ? PANEL_HEADER_CLOSED : PANEL_HEADER_OPEN
          }`}
        >
          <ClearRing cleared={cleared} total={total} resting={resting} />
          {/* The panel's NAME takes the section treatment and the line under it
              stays `.t-label`: the heading and its caption, as on every other
              panel in this column. A span rather than a heading element is still
              right, because the row IS the disclosure. */}
          <span className="text-left">
            <span
              className={`t-section block ${
                isCollapsed
                  ? 'text-slate-500 dark:text-slate-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              Draft check
            </span>
            <span className="t-label block text-slate-600 dark:text-slate-400">{summary}</span>
          </span>
          <div className="flex items-center gap-2.5 shrink-0 ml-auto">
            <PanelReadChip show={opened && isCollapsed} />
            {!resting && (
              <ChevronDown
                className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-500 motion-reduce:transition-none ${
                  isCollapsed ? '' : 'rotate-180 text-slate-900 dark:text-white'
                }`}
              />
            )}
          </div>
        </button>

        <div
          id={panelId}
          inert={isCollapsed || resting}
          className={`grid transition-all duration-500 ease-in-out motion-reduce:transition-none ${
            isCollapsed || resting ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
          }`}
        >
          <div className="overflow-hidden">
            <ul className="flex flex-col gap-4 px-5 pt-2 pb-4">
              {rows.map((row) => (
                <CheckRow key={row.id} row={row} onInsertTerm={onInsertTerm} />
              ))}
            </ul>
          </div>
        </div>
      </div>
    );
  }
);

DraftCheck.displayName = 'DraftCheck';
export default DraftCheck;
