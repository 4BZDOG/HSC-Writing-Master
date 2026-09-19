import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CourseOutcome } from '../types';
import { explainOutcomeInContext } from '../services/geminiService';
import { AICache } from '../services/aiCache';
import {
  renderFormattedText,
  getBandRgb,
  getTierScaleConfig,
  BAND_HEX,
} from '../utils/renderUtils';
import { AlertCircle, Target, X, Loader2, ChevronRight, RefreshCw } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { getCommandTermInfo, getTargetBand } from '../data/commandTerms';
import { isFeatureLocked } from '../services/entitlements';
import { ContentLockOverlay, PlusLockChip } from './UpgradeModal';
import type { PromptVerb } from '../types';
import { PROSE_BLOCK, PROSE_FLOW } from '../utils/prose';

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

  const bandConfig = useMemo(() => getTierScaleConfig(tier), [tier]);
  const verbInfo = useMemo(() => (verb ? getCommandTermInfo(verb) : null), [verb]);
  const targetBand = useMemo(
    () => (totalMarks && verbInfo ? getTargetBand(totalMarks, verbInfo.tier) : tier),
    [totalMarks, verbInfo, tier]
  );
  const bandHex = BAND_HEX[targetBand as keyof typeof BAND_HEX] || BAND_HEX[3];

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

  return createPortal(
    <div
      className="fixed inset-0 bg-black/60 light:bg-black/40 backdrop-blur-sm flex items-center justify-center z-modal p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Syllabus outcome ${activeOutcome.code}`}
        // `max-w-xl`, not `2xl`. The briefing ran 95-100 characters against
        // DesignSpec §4's measure rule, and the whole dialog is a reading
        // surface — question, outcome statement, briefing — so the container is
        // the thing that was too wide. §4 also records that capping the text
        // inside a wide card was tried elsewhere and reverted: it reads as a
        // defect rather than a margin. At 576px the briefing measures ~77.
        className="clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-surface shadow-lg light:shadow-lg w-full max-w-xl border border-white/10 light:border-slate-200 animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className={`px-5 sm:px-6 pt-4 ${hasTabs ? 'pb-0' : 'pb-4'} border-b border-white/10 light:border-slate-200 bg-gradient-to-r ${bandConfig.gradient} relative overflow-hidden flex-shrink-0`}
        >
          <div
            className="absolute inset-0 opacity-[0.06] mix-blend-overlay pointer-events-none"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center border border-white/20 flex-shrink-0">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-black text-white tracking-tight leading-tight">
                  {activeOutcome.code}
                </h2>
                <p className="t-label text-white/60 mt-0.5">
                  {hasTabs
                    ? `Outcome ${activeIndex + 1} of ${outcomes.length}`
                    : 'Syllabus Outcome'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 transition-colors flex items-center justify-center flex-shrink-0"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>

          {/* One tab per linked outcome. A tick marks the ones already
              analysed, so it is obvious which are ready to compare. */}
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
                    role="tab"
                    id={`outcome-tab-${outcome.code}`}
                    aria-selected={isActive}
                    aria-controls={`outcome-panel-${outcome.code}`}
                    tabIndex={isActive ? 0 : -1}
                    title={outcome.description}
                    onClick={() => setActiveCode(outcome.code)}
                    className={`px-3.5 py-2 rounded-t-xl text-xs font-black tracking-tight whitespace-nowrap transition-all flex items-center gap-1.5 border-b-2 ${
                      isActive
                        ? 'bg-[rgb(var(--color-bg-surface))] light:bg-white text-[rgb(var(--color-text-primary))] light:text-slate-900 border-transparent shadow-sm'
                        : 'text-white/70 hover:text-white hover:bg-white/10 border-transparent'
                    }`}
                  >
                    {outcome.code}
                    {outcomeState?.status === 'loading' && (
                      <Loader2 className="w-3 h-3 animate-spin opacity-70" />
                    )}
                    {outcomeState?.status === 'ready' && !isActive && (
                      <span
                        className="w-1.5 h-1.5 rounded-full bg-emerald-400"
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
        </div>

        {/* Body — a reading document, not a stack of cards.
          It was four bordered blocks of equal weight: the question, the
          outcome statement, the briefing and the footer. Nothing said which of
          them a student had come here to read. Now the question frames, the
          outcome statement is the one tinted thing on the page, and the
          briefing is prose under it. */}
        <div
          role="tabpanel"
          id={`outcome-panel-${activeOutcome.code}`}
          aria-labelledby={`outcome-tab-${activeOutcome.code}`}
          className="px-5 sm:px-6 py-5 overflow-y-auto flex-1"
        >
          {/* The question this outcome is being read against. */}
          {breadcrumb && breadcrumb.length > 0 && (
            <div className="flex items-center gap-1 mb-2 flex-wrap">
              {breadcrumb.map((crumb, i) => (
                <React.Fragment key={i}>
                  {i > 0 && (
                    <ChevronRight className="w-3 h-3 text-[rgb(var(--color-text-dim))] light:text-slate-500 flex-shrink-0" />
                  )}
                  <span className="t-label text-[rgb(var(--color-text-dim))] light:text-slate-500 truncate max-w-[140px]">
                    {crumb}
                  </span>
                </React.Fragment>
              ))}
            </div>
          )}
          {/* The question, balanced: it is a single sentence read as one unit,
              and set against the outcome statement below it — which is also
              balanced — an even rag is what makes the two read as a pair. */}
          <p
            className={`text-sm font-semibold ${PROSE_BLOCK} text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-snug`}
          >
            {question}
          </p>
          {verb && totalMarks && (
            <div className="flex items-center gap-2 mt-2">
              <span
                className="t-label px-2 py-0.5 rounded-lg text-white"
                style={{ backgroundColor: bandHex }}
              >
                {verbInfo?.term || verb}
              </span>
              <span className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500">
                {totalMarks} {totalMarks === 1 ? 'mark' : 'marks'} · Band {targetBand}
              </span>
            </div>
          )}

          <div
            aria-hidden="true"
            className="my-5 h-px bg-[rgb(var(--color-border-secondary))] light:bg-slate-200"
          />

          {/* The outcome statement, and the only tinted thing in the dialog.
              Its heading used to read "What Students Must Demonstrate" — a
              label written in the third person to the one person reading it,
              set above the sentence it was describing. The heading now says
              whose job this is, which the syllabus wording beneath it cannot:
              NESA writes about students, and the reader IS the student.

              Set in Newsreader because it is quoted verbatim from the
              syllabus, in the same face the writing surface and the exemplars
              use for the exam paper's own voice. */}
          <h3 className="t-section text-[rgb(var(--color-text-muted))] light:text-slate-500">
            What you have to show
          </h3>
          <p
            style={{ '--band-rgb': getBandRgb(tier) } as React.CSSProperties}
            className={`mt-2.5 rounded-xl border band-edge ${bandConfig.bg} px-4 py-3.5 font-serif italic ${PROSE_BLOCK} text-base sm:text-lg leading-relaxed text-[rgb(var(--color-text-primary))] light:text-slate-800`}
          >
            {activeOutcome.description}
          </p>

          {/* The briefing. */}
          <div className="relative mt-6">
            <div className="flex items-center gap-2 mb-3">
              {/* No glyph. A Sparkles sat here, which is the generic mark for
                  "AI did this" and the one the design review already retired
                  from the login hero — and it was the fourth thing, after a
                  heading, a position and a rule, saying "this is a section". */}
              <h3 className="t-section text-[rgb(var(--color-text-muted))] light:text-slate-500">
                How this outcome shows up in your answer
              </h3>
              {briefingLocked && <PlusLockChip feature="outcomeBriefing" className="ml-auto" />}
              {!briefingLocked && state.status === 'ready' && (
                <button
                  onClick={() => fetchExplanation(activeOutcome, { force: true })}
                  title="Ask again"
                  aria-label={`Regenerate the analysis for ${activeOutcome.code}`}
                  className="ml-auto p-1.5 rounded-lg text-[rgb(var(--color-text-dim))] hover:text-[rgb(var(--color-text-primary))] hover:bg-white/10 light:hover:bg-slate-100 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {briefingLocked && (
              <ContentLockOverlay
                feature="outcomeBriefing"
                message="Outcome briefings are a Plus feature"
                className="rounded-xl"
              />
            )}

            <div className={`min-h-[100px] ${briefingLocked ? 'select-none' : ''}`}>
              {briefingLocked ? (
                // A shape to sell, not a blur of nothing: locked, the panel
                // shows the three questions the briefing answers, so what Plus
                // buys is legible before it is bought.
                <ul
                  aria-hidden="true"
                  className="space-y-2.5 text-[13px] font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-500 blur-[1.5px]"
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
                  <Loader2 className={`w-6 h-6 animate-spin ${bandConfig.text}`} />
                  <p className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    Reading this outcome against your question
                  </p>
                </div>
              ) : state.status === 'error' ? (
                <div className="bg-red-500/10 light:bg-red-50 p-3 rounded-xl border border-red-500/20 light:border-red-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 light:text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-red-300 light:text-red-700">
                      The briefing did not load
                    </p>
                    {/* The syllabus wording above is on screen and unaffected —
                        which is the question a failed panel actually raises. */}
                    <p
                      className={`text-[11px] ${PROSE_FLOW} text-red-400/90 light:text-red-600 mt-0.5 leading-relaxed`}
                    >
                      {state.message} The outcome itself is above, unchanged.
                    </p>
                    <button
                      onClick={() => fetchExplanation(activeOutcome, { force: true })}
                      className="mt-1.5 text-[11px] font-bold text-red-300 light:text-red-600 hover:text-white light:hover:text-red-800 underline"
                    >
                      Try again
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`text-[13px] ${PROSE_FLOW} text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed animate-fade-in`}
                >
                  {state.text ? renderFormattedText(state.text) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer — only when there is somewhere to go.
          It used to hold a gradient-filled "Close" styled as a primary action,
          in a dialog whose only job is to be read, beside a ✕ that already
          closed it: two closes, one of them dressed as the thing to do next.
          Escape and the backdrop close it too. The arrows on "← Previous" and
          "Next →" are the pattern DesignSpec §5 retires — a button already
          says what pressing it does. */}
        {hasTabs && (
          <div className="px-5 sm:px-6 py-3 bg-[rgb(var(--color-bg-surface-inset))]/20 light:bg-slate-50 border-t border-white/5 light:border-slate-200 flex items-center justify-end gap-1.5 rounded-b-surface-inner flex-shrink-0">
            <button
              onClick={() => focusTab(activeIndex - 1)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:bg-white/10 light:hover:bg-slate-200 transition-colors"
            >
              Previous outcome
            </button>
            <button
              onClick={() => focusTab(activeIndex + 1)}
              className="px-3 py-1.5 rounded-lg text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:bg-white/10 light:hover:bg-slate-200 transition-colors"
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
