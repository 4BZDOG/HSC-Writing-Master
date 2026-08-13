import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { CourseOutcome, Prompt, PromptVerb } from '../types';
import { refineManualPrompt } from '../services/geminiService';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { getTierBandConfig, getTierScaleConfig, renderFormattedText } from '../utils/renderUtils';
import {
  getCommandTermsForMarks,
  getCommandTermInfo,
  getTargetBand,
  commandTermsList,
  TIER_GROUPS,
} from '../data/commandTerms';
import {
  X,
  Sparkles,
  PenTool,
  Save,
  Wand2,
  Target,
  Loader2,
  AlertTriangle,
  Brain,
  Briefcase,
  Link2,
  Landmark,
  ChevronRight,
  Check,
  Tag,
  ListChecks,
} from 'lucide-react';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import DiscardConfirmBar from './DiscardConfirmBar';
import { useScrollLock } from '../hooks/useScrollLock';
import { getPastHscLabel } from '../utils/pastHscUtils';

interface ManualPromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (prompt: Prompt) => void;
  courseName: string;
  topicName: string;
  outcomes: CourseOutcome[];
  /** The syllabus dot point the question will be filed under, when one is
   *  selected. Passed to the model so the stem sits inside the syllabus
   *  content rather than merely near it. */
  dotPoint?: string;
  subTopicName?: string;
}

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v12M0 1h12' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

/** Section shell — one heading vocabulary for every control group. */
const Section: React.FC<{
  icon: React.ElementType;
  iconClass: string;
  eyebrow: string;
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}> = ({ icon: Icon, iconClass, eyebrow, title, action, children }) => (
  <section className="p-6 rounded-[24px] bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200">
    <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
      <div className="flex flex-col gap-1 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-white/20 light:text-slate-500">
          {eyebrow}
        </span>
        <h4 className="text-sm font-bold text-white light:text-slate-900 uppercase tracking-widest flex items-center gap-3">
          <Icon className={`w-5 h-5 ${iconClass}`} /> {title}
        </h4>
      </div>
      {action}
    </div>
    {children}
  </section>
);

/** The switch used by every on/off control here and in the AI generator. */
const Toggle: React.FC<{
  checked: boolean;
  onChange: () => void;
  onLabel: string;
  offLabel: string;
  title: string;
  accent?: 'blue' | 'amber';
}> = ({ checked, onChange, onLabel, offLabel, title, accent = 'blue' }) => {
  const on =
    accent === 'amber'
      ? 'bg-amber-500/10 border-amber-500/30 text-amber-300 light:text-amber-700'
      : 'bg-blue-500/10 border-blue-500/30 text-blue-300 light:text-blue-600';
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      title={title}
      className={`flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-full border transition-all flex-shrink-0 ${
        checked
          ? on
          : 'bg-white/[0.03] light:bg-slate-100 border-white/10 light:border-slate-300 text-slate-400 light:text-slate-600'
      }`}
    >
      <span className="text-[9px] font-black uppercase tracking-widest">
        {checked ? onLabel : offLabel}
      </span>
      <span
        className={`relative w-9 h-5 rounded-full transition-colors ${
          checked ? (accent === 'amber' ? 'bg-amber-500' : 'bg-blue-500') : 'bg-slate-600'
        }`}
      >
        <span
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[1.15rem]' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
};

const currentHscYear = () => new Date().getFullYear();

/** How many mark-appropriate verbs to show before the "+N more" disclosure. */
const LEAD_VERB_COUNT = 6;

