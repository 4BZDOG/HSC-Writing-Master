import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useBackdropDismiss } from '../hooks/useBackdropDismiss';
import { CourseOutcome } from '../types';
import { explainOutcomeInContext } from '../services/geminiService';
import { AICache } from '../services/aiCache';
import { renderFormattedText, getBandConfig } from '../utils/renderUtils';
import { AlertCircle, Target, X, Loader2, ChevronRight, RefreshCw } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { getCommandTermInfo, getTargetBand } from '../data/commandTerms';
import { isFeatureLocked, planLabelForFeature } from '../services/entitlements';
import { ContentLockOverlay, PlusLockChip } from './UpgradeModal';
import type { PromptVerb } from '../types';
import { PROSE_BLOCK } from '../utils/prose';
import { parseOutcomeBriefing } from '../utils/outcomeBriefing';
import { yearShortLabel } from '../utils/syllabusYear';
import {
  HERO_HEAD_WASH,
  HERO_TILE,
  LADDER_NOTE,
  LADDER_SOLID,
  LADDER_TOOL,
} from '../utils/ladderChrome';
import { ladderBandVars } from './LadderRow';

interface OutcomeDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Every outcome linked to this question — one tab each. */
  outcomes: CourseOutcome[];
  /** The outcome that was clicked; opens on its tab. */
  initialCode?: string;
  question: string;
  tier?: number;
  verb?: PromptVerb;
  totalMarks?: number;
  breadcrumb?: string[];
}

/** Per-outcome state, so switching tabs never discards or refetches work. */
type ExplanationState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; text: string }
  | { status: 'error'; message: string };

const headingClass = 'text-sm font-semibold text-[rgb(var(--color-text-primary))]';
const sectionClass = 'mt-7 first:mt-0';

/**
 * The briefing, set as its own blocks: one per heading the model wrote, each with
 * a rule down its left edge, the way the ladder sets a note. Text the model
 * wrote without headings is kept whole, above the blocks, rather than dropped.
 */
