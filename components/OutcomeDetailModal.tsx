import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CourseOutcome } from '../types';
import { explainOutcomeInContext } from '../services/geminiService';
import { renderFormattedText, getTierScaleConfig, BAND_HEX } from '../utils/renderUtils';
import {
  AlertCircle,
  Target,
  X,
  Sparkles,
  Loader2,
  FileQuestion,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { getCommandTermInfo, getTargetBand } from '../data/commandTerms';
import { isFeatureLocked } from '../services/entitlements';
import { ContentLockOverlay, PlusLockChip } from './UpgradeModal';
import type { PromptVerb } from '../types';

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
  // the explanations are question-specific, so they must not outlive the modal.
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
      try {
        const text = await explainOutcomeInContext(question, outcome);
        setExplanations((prev) => ({ ...prev, [outcome.code]: { status: 'ready', text } }));
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
      className="fixed inset-0 bg-black/60 light:bg-black/40 backdrop-blur-sm flex items-center justify-center z-[100] p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Syllabus outcome ${activeOutcome.code}`}
        className="clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-[28px] shadow-2xl light:shadow-xl w-full max-w-2xl border border-white/10 light:border-slate-200 animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
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
                <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-white/60 mt-0.5">
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

        {/* Body */}
        <div
          role="tabpanel"
          id={`outcome-panel-${activeOutcome.code}`}
          aria-labelledby={`outcome-tab-${activeOutcome.code}`}
          className="px-5 sm:px-6 py-5 space-y-4 overflow-y-auto flex-1"
        >
          {/* Question context */}
          <div className="rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 border border-white/5 light:border-slate-200 p-4">
            {breadcrumb && breadcrumb.length > 0 && (
              <div className="flex items-center gap-1 mb-2 flex-wrap">
                {breadcrumb.map((crumb, i) => (
                  <React.Fragment key={i}>
                    {i > 0 && (
                      <ChevronRight className="w-3 h-3 text-[rgb(var(--color-text-dim))] light:text-slate-500 flex-shrink-0" />
                    )}
                    <span className="text-[10px] font-bold text-[rgb(var(--color-text-dim))] light:text-slate-500 uppercase tracking-wider truncate max-w-[140px]">
                      {crumb}
                    </span>
                  </React.Fragment>
                ))}
              </div>
            )}
            <div className="flex items-start gap-3">
              <FileQuestion className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 flex-shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-snug">
                  {question}
                </p>
                {verb && totalMarks && (
                  <div className="flex items-center gap-2 mt-2">
                    <span
                      className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md text-white"
                      style={{ backgroundColor: bandHex }}
                    >
                      {verbInfo?.term || verb}
                    </span>
                    <span className="text-[10px] font-bold text-[rgb(var(--color-text-muted))] light:text-slate-500">
                      {totalMarks} {totalMarks === 1 ? 'mark' : 'marks'} · Band {targetBand}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Outcome description */}
          <div className={`rounded-xl border ${bandConfig.border} ${bandConfig.bg} p-4`}>
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-2">
              What Students Must Demonstrate
            </p>
            <div className="flex items-start gap-3">
              <Target className={`w-4 h-4 ${bandConfig.text} flex-shrink-0 mt-0.5`} />
              <p className="text-[rgb(var(--color-text-primary))] light:text-slate-800 text-sm sm:text-base leading-relaxed font-semibold italic">
                {activeOutcome.description}
              </p>
            </div>
          </div>

          {/* AI relevance */}
          <div className="relative">
            <div className="flex items-center gap-2 mb-3">
              <div
                className={`w-6 h-6 rounded-md ${bandConfig.bg} flex items-center justify-center`}
              >
                <Sparkles className={`w-3 h-3 ${bandConfig.text}`} />
              </div>
              <span className="text-xs font-black text-[rgb(var(--color-text-primary))] light:text-slate-800 tracking-tight">
                How {activeOutcome.code} Connects To This Question
              </span>
              {briefingLocked && <PlusLockChip feature="outcomeBriefing" className="ml-auto" />}
              {!briefingLocked && state.status === 'ready' && (
                <button
                  onClick={() => fetchExplanation(activeOutcome, { force: true })}
                  title="Ask again"
                  aria-label={`Regenerate the analysis for ${activeOutcome.code}`}
                  className="ml-auto p-1.5 rounded-md text-[rgb(var(--color-text-dim))] hover:text-[rgb(var(--color-text-primary))] hover:bg-white/10 light:hover:bg-slate-100 transition-colors"
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

            <div
              className={`bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 p-4 rounded-xl border border-white/5 light:border-slate-200 min-h-[100px] ${
                briefingLocked ? 'select-none' : ''
              }`}
            >
              {briefingLocked ? (
                // A shape to sell, not a blur of nothing: locked, the panel
                // shows the three headings the briefing answers under, so what
                // Plus buys is legible before it is bought.
                <ul
                  aria-hidden="true"
                  className="space-y-2.5 text-[13px] text-[rgb(var(--color-text-muted))] light:text-slate-500 blur-[1.5px] opacity-70"
                >
                  <li className="font-bold">What this outcome is asking for</li>
                  <li className="font-bold">What a marker looks for here</li>
                  <li className="font-bold">How to show it in your answer</li>
                </ul>
              ) : state.status === 'loading' || state.status === 'idle' ? (
                <div className="flex flex-col items-center justify-center h-28 gap-2.5">
                  <Loader2 className={`w-6 h-6 animate-spin ${bandConfig.text}`} />
                  <p
                    className={`text-[10px] font-black uppercase tracking-[0.15em] ${bandConfig.text} opacity-60 animate-pulse`}
                  >
                    Analysing context...
                  </p>
                </div>
              ) : state.status === 'error' ? (
                <div className="bg-red-500/10 light:bg-red-50 p-3 rounded-lg border border-red-500/20 light:border-red-200 flex items-start gap-2.5">
                  <AlertCircle className="w-4 h-4 text-red-400 light:text-red-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-xs text-red-300 light:text-red-700 font-bold">
                      Analysis Failed
                    </p>
                    <p className="text-[11px] text-red-400/70 light:text-red-600/70 mt-0.5">
                      {state.message}
                    </p>
                    <button
                      onClick={() => fetchExplanation(activeOutcome, { force: true })}
                      className="mt-1.5 text-[11px] font-bold text-red-300 light:text-red-600 hover:text-white light:hover:text-red-800 underline"
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-[13px] text-[rgb(var(--color-text-secondary))] light:text-slate-600 leading-relaxed animate-fade-in">
                  {state.text ? renderFormattedText(state.text) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 sm:px-6 py-3 bg-[rgb(var(--color-bg-surface-inset))]/20 light:bg-slate-50 border-t border-white/5 light:border-slate-200 flex items-center justify-between gap-3 rounded-b-[28px] flex-shrink-0">
          {hasTabs ? (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => focusTab(activeIndex - 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:bg-white/10 light:hover:bg-slate-200 transition-colors"
              >
                ← Previous
              </button>
              <button
                onClick={() => focusTab(activeIndex + 1)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-600 hover:bg-white/10 light:hover:bg-slate-200 transition-colors"
              >
                Next →
              </button>
            </div>
          ) : (
            <span />
          )}
          <button
            onClick={onClose}
            className={`py-2 px-5 rounded-lg font-bold text-sm text-white tracking-tight bg-gradient-to-r ${bandConfig.gradient} hover:shadow-lg active:scale-[0.98] transition-all`}
          >
            Close
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default OutcomeDetailModal;