const ManualPromptModal: React.FC<ManualPromptModalProps> = ({
  isOpen,
  onClose,
  onSave,
  courseName,
  topicName,
  outcomes,
  dotPoint,
  subTopicName,
}) => {
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [draftQuestion, setDraftQuestion] = useState('');
  const [marks, setMarks] = useState<number>(5); // Default to 5 marks
  // null = let the AI choose a verb for the mark value; a term pins it.
  const [pinnedVerb, setPinnedVerb] = useState<PromptVerb | null>(null);
  const [showAllVerbs, setShowAllVerbs] = useState(false);
  const [includeScenario, setIncludeScenario] = useState(true);
  const [pinnedOutcomes, setPinnedOutcomes] = useState<string[]>([]);
  const [isPastHSC, setIsPastHSC] = useState(false);
  const [hscYear, setHscYear] = useState<string>(String(currentHscYear() - 1));
  const [hscQuestionNumber, setHscQuestionNumber] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [result, setResult] = useState<Prompt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Step 2 is a draft, not a receipt: the AI's wording is editable before it
  // reaches the syllabus, so a teacher who wants one clause changed does not
  // have to re-run the whole refinement and lose everything else it produced.
  const [editedQuestion, setEditedQuestion] = useState('');
  const [editedScenario, setEditedScenario] = useState('');
  const [editedCriteria, setEditedCriteria] = useState('');

  useEffect(() => {
    setMounted(true);
    return () => {
      setMounted(false);
    };
  }, []);

  const resetAll = () => {
    setDraftQuestion('');
    setMarks(5);
    setPinnedVerb(null);
    setShowAllVerbs(false);
    setIncludeScenario(true);
    setPinnedOutcomes([]);
    setIsPastHSC(false);
    setHscYear(String(currentHscYear() - 1));
    setHscQuestionNumber('');
    setStep('input');
    setResult(null);
    setError(null);
  };

  const handleClose = () => {
    if (isRefining) return;
    resetAll();
    onClose();
  };

  // A hand-written question is typing nobody wants to do twice, and the
  // backdrop is a large target sitting exactly where the pointer travels
  // between the page and the dialog. Same rule as the import modals: a stray
  // click is inert while there is something to lose, and the deliberate ways
  // out ask once.
  const hasWork = draftQuestion.trim().length > 0 || !!result;
  const guard = useDiscardGuard(isOpen, hasWork, handleClose);

  // Escape asks before discarding, and never interrupts a refinement.
  useEscapeKey(isOpen && !isRefining, guard.requestClose);
  // Tab stays inside the dialog while it is open, and focus returns to
  // whatever opened it on close. Partners `useEscapeKey` — same stack,
  // same topmost-only arbitration.
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  const handleRefine = async () => {
    if (!draftQuestion.trim()) {
      setError('Please enter a draft question first.');
      return;
    }
    // Refining is a plan-gated AI Content Studio call. Checked here so a
    // deployment that prices the studio above this caller's plan opens the
    // upgrade prompt, rather than surfacing the proxy's 402 as an inline error
    // with nothing to act on. Manual entry itself stays open — only the AI
    // pass over it is sold.
    if (isFeatureLocked('aiContentStudio')) {
      requestUpgrade('aiContentStudio');
      return;
    }

    setIsRefining(true);
    setError(null);

    try {
      const refinedPrompt = await refineManualPrompt(
        draftQuestion,
        courseName,
        topicName,
        outcomes,
        marks,
        { verb: pinnedVerb, includeScenario, pinnedOutcomes, dotPoint, subTopicName }
      );
      setResult(refinedPrompt);
      setEditedQuestion(refinedPrompt.question);
      setEditedScenario(refinedPrompt.scenario || '');
      setEditedCriteria(refinedPrompt.markingCriteria || '');
      setStep('preview');
    } catch (err) {
      console.error('[ManualPromptModal] Refinement failed:', err);
      setError(err instanceof Error ? err.message : 'Refinement failed.');
    } finally {
      setIsRefining(false);
    }
  };

  const handleConfirm = () => {
    if (!result) return;
    const year = Number(hscYear);
    onSave({
      ...result,
      question: editedQuestion.trim() || result.question,
      scenario: includeScenario ? editedScenario.trim() : '',
      markingCriteria: editedCriteria.trim() || result.markingCriteria,
      isPastHSC,
      hscYear: isPastHSC && Number.isFinite(year) && year > 0 ? year : undefined,
      hscQuestionNumber:
        isPastHSC && hscQuestionNumber.trim() ? hscQuestionNumber.trim() : undefined,
    });
    handleClose();
  };

  // Preview which verb tier the AI will target for this mark value — the
  // same heuristic (getCommandTermsForMarks) the generators and audit studio
  // use, so "AI will select a verb to match this difficulty" is concrete
  // rather than a promise. (Must run before the early returns: hooks rule.)
  const { terms: markAppropriateVerbs, primaryTerm: suggestedVerb } = useMemo(
    () => getCommandTermsForMarks(marks),
    [marks]
  );

  // Whichever verb the question will actually carry: the pinned one if there
  // is one, otherwise the AI's most likely pick. Everything that reads as a
  // consequence of the verb — tier colour, band ceiling, mark range — is
  // derived from this single value so the preview cannot contradict itself.
  const activeVerb = useMemo(
    () => (pinnedVerb ? getCommandTermInfo(pinnedVerb) : suggestedVerb),
    [pinnedVerb, suggestedVerb]
  );
  const activeTierInfo = TIER_GROUPS.find((t) => t.tier === activeVerb.tier);
  const markTierConfig = getTierBandConfig(activeVerb.tier);
  const markBandColor = markTierConfig.text;
  const markGradient = markTierConfig.gradient;
  const ceilingBand = getTargetBand(marks, activeVerb.tier);
  const outOfRange = marks < activeVerb.markRange[0] || marks > activeVerb.markRange[1];

  // The verbs that suit this mark value lead, but only the closest few: at 5
  // marks sixteen of them qualify, which is three rows of identical grey chips
  // — a list to wade through rather than a choice to make. The rest sit behind
  // a disclosure, because deliberately pairing an unusual verb with a mark
  // value is a valid thing to want, just not the thing to lead with.
  // `getCommandTermsForMarks` already sorts by closeness to the target tier.
  const [leadVerbs, otherVerbs] = useMemo(() => {
    const lead = markAppropriateVerbs.slice(0, LEAD_VERB_COUNT);
    const leading = new Set(lead.map((v) => v.term));
    return [lead, commandTermsList.filter((v) => !leading.has(v.term))];
  }, [markAppropriateVerbs]);

  const previewPastHsc = useMemo(
    () =>
      getPastHscLabel({
        isPastHSC,
        hscYear: Number(hscYear) || undefined,
        hscQuestionNumber: hscQuestionNumber.trim() || undefined,
      } as Prompt),
    [isPastHSC, hscYear, hscQuestionNumber]
  );

  const toggleOutcome = (code: string) =>
    setPinnedOutcomes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );

  // --- Safety Checks ---

  if (!isOpen) return null;
  if (!mounted) return null;
  if (typeof document === 'undefined') return null;

  const targetContainer = document.body;
  if (!targetContainer) return null;

  const verbButton = (info: (typeof commandTermsList)[number], pinned: boolean) => {
    const config = getTierScaleConfig(info.tier);
    return (
      <button
        key={info.term}
        type="button"
        aria-pressed={pinned}
        onClick={() => setPinnedVerb(pinned ? null : (info.term as PromptVerb))}
        title={`${info.definition} · typical range ${info.markRange[0]}–${info.markRange[1]} marks`}
        className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
          pinned
            ? `${config.bg} ${config.border} ${config.text} shadow-lg scale-[1.03]`
            : 'bg-white/[0.03] light:bg-white border-white/10 light:border-slate-300 text-slate-400 light:text-slate-600 hover:text-white light:hover:text-slate-900 hover:border-white/25'
        }`}
      >
        {info.term}
      </button>
    );
  };

  try {
    return createPortal(
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4 transition-all duration-300"
        onClick={guard.requestCloseFromBackdrop}
      >
        <div
          ref={dialogRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="manual-prompt-title"
          className={`
                        bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-[32px] shadow-2xl
                        w-full max-w-4xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300
                        clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh] relative
                    `}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div
            className={`px-6 sm:px-10 py-6 sm:py-8 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-gradient-to-r from-indigo-500/10 to-purple-500/10 light:from-indigo-50 light:to-purple-50 relative flex-shrink-0`}
          >
            <MeshOverlay />
            <div className="flex justify-between items-center gap-4 relative z-10">
              <div className="flex items-center gap-5 min-w-0">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg flex items-center justify-center border border-white/20 flex-shrink-0">
                  <PenTool className="w-7 h-7 text-white" />
                </div>
                <div className="min-w-0">
                  <h2
                    id="manual-prompt-title"
                    className="text-2xl font-black text-white light:text-slate-900 tracking-tight leading-none uppercase italic"
                  >
                    Manual Entry
                  </h2>
                  {/* The breadcrumb the question will be filed under — the same
                    reassurance the AI generator gives before it writes. */}
                  <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-1.5">
                    <span className="truncate max-w-[10rem]">{courseName || 'Course'}</span>
                    <ChevronRight className="w-3 h-3 opacity-30" />
                    <span className="truncate max-w-[10rem]">{topicName || 'Topic'}</span>
                    {subTopicName && (
                      <>
                        <ChevronRight className="w-3 h-3 opacity-30" />
                        <span className="text-indigo-400 truncate max-w-[10rem]">
                          {subTopicName}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={guard.requestClose}
                aria-label="Close"
                className="p-3 rounded-xl hover:bg-white/10 light:hover:bg-slate-200 text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors flex-shrink-0"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Two named steps rather than a changing subtitle: the teacher can
              see that the AI's draft still has to be reviewed. */}
            <div className="flex items-center gap-3 mt-5 relative z-10">
              {(
                [
                  ['input', '1', 'Compose'],
                  ['preview', '2', 'Review & Save'],
                ] as const
              ).map(([id, num, label]) => {
                const active = step === id;
                const done = id === 'input' && step === 'preview';
                return (
                  <div key={id} className="flex items-center gap-2">
                    <span
                      className={`w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black transition-colors ${
                        active
                          ? 'bg-indigo-500 text-white shadow-lg'
                          : done
                            ? 'bg-emerald-500 text-white'
                            : 'bg-white/10 light:bg-slate-200 text-slate-500'
                      }`}
                    >
                      {done ? <Check className="w-3.5 h-3.5" strokeWidth={4} /> : num}
                    </span>
                    <span
                      className={`text-[10px] font-black uppercase tracking-[0.2em] ${
                        active
                          ? 'text-white light:text-slate-900'
                          : 'text-slate-500 light:text-slate-500'
                      }`}
                    >
                      {label}
                    </span>
                    {id === 'input' && <ChevronRight className="w-3.5 h-3.5 text-slate-600 ml-1" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 sm:p-10 bg-[rgb(var(--color-bg-surface))] light:bg-white custom-scrollbar">
            {step === 'input' && (
              <div className="flex flex-col animate-fade-in space-y-6">
                {/* Your idea comes first: everything below it is calibration. */}
                <div className="flex flex-col">
                  <div className="flex justify-between items-end mb-3">
                    <label
                      htmlFor="manual-prompt-draft"
                      className="text-xs font-bold text-slate-500 uppercase tracking-widest block"
                    >
                      Your Rough Question Idea
                    </label>
                    <span className="text-[10px] font-mono font-bold text-slate-600 tabular-nums">
                      {draftQuestion.trim().length} chars
                    </span>
                  </div>
                  <textarea
                    id="manual-prompt-draft"
                    value={draftQuestion}
                    onChange={(e) => setDraftQuestion(e.target.value)}
                    placeholder="e.g. Ask the student about how caching works in a CPU and why it's faster..."
                    className="w-full h-32 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-2xl p-6 text-lg font-medium text-white light:text-slate-900 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none transition-shadow shadow-inner"
                  />
                  {dotPoint && (
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-widest text-slate-600 flex items-start gap-2">
                      <ListChecks className="w-3.5 h-3.5 flex-shrink-0 mt-px opacity-60" />
                      <span className="normal-case tracking-normal font-medium text-slate-500 leading-relaxed">
                        Grounded in this syllabus point: {dotPoint}
                      </span>
                    </p>
                  )}
                </div>

                {/* Mark Slider Section */}
                <Section
                  icon={Target}
                  iconClass={markBandColor}
                  eyebrow="Difficulty"
                  title="Allocated Marks"
                  action={
                    <div className="text-right">
                      <span
                        className={`text-4xl font-black ${markBandColor} tracking-tighter tabular-nums`}
                      >
                        {marks}
                      </span>
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest ml-2">
                        Marks
                      </span>
                    </div>
                  }
                >
                  <div className="h-4 bg-black/40 light:bg-slate-200 rounded-full border border-white/5 light:border-slate-300 p-1 shadow-inner relative group/slider">
                    <input
                      type="range"
                      min="1"
                      max="20"
                      value={marks}
                      aria-label="Allocated marks"
                      onChange={(e) => setMarks(Number(e.target.value))}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    />
                    {/* Recommended range zone */}
                    <div
                      className="absolute top-0 bottom-0 rounded-full border-2 border-white/20 light:border-slate-400 pointer-events-none z-10 transition-all duration-300"
                      style={{
                        left: `${((activeVerb.markRange[0] - 1) / 19) * 100}%`,
                        right: `${((20 - activeVerb.markRange[1]) / 19) * 100}%`,
                      }}
                    />
                    <div
                      className={`h-full bg-gradient-to-r ${markGradient} rounded-full transition-all duration-300 relative`}
                      style={{ width: `${((marks - 1) / 19) * 100}%` }}
                    >
                      <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-xl scale-125 group-hover/slider:scale-150 transition-transform" />
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 px-1 gap-2">
                    <span className="text-[10px] font-bold text-slate-600 uppercase">
                      Simple (1)
                    </span>
                    <span className="text-[10px] font-bold text-slate-500 uppercase text-center">
                      {activeVerb.term} range: {activeVerb.markRange[0]}–{activeVerb.markRange[1]}
                    </span>
                    <span className="text-[10px] font-bold text-slate-600 uppercase">
                      Extended (20)
                    </span>
                  </div>
                  {outOfRange && (
                    <div className="mt-3 p-3 rounded-lg bg-amber-500/10 light:bg-amber-50 border border-amber-500/20 light:border-amber-200 flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-400 light:text-amber-600 flex-shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-300 light:text-amber-700 leading-relaxed">
                        <strong>{marks} marks</strong> is outside the typical range for{' '}
                        <strong>&apos;{activeVerb.term}&apos;</strong> ({activeVerb.markRange[0]}–
                        {activeVerb.markRange[1]} marks).{' '}
                        {pinnedVerb
                          ? 'The question will still be built on this verb — adjust the marks if that is not what you want.'
                          : 'The AI will still produce a valid question, but you may want to adjust the marks or expect a different verb.'}
                      </p>
                    </div>
                  )}
                </Section>

                {/* Command verb — the single biggest lever on what the question
                  asks for, and previously left entirely to the model. */}
                <Section
                  icon={Brain}
                  iconClass="text-purple-400"
                  eyebrow="Cognitive demand"
                  title="Command Verb"
                  action={
                    <div
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border ${markTierConfig.bg} ${markTierConfig.border}`}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                        Ceiling
                      </span>
                      <span
                        className={`text-[11px] font-black uppercase tracking-widest ${markBandColor}`}
                      >
                        Band {ceilingBand}
                      </span>
                    </div>
                  }
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      aria-pressed={pinnedVerb === null}
                      onClick={() => setPinnedVerb(null)}
                      className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-1.5 ${
                        pinnedVerb === null
                          ? 'bg-indigo-500/15 border-indigo-500/40 text-indigo-300 light:text-indigo-700 shadow-lg'
                          : 'bg-white/[0.03] light:bg-white border-white/10 light:border-slate-300 text-slate-400 light:text-slate-600 hover:border-white/25'
                      }`}
                    >
                      <Sparkles className="w-3 h-3" /> AI Chooses
                    </button>
                    <span className="w-px h-5 bg-white/10 light:bg-slate-300" />
                    {leadVerbs.map((v) => verbButton(v, pinnedVerb === v.term))}
                    <button
                      type="button"
                      onClick={() => setShowAllVerbs((v) => !v)}
                      className="px-2.5 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors"
                    >
                      {showAllVerbs ? 'Fewer' : `+${otherVerbs.length} more`}
                    </button>
                  </div>
                  {showAllVerbs && (
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-white/5 light:border-slate-200 animate-fade-in">
                      {otherVerbs.map((v) => verbButton(v, pinnedVerb === v.term))}
                    </div>
                  )}
                  <p className="mt-3 text-[11px] text-slate-500 leading-relaxed">
                    {pinnedVerb ? (
                      <>
                        Pinned to{' '}
                        <span className={`font-bold ${markBandColor}`}>{activeVerb.term}</span> —{' '}
                        {activeVerb.definition}
                      </>
                    ) : (
                      <>
                        {/* No article before the verb: "a 'ANALYSE' style verb"
                          was wrong for every verb starting with a vowel, which
                          is most of the interesting ones. */}
                        The AI will choose a verb like{' '}
                        <span className={`font-bold ${markBandColor}`}>
                          &apos;{activeVerb.term}&apos;
                        </span>{' '}
                        — {activeTierInfo?.title}.
                      </>
                    )}
                  </p>
                </Section>

                {/* Scenario + provenance sit side by side: both are decisions
                  about what the question IS, not how hard it is. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Section
                    icon={Briefcase}
                    iconClass="text-blue-400"
                    eyebrow="Framing"
                    title="Context Scenario"
                    action={
                      <Toggle
                        checked={includeScenario}
                        onChange={() => setIncludeScenario((v) => !v)}
                        onLabel="Scenario On"
                        offLabel="No Scenario"
                        title={
                          includeScenario
                            ? 'Scenario on — a context paragraph will be written'
                            : 'Scenario off — a direct question with no scenario'
                        }
                      />
                    }
                  >
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      {includeScenario
                        ? 'A short, realistic case-study paragraph is written to frame the question — who, what and why.'
                        : 'A direct knowledge or skill question with no case-study framing. The stem stands on its own.'}
                    </p>
                  </Section>

                  <Section
                    icon={Landmark}
                    iconClass="text-amber-400"
                    eyebrow="Provenance"
                    title="Past HSC Paper"
                    action={
                      <Toggle
                        checked={isPastHSC}
                        onChange={() => setIsPastHSC((v) => !v)}
                        onLabel="Past HSC"
                        offLabel="Practice"
                        accent="amber"
                        title={
                          isPastHSC
                            ? 'Marked as coming from a past HSC examination'
                            : 'A practice question, not from a past paper'
                        }
                      />
                    }
                  >
                    {isPastHSC ? (
                      <div className="flex flex-wrap items-end gap-3 animate-fade-in">
                        <div className="flex flex-col gap-1.5">
                          <label
                            htmlFor="manual-hsc-year"
                            className="text-[9px] font-black uppercase tracking-widest text-slate-500"
                          >
                            Year
                          </label>
                          <input
                            id="manual-hsc-year"
                            type="number"
                            min={1990}
                            max={currentHscYear()}
                            value={hscYear}
                            onChange={(e) => setHscYear(e.target.value)}
                            className="w-24 px-3 py-2 rounded-xl bg-[rgb(var(--color-bg-surface))] light:bg-white border border-white/10 light:border-slate-300 text-sm font-bold text-white light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500/40 tabular-nums"
                          />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label
                            htmlFor="manual-hsc-question"
                            className="text-[9px] font-black uppercase tracking-widest text-slate-500"
                          >
                            Question No.
                          </label>
                          <input
                            id="manual-hsc-question"
                            type="text"
                            value={hscQuestionNumber}
                            onChange={(e) => setHscQuestionNumber(e.target.value)}
                            placeholder="e.g. 12(b)"
                            className="w-28 px-3 py-2 rounded-xl bg-[rgb(var(--color-bg-surface))] light:bg-white border border-white/10 light:border-slate-300 text-sm font-bold text-white light:text-slate-900 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/40"
                          />
                        </div>
                        {previewPastHsc && (
                          <span
                            className="flex items-center gap-1 mb-2 px-2 py-1 rounded-lg border bg-amber-500/15 light:bg-amber-100 text-amber-400 light:text-amber-800 border-amber-500/40 text-[9px] font-black uppercase tracking-wider"
                            title={previewPastHsc.title}
                          >
                            <Landmark className="w-2.5 h-2.5" />
                            {previewPastHsc.text}
                          </span>
                        )}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 leading-relaxed">
                        Turn this on for a question lifted from a real HSC examination — students
                        see which paper and year it came from.
                      </p>
                    )}
                  </Section>
                </div>

                {/* Outcomes — the AI guesses well, but a teacher writing to a
                  specific outcome should not have to accept a guess. */}
                {outcomes.length > 0 && (
                  <Section
                    icon={Link2}
                    iconClass="text-emerald-400"
                    eyebrow="What's assessed"
                    title="Syllabus Outcomes"
                    action={
                      pinnedOutcomes.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setPinnedOutcomes([])}
                          className="text-[10px] font-black uppercase tracking-widest text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors"
                        >
                          Clear · let AI choose
                        </button>
                      ) : (
                        <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3" /> AI Chooses
                        </span>
                      )
                    }
                  >
                    <div className="flex flex-wrap gap-2">
                      {outcomes.map((o) => {
                        const active = pinnedOutcomes.includes(o.code);
                        return (
                          <button
                            key={o.code}
                            type="button"
                            aria-pressed={active}
                            onClick={() => toggleOutcome(o.code)}
                            title={o.description}
                            className={`px-3 py-1.5 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                              active
                                ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-400 shadow-lg'
                                : 'bg-white/[0.03] light:bg-white border-white/10 light:border-slate-300 text-slate-400 light:text-slate-600 hover:border-white/25'
                            }`}
                          >
                            {o.code}
                          </button>
                        );
                      })}
                    </div>
                  </Section>
                )}

                {error && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm font-bold flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    {error}
                  </div>
                )}
              </div>
            )}

            {step === 'preview' && result && (
              <div className="space-y-6 animate-fade-in">
                <div className="bg-indigo-500/10 light:bg-indigo-50 border border-indigo-500/20 light:border-indigo-100 rounded-2xl p-6 relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity pointer-events-none">
                    <Sparkles className="w-12 h-12 text-indigo-400 rotate-12" />
                  </div>
                  <label
                    htmlFor="manual-preview-question"
                    className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2 block"
                  >
                    Polished Question · edit before saving
                  </label>
                  <textarea
                    id="manual-preview-question"
                    value={editedQuestion}
                    onChange={(e) => setEditedQuestion(e.target.value)}
                    rows={3}
                    className="w-full bg-transparent border border-transparent hover:border-white/10 focus:border-indigo-500/40 rounded-xl p-2 -m-2 text-xl font-serif font-medium text-white light:text-slate-900 leading-relaxed focus:outline-none resize-none transition-colors"
                  />
                  {editedQuestion !== result.question && (
                    <p className="mt-2 text-[10px] font-black uppercase tracking-widest text-amber-400 flex items-center gap-1.5">
                      <AlertTriangle className="w-3 h-3" /> Edited — the AI wrote:{' '}
                      <span className="font-medium normal-case tracking-normal text-slate-500 truncate">
                        {renderFormattedText(result.question, result.keywords, result.verb)}
                      </span>
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <div className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                      {result.verb}
                    </div>
                    <div className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                      {result.totalMarks} Marks
                    </div>
                    <div className="px-3 py-1 rounded-lg bg-indigo-500/20 text-indigo-300 text-[10px] font-black uppercase tracking-widest border border-indigo-500/20">
                      Max Band{' '}
                      {getTargetBand(result.totalMarks, getCommandTermInfo(result.verb).tier)}
                    </div>
                    {previewPastHsc && (
                      <div
                        className="px-3 py-1 rounded-lg bg-amber-500/15 text-amber-400 text-[10px] font-black uppercase tracking-widest border border-amber-500/40 flex items-center gap-1.5"
                        title={previewPastHsc.title}
                      >
                        <Landmark className="w-3 h-3" />
                        {previewPastHsc.text}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label
                      htmlFor="manual-preview-scenario"
                      className="text-[10px] font-black text-slate-500 uppercase tracking-widest block"
                    >
                      Scenario
                    </label>
                    {includeScenario ? (
                      <textarea
                        id="manual-preview-scenario"
                        value={editedScenario}
                        onChange={(e) => setEditedScenario(e.target.value)}
                        rows={6}
                        className="w-full p-5 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-sm text-slate-300 light:text-slate-700 leading-relaxed font-serif italic focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
                      />
                    ) : (
                      <div className="p-5 rounded-2xl border border-dashed border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-xs text-slate-500 italic font-medium">
                        No scenario — this is a direct question.
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label
                      htmlFor="manual-preview-criteria"
                      className="text-[10px] font-black text-slate-500 uppercase tracking-widest block"
                    >
                      Marking Criteria
                    </label>
                    <textarea
                      id="manual-preview-criteria"
                      value={editedCriteria}
                      onChange={(e) => setEditedCriteria(e.target.value)}
                      rows={6}
                      className="w-full p-5 rounded-2xl bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-xs text-slate-400 light:text-slate-600 font-mono whitespace-pre-wrap leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/40 resize-none"
                    />
                  </div>
                </div>

                {/* Keywords and outcomes were produced by the refinement and
                  then never shown — a teacher was saving them unseen. */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Link2 className="w-3.5 h-3.5" /> Linked Outcomes
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {result.linkedOutcomes?.length ? (
                        result.linkedOutcomes.map((code) => (
                          <span
                            key={code}
                            title={outcomes.find((o) => o.code === code)?.description}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[9px] font-black uppercase tracking-wider"
                          >
                            {code}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500 italic">None linked.</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                      <Tag className="w-3.5 h-3.5" /> Syllabus Keywords
                    </span>
                    <div className="flex flex-wrap gap-2">
                      {result.keywords?.length ? (
                        result.keywords.map((kw) => (
                          <span
                            key={kw}
                            className="px-2.5 py-1 rounded-lg bg-white/5 light:bg-slate-100 border border-white/10 light:border-slate-300 text-slate-400 light:text-slate-600 text-[10px] font-bold"
                          >
                            {kw}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-slate-500 italic">None extracted.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 sm:px-10 py-6 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-elevated))]/50 light:bg-slate-50 backdrop-blur-md flex justify-between items-center gap-4 relative z-20">
            {step === 'preview' ? (
              <button
                onClick={() => setStep('input')}
                className="text-xs font-bold text-slate-500 hover:text-white light:hover:text-slate-900 transition-colors"
              >
                Back to Edit
              </button>
            ) : (
              <div />
            )}

            {step === 'input' ? (
              <button
                onClick={handleRefine}
                disabled={!draftQuestion.trim() || isRefining}
                className={`
                                    group px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-white shadow-xl transition-all flex items-center gap-3
                                    ${
                                      !draftQuestion.trim() || isRefining
                                        ? 'bg-slate-700 opacity-50 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:scale-105 active:scale-95'
                                    }
                                `}
              >
                {isRefining ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Polishing...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4 group-hover:rotate-12 transition-transform" /> Refine
                    with AI
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={!editedQuestion.trim()}
                className="group px-10 py-3 rounded-2xl font-black text-xs uppercase tracking-[0.2em] text-white bg-gradient-to-r from-emerald-600 to-teal-600 shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                <Save className="w-4 h-4" /> Save to Syllabus
              </button>
            )}
          </div>

          {guard.isConfirming && (
            <DiscardConfirmBar
              summary={result ? 'this refined question' : 'the question you have drafted'}
              onKeep={guard.cancelDiscard}
              onDiscard={guard.confirmDiscard}
            />
          )}

          <AiBusyOverlay show={isRefining}>
            <LoadingIndicator
              task="generation"
              message="Structuring your question"
              messages={[
                'Analysing draft concept...',
                `Calibrating for ${marks} marks...`,
                pinnedVerb ? `Building on '${pinnedVerb}'...` : 'Selecting appropriate verb...',
                includeScenario ? 'Constructing scenario...' : 'Sharpening the question stem...',
                'Drafting rubric...',
              ]}
              duration={8}
              band={ceilingBand}
            />
          </AiBusyOverlay>
        </div>
      </div>,
      targetContainer
    );
  } catch (portalError) {
    console.error('[ManualPromptModal] FATAL: createPortal failed.', portalError);
    return null;
  }
};

export default ManualPromptModal;