const BriefingText: React.FC<{ text: string }> = ({ text }) => {
  const { lead, sections } = useMemo(() => parseOutcomeBriefing(text), [text]);
  return (
    <div className="flex flex-col gap-4 animate-fade-in">
      {lead && (
        <div className="t-body text-[rgb(var(--color-text-secondary))]">
          {renderFormattedText(lead)}
        </div>
      )}
      {sections.map((section) => (
        <section key={section.heading} className={LADDER_NOTE}>
          <div className="min-w-0">
            <h4 className={headingClass}>{section.heading}</h4>
            <div className="mt-1 t-body text-[rgb(var(--color-text-secondary))]">
              {renderFormattedText(section.body)}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
};

const OutcomeDetailModal: React.FC<OutcomeDetailModalProps> = ({
  isOpen,
  onClose,
  outcomes,
  initialCode,
  question,
  tier = 3,
  verb,
  totalMarks,
  breadcrumb,
}) => {
  useEscapeKey(isOpen, onClose);
  // Tab stays inside the dialog while it is open, and focus returns to
  // whatever opened it on close. Partners `useEscapeKey` — same stack,
  // same topmost-only arbitration.
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);
  const backdrop = useBackdropDismiss(onClose);

  const [activeCode, setActiveCode] = useState(initialCode ?? outcomes[0]?.code);
  // Keyed by outcome code. An explanation costs an AI call, so once fetched it
  // is kept for the life of the modal — flicking between tabs to compare is
  // the whole point of them, and it must not re-bill every switch.
  const [explanations, setExplanations] = useState<Record<string, ExplanationState>>({});
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  // Codes already requested this session. A ref, not derived from state, so
  // the guard is exact under StrictMode's double-invoked effects — reading
  // `explanations` here instead would make fetchExplanation change identity on
  // every fetch and re-trigger the effect that calls it.
  const requested = useRef<Set<string>>(new Set());

  const activeIndex = Math.max(
    0,
    outcomes.findIndex((o) => o.code === activeCode)
  );
  const activeOutcome = outcomes[activeIndex];

  const verbInfo = useMemo(() => (verb ? getCommandTermInfo(verb) : null), [verb]);
  // The band this question reaches at full marks. It colours the whole brief, so
  // the head, the verb chip and the ladder notes agree with the question's card.
  const targetBand = useMemo(
    () => (totalMarks && verbInfo ? getTargetBand(totalMarks, verbInfo.tier) : tier),
    [totalMarks, verbInfo, tier]
  );
  const bandConfig = useMemo(() => getBandConfig(targetBand), [targetBand]);

  // Identity-independent key for the tab set. `outcomes` is rebuilt by its
  // parent's useMemo, so depending on the array itself would reset the modal on
  // any render that happened to produce a new reference.
  const outcomeKey = outcomes.map((o) => o.code).join('|');

  // The briefing is the paid half of this modal. The outcome's own syllabus
  // wording above it stays free — a student has to be able to read what is
  // being assessed — so the lock covers the AI panel alone, and locked means
  // NO call is fired: the server refuses it anyway, and a spinner that ends in
  // a 402 is a worse way to learn the price than a chip that says it up front.
  const briefingLocked = isFeatureLocked('outcomeBriefing');

  // Re-open on whichever outcome was clicked, and start from a clean slate:
  // the explanations are question-specific, so they must not outlive the modal
  // IN MEMORY. They do outlive it on disk — `fetchExplanation` reads the cache
  // first, so a re-open of the same question refills instantly rather than
  // spending a second call. The reset stays because the modal can re-open on a
  // DIFFERENT question, and stale text under a new heading is worse than a
  // spinner.
  useEffect(() => {
    if (!isOpen) return;
    setActiveCode(initialCode ?? outcomeKey.split('|')[0]);
    setExplanations({});
    requested.current.clear();
  }, [isOpen, initialCode, outcomeKey]);

  const fetchExplanation = useCallback(
    async (outcome: CourseOutcome, { force = false } = {}) => {
      if (!force && requested.current.has(outcome.code)) return;
      requested.current.add(outcome.code);
      setExplanations((prev) => ({ ...prev, [outcome.code]: { status: 'loading' } }));

      const key = AICache.generateOutcomeBriefingKey(question, outcome.code);

      // The briefing for a given question and outcome is the same briefing every
      // time, so it is read back rather than bought again. `force` is the
      // student asking for a second opinion and deliberately skips the read —
      // but still writes, because the opinion they just paid for is the one they
      // should be shown next time.
      if (!force) {
        const cached = await AICache.get<string>(key);
        if (typeof cached === 'string' && cached) {
          setExplanations((prev) => ({
            ...prev,
            [outcome.code]: { status: 'ready', text: cached },
          }));
          return;
        }
      }

      try {
        const text = await explainOutcomeInContext(question, outcome);
        setExplanations((prev) => ({ ...prev, [outcome.code]: { status: 'ready', text } }));
        // Best-effort: a cache that cannot be written must never cost the
        // student the briefing they already have on screen.
        void AICache.set(key, text);
      } catch (err) {
        // The message is kept for the record, but it is not shown: a service
        // error reads as a fault in the student's device, and the panel says
        // what happened in plain words instead.
        const message = err instanceof Error ? err.message : 'Could not fetch explanation.';
        setExplanations((prev) => ({ ...prev, [outcome.code]: { status: 'error', message } }));
      }
    },
    [question]
  );

  // Only the visible tab is fetched — opening the modal must not fire an AI
  // call for every linked outcome at once.
  useEffect(() => {
    if (!isOpen || !activeOutcome || briefingLocked) return;
    void fetchExplanation(activeOutcome);
  }, [isOpen, activeOutcome, fetchExplanation, briefingLocked]);

  const focusTab = (index: number) => {
    const next = outcomes[(index + outcomes.length) % outcomes.length];
    if (!next) return;
    setActiveCode(next.code);
    tabRefs.current[next.code]?.focus();
  };

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      focusTab(activeIndex + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      focusTab(activeIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusTab(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusTab(outcomes.length - 1);
    }
  };

  if (!isOpen || !activeOutcome) return null;

  const state: ExplanationState = explanations[activeOutcome.code] ?? { status: 'idle' };
  const hasTabs = outcomes.length > 1;
  const year = activeOutcome.year ? yearShortLabel(activeOutcome.year) : null;
  const caption = [
    hasTabs ? `Outcome ${activeIndex + 1} of ${outcomes.length}` : 'Syllabus outcome',
    year,
  ]
    .filter(Boolean)
    .join(' · ');

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 light:bg-black/40 backdrop-blur-sm flex items-center justify-center z-modal p-4 sm:p-6"
      {...backdrop}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="outcome-brief-title"
        // `max-w-xl`, not `2xl`. The briefing ran 95-100 characters against
        // DesignSpec §4's measure rule, and the whole dialog is a reading
        // surface — question, outcome statement, briefing — so the container is
        // the thing that was too wide. §4 also records that capping the text
        // inside a wide card was tried elsewhere and reverted: it reads as a
        // defect rather than a margin. At 576px the briefing measures ~77.
        style={ladderBandVars(targetBand)}
        className="clip-stable w-full max-w-xl max-h-[90vh] flex flex-col rounded-surface border-2 band-edge bg-surface shadow-lg animate-fade-in-up overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* The head stays put while the body scrolls. Its tabs sit on its bottom
            edge, so the selected one opens onto the body beneath it. */}
        <header
          className={`${HERO_HEAD_WASH} flex-shrink-0 px-5 sm:px-6 pt-5 ${hasTabs ? 'pb-0' : 'pb-5'} border-b border-[rgb(var(--color-border-secondary))]`}
        >
          <div className="flex items-start gap-4">
            <div aria-hidden="true" className={`${HERO_TILE} ${LADDER_SOLID}`}>
              <Target className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="t-label text-[rgb(var(--color-text-muted))]">{caption}</p>
              <h2
                id="outcome-brief-title"
                className="t-display mt-1 text-3xl uppercase italic leading-none tracking-tight text-[rgb(var(--color-text-primary))]"
              >
                {activeOutcome.code}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex-shrink-0 flex items-center justify-center min-h-11 min-w-11 rounded-lg text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>

          {/* One tab per linked outcome. A dot marks the ones already analysed,
              so it is obvious which are ready to compare. Only the selected tab
              names a panel, because only that panel is in the page. */}
          {hasTabs && (
            <div
              role="tablist"
              aria-label="Linked syllabus outcomes"
              onKeyDown={onTabKeyDown}
              className="relative z-10 flex gap-1 mt-4 -mb-px overflow-x-auto scrollbar-none"
            >
              {outcomes.map((outcome, i) => {
                const isActive = outcome.code === activeOutcome.code;
                const outcomeState = explanations[outcome.code];
                return (
                  <button
                    key={outcome.code}
                    ref={(el) => {
                      tabRefs.current[outcome.code] = el;
                    }}
                    type="button"
                    role="tab"
                    id={`outcome-tab-${outcome.code}`}
                    aria-selected={isActive}
                    aria-controls={isActive ? `outcome-panel-${outcome.code}` : undefined}
                    tabIndex={isActive ? 0 : -1}
                    onClick={() => setActiveCode(outcome.code)}
                    className={`min-h-11 sm:min-h-0 sm:h-9 px-4 rounded-t-xl text-sm font-bold whitespace-nowrap inline-flex items-center gap-1.5 border border-b-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
                      isActive
                        ? 'bg-[rgb(var(--color-bg-surface))] border-[rgb(var(--color-border-secondary))] text-[rgb(var(--color-text-primary))]'
                        : 'border-transparent text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))]/60'
                    }`}
                  >
                    {outcome.code}
                    {outcomeState?.status === 'loading' && (
                      <Loader2 className="w-3 h-3 animate-spin opacity-70" aria-hidden="true" />
                    )}
                    {outcomeState?.status === 'ready' && !isActive && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-emerald-500"
                        aria-hidden="true"
                      />
                    )}
                    <span className="sr-only">
                      {i + 1} of {outcomes.length}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </header>

        {/* Body: the question this outcome is read against, the outcome itself,
            then the briefing. */}
        <div
          role="tabpanel"
          id={`outcome-panel-${activeOutcome.code}`}
          aria-labelledby={`outcome-tab-${activeOutcome.code}`}
          tabIndex={0}
          className="flex-1 overflow-y-auto px-5 sm:px-6 py-5 pb-8"
        >
          <div className="rounded-xl bg-[rgb(var(--color-bg-surface-inset))] px-4 py-3.5">
            {breadcrumb && breadcrumb.length > 0 && (
              <div className="flex items-center gap-1 mb-2 flex-wrap">
                {breadcrumb.map((crumb, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && (
                      <ChevronRight
                        className="w-3 h-3 text-[rgb(var(--color-text-dim))] flex-shrink-0"
                        aria-hidden="true"
                      />
                    )}
                    <span className="t-label text-[rgb(var(--color-text-dim))] truncate max-w-[140px]">
                      {crumb}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
            <p
              className={`text-sm sm:text-base font-semibold ${PROSE_BLOCK} leading-snug text-[rgb(var(--color-text-primary))]`}
            >
              {question}
            </p>
            {verb && totalMarks ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
                <span className={`t-label px-2 py-0.5 rounded-lg ${LADDER_SOLID}`}>
                  {verbInfo?.term || verb}
                </span>
                <span className="t-label text-[rgb(var(--color-text-muted))]">
                  {totalMarks} {totalMarks === 1 ? 'mark' : 'marks'} · Band {targetBand}
                </span>
              </div>
            ) : null}
          </div>

          {/* The outcome statement, quoted from the syllabus and set in the face
              the exam paper uses, so it reads as the source and not as advice.
              Its heading says whose job this is, which the wording beneath it
              cannot: NESA writes about students, and the reader IS the student. */}
          <section className={sectionClass}>
            <h3 className={headingClass}>What you have to show</h3>
            <p
              className={`mt-2 border-l-2 border-[rgb(var(--color-border-primary))] pl-4 font-serif italic ${PROSE_BLOCK} t-body text-[rgb(var(--color-text-primary))]`}
            >
              {activeOutcome.description}
            </p>
          </section>

          {/* The briefing. */}
          <section
            className={`${sectionClass} relative`}
            aria-labelledby="outcome-briefing-heading"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <h3 id="outcome-briefing-heading" className={`${headingClass} min-w-0`}>
                How this outcome shows up in your answer
              </h3>
              {briefingLocked && <PlusLockChip feature="outcomeBriefing" className="ml-auto" />}
              {!briefingLocked && state.status === 'ready' && (
                <button
                  type="button"
                  onClick={() => fetchExplanation(activeOutcome, { force: true })}
                  aria-label={`Ask again: regenerate the analysis for ${activeOutcome.code}`}
                  className={`${LADDER_TOOL} ml-auto whitespace-nowrap`}
                >
                  <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                  Ask again
                </button>
              )}
            </div>

            {briefingLocked && (
              <ContentLockOverlay
                feature="outcomeBriefing"
                message={`Outcome briefings are part of ${planLabelForFeature('outcomeBriefing')}`}
                className="rounded-xl"
              />
            )}

            <div className={`mt-3 min-h-[100px] ${briefingLocked ? 'select-none' : ''}`}>
              {briefingLocked ? (
                // A shape to sell, not a blur of nothing: locked, the panel
                // shows the three questions the briefing answers, so what Plus
                // buys is legible before it is bought.
                <ul
                  aria-hidden="true"
                  className="space-y-2.5 t-body font-semibold text-[rgb(var(--color-text-muted))] blur-[1.5px]"
                >
                  <li>What this outcome is asking of you</li>
                  <li>What a marker is looking for here</li>
                  <li>How to show it in your answer</li>
                </ul>
              ) : state.status === 'loading' || state.status === 'idle' ? (
                <div className="flex flex-col items-center justify-center h-24 gap-2.5">
                  {/* A spinner is motion that shows work happening. The text
                      beside it used to `animate-pulse`, which animates opacity
                      on a reading — the fault DesignSpec §2 rule 3 exists to
                      keep out. */}
                  <Loader2
                    className={`w-6 h-6 animate-spin ${bandConfig.text}`}
                    aria-hidden="true"
                  />
                  <p className="t-label text-[rgb(var(--color-text-muted))]">
                    Reading this outcome against your question
                  </p>
                </div>
              ) : state.status === 'error' ? (
                <div
                  role="alert"
                  className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/10 light:border-red-200 light:bg-red-50 p-4"
                >
                  <AlertCircle
                    className="w-4 h-4 mt-0.5 shrink-0 text-red-400 light:text-red-600"
                    aria-hidden="true"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-red-300 light:text-red-700">
                      The briefing did not load this time.
                    </p>
                    {/* The syllabus wording above is on screen and unaffected —
                        which is the question a failed panel actually raises. */}
                    <p className="mt-1 text-sm text-[rgb(var(--color-text-secondary))]">
                      The outcome above is unchanged. You can try again.
                    </p>
                    <button
                      type="button"
                      onClick={() => fetchExplanation(activeOutcome, { force: true })}
                      className={`${LADDER_TOOL} mt-3`}
                    >
                      Try again
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <BriefingText text={state.text} />
                  <p className="mt-4 t-label text-[rgb(var(--color-text-dim))]">
                    Written by AI from the syllabus outcome and this question. Check it against your
                    teacher&rsquo;s guidance.
                  </p>
                </>
              )}
            </div>
          </section>
        </div>

        {/* Footer — only when there is somewhere to go. The arrows the old
            buttons carried are gone: a button already says what pressing it
            does. Escape and the backdrop close the sheet too. */}
        {hasTabs && (
          <div className="px-5 sm:px-6 py-2 sm:py-3 bg-[rgb(var(--color-bg-surface-elevated))] border-t border-[rgb(var(--color-border-secondary))] flex items-center justify-end gap-2 rounded-b-surface-inner flex-shrink-0">
            <button
              type="button"
              onClick={() => focusTab(activeIndex - 1)}
              className="min-h-11 sm:min-h-0 px-4 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-bold text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors"
            >
              Previous outcome
            </button>
            <button
              type="button"
              onClick={() => focusTab(activeIndex + 1)}
              className="min-h-11 sm:min-h-0 px-4 py-2 sm:py-1.5 rounded-lg text-sm sm:text-xs font-bold text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-[rgb(var(--color-bg-surface-inset))] transition-colors"
            >
              Next outcome
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default OutcomeDetailModal;
