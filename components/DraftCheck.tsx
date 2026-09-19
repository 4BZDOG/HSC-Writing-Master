import React, { useId, useMemo, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, ChevronDown } from 'lucide-react';
import { InsightTone, WritingInsight } from '../utils/writingAnalysis';
import {
  PANEL_HEADER_CLOSED,
  PANEL_HEADER_OPEN,
  PANEL_ROW_MIN_H,
  PANEL_SURFACE,
} from '../utils/panelStyles';
import { PanelReadChip, useOpenedOnce } from './PanelDisclosure';

/**
 * Tone, carried by a rule and a glyph — never by a fill.
 *
 * Each note used to be a tinted card: amber for a warning, emerald for a
 * positive, sky for a note. Those are Tier 3, 4 and 5 in the band ramp, and
 * this panel sits directly beneath a writing surface painted in the question's
 * own tier hue — so on a Tier 3 question an amber "you are missing terms" box
 * sat under an amber writing card, the two meaning nothing like each other.
 *
 * Colour as FILL now belongs to the band system alone. A note is marked by
 * structure instead: a rule down its left edge and its glyph, both of which
 * read in either theme and neither of which claims a band.
 */
const TONE_STYLES: Record<InsightTone, { rule: string; icon: string; Icon: React.ElementType }> = {
  positive: {
    rule: 'border-emerald-500 dark:border-emerald-400/70',
    icon: 'text-emerald-600 dark:text-emerald-400',
    Icon: CheckCircle2,
  },
  warning: {
    rule: 'border-amber-500 dark:border-amber-400/70',
    icon: 'text-amber-600 dark:text-amber-400',
    Icon: AlertTriangle,
  },
  info: {
    rule: 'border-sky-500 dark:border-sky-400/70',
    icon: 'text-sky-600 dark:text-sky-400',
    Icon: Info,
  },
};

interface DraftCheckProps {
  insights: WritingInsight[];
  /** Folded by default, like every other panel under the writing area. The
   *  summary line carries the news while it is shut. */
  defaultCollapsed?: boolean;
}

/**
 * What to fix in the draft so far, shown directly beneath the writing surface.
 * These are while-writing prompts, so they sit within a glance of the caret
 * rather than inside the metrics dashboard further down the page — a student
 * should never have to scroll to find out what to fix next.
 *
 * It was called "Live Insights", which is dashboard vocabulary for something a
 * student would describe as checking their draft. `buildWritingInsights` puts
 * the things to act on first and allows at most one line of reassurance at the
 * end, so the panel reads as a list of work rather than a feed.
 *
 * Collapsible, like every other panel around it (the reference rail's
 * accordions, the exemplars, the metrics strip). The summary line survives the
 * fold: with the panel shut a student still sees how many things are waiting,
 * so folding it away is a choice rather than a blindfold.
 *
 * On a blank draft it rests rather than disappearing — same row, same height,
 * saying what it will do. It is not a disclosure in that state: there is
 * nothing behind it, so the chevron goes and the row stops being a button.
 */
const DraftCheck: React.FC<DraftCheckProps> = React.memo(
  ({ insights, defaultCollapsed = true }) => {
    const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
    const panelId = useId();
    // No reset key: this panel is about the student's own draft, which follows
    // them rather than belonging to one question.
    const opened = useOpenedOnce(!isCollapsed, undefined);

    // Everything that is not praise is something to act on — an `info` note
    // ("break this into paragraphs") is work in exactly the way a `warning` is.
    // Counting warnings alone meant the header could say "1 to work on" over a
    // list of two things to do.
    const toWorkOn = useMemo(
      () => insights.filter((i) => i.tone !== 'positive').length,
      [insights]
    );

    // Nothing to say yet, which is not the same as nothing to be.
    //
    // This used to `return null` on a blank draft, so the panel did not exist
    // until the first word and then pushed the metrics strip and the whole
    // reference rail down the page — while the student was typing. It also
    // meant the one moment the panel could say what it is FOR was the one
    // moment it was absent, against DesignSpec §5: an empty screen is an
    // invitation to act.
    const resting = insights.length === 0;

    const summary = useMemo(() => {
      if (resting) return 'Checks your length, syllabus terms and structure as you write';
      if (toWorkOn > 0) return `${toWorkOn} to work on`;
      return 'Nothing to fix yet';
    }, [resting, toWorkOn]);

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
          {/* The count, in the slot the other panels give an icon tile.
              A lightbulb sat here and meant "tip" — the same thing it was
              already saying on the coach-mode toggle and the verb strategy row
              directly above. The number is the news this panel has, it holds
              the row at the height of its neighbours down the column, and it
              is the one marker here that says something the label does not.

              It counts the WORK, which is what the line beneath it counts. It
              counted every note, so a panel holding one fix and one bit of
              praise showed a 2 over "1 to work on" — the badge and its own
              summary disagreeing in the same row. Zero, against "Nothing to
              fix yet", is a reading worth having. */}
          <div
            className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center border font-mono text-sm font-bold tabular-nums transition-colors duration-500 ${
              toWorkOn > 0
                ? 'border-amber-500 dark:border-amber-400/70 text-amber-700 dark:text-amber-300'
                : 'border-slate-300 dark:border-white/10 text-slate-500 dark:text-slate-400'
            }`}
          >
            {/* An em dash while resting, not a nought. Zero is a RESULT — it is
                what the panel says when it has read the draft and found
                nothing to fix — and there is no draft yet. */}
            {resting ? '—' : toWorkOn}
          </div>
          {/* The panel's NAME takes the section treatment and the line under it
              stays `.t-label` — the pairing `ReferenceMaterials` describes as
              what makes the two read as a heading and its caption rather than
              two labels.

              This carried `.t-label` for both, with a comment claiming the
              other panels did the same. They do not: `AccordionSection` and
              `SampleAnswersAccordion` both set their name in `.t-section`, and
              on a phone all five panels stack in one column where this was the
              only one labelling itself differently. A span rather than a
              heading element is still right — the row IS the disclosure. */}
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
                className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-500 ${
                  isCollapsed ? '' : 'rotate-180 text-slate-900 dark:text-white'
                }`}
              />
            )}
          </div>
        </button>

        <div
          id={panelId}
          inert={isCollapsed || resting}
          className={`grid transition-all duration-500 ease-in-out ${
            isCollapsed || resting ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'
          }`}
        >
          <div className="overflow-hidden">
            {/* No per-row entrance. The panel's own open animation already
                shows the list arriving; staggering each line on top of it was
                two pieces of motion for one event. */}
            <ul className="flex flex-col gap-3 px-5 pt-1 pb-4">
              {insights.map((insight) => {
                const tone = TONE_STYLES[insight.tone];
                const ToneIcon = tone.Icon;
                return (
                  <li
                    key={insight.id}
                    className={`flex items-start gap-3 border-l-2 pl-3 py-0.5 ${tone.rule}`}
                  >
                    <ToneIcon className={`w-4 h-4 mt-0.5 shrink-0 ${tone.icon}`} />
                    <span className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                      {insight.message}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    );
  }
);

DraftCheck.displayName = 'DraftCheck';
export default DraftCheck;
