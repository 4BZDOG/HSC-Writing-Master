import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Prompt, CourseOutcome, CommandTermInfo, PromptVerb } from '../types';
import { generateNewPrompt } from '../services/geminiService';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import AiErrorNotice from './AiErrorNotice';
import {
  getCommandTermsForMarks,
  TIER_GROUPS,
  extractCommandVerb,
  commandTermsList,
  getCommandTermInfo,
  getTierTargetBand,
} from '../data/commandTerms';
import {
  X,
  Sparkles,
  Target,
  Hash,
  ChevronRight,
  Briefcase,
  Brain,
  Clock,
  Scale,
  Users,
  Coins,
  Wrench,
  Trophy,
  Info,
  ListFilter,
  Loader2,
  TrendingUp,
  TrendingDown,
  CircleCheck,
  GraduationCap,
  Wand2,
} from 'lucide-react';
import {
  getBandConfig,
  getBandRgb,
  getTierBandConfig,
  getTierScaleConfig,
  escapeRegExp,
} from '../utils/renderUtils';
import { parseSubItemsFromDescription } from '../utils/dataManagerUtils';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import {
  CREATOR_BACKDROP,
  CREATOR_SHELL,
  CREATOR_HEADER,
  CREATOR_ICON_TILE,
  CREATOR_KICKER,
  CREATOR_TITLE,
  CREATOR_CLOSE,
  CREATOR_BODY,
  CREATOR_FOOTER,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_PRIMARY_BUTTON,
} from '../utils/creatorChrome';

interface PromptGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPromptGenerated: (newPrompt: Prompt) => void;
  courseName: string;
  topicName: string;
  subTopicName?: string;
  dotPoint: string;
  marks: number;
  courseOutcomes: CourseOutcome[];
  selectedFocusItems?: string[];
  /**
   * The dot point's focus areas as the navigator resolved them (see
   * `getFocusAreas`) — a teacher's hand-set list when there is one, otherwise
   * the parsed one. Omit to fall back to parsing the description here.
   */
  focusAreaOptions?: string[];
}

const SCENARIO_TYPES = [
  { id: 'random', label: 'Surprise me', icon: Sparkles, desc: 'AI selects the best fit' },
  { id: 'temporal', label: 'Time pressure', icon: Clock, desc: 'Deadlines, urgent response' },
  { id: 'financial', label: 'Financial', icon: Coins, desc: 'Budget limits, ROI' },
  { id: 'ethical', label: 'Ethical', icon: Scale, desc: 'Dilemmas, moral hazard' },
  { id: 'stakeholder', label: 'Stakeholder', icon: Users, desc: 'Conflicting interests' },
  { id: 'technical', label: 'Technical', icon: Wrench, desc: 'Legacy systems, constraints' },
  { id: 'regulatory', label: 'Regulatory', icon: Briefcase, desc: 'Compliance, laws' },
];

const SKILL_FOCUS_OPTIONS = [
  { id: 'balanced', label: 'Balanced', desc: 'Equal focus on content and application.' },
  { id: 'application', label: 'Application', desc: 'Focus on applying concepts to the scenario.' },
  { id: 'analysis', label: 'Analysis', desc: 'Deep dive into relationships and causes.' },
  { id: 'evaluation', label: 'Evaluation', desc: 'Critical judgement and assessment.' },
];

const PromptGeneratorModal: React.FC<PromptGeneratorModalProps> = ({
  isOpen,
  onClose,
  onPromptGenerated,
  courseName,
  topicName,
  subTopicName,
  dotPoint,
  marks: initialMarks,
  courseOutcomes,
  selectedFocusItems = [],
  focusAreaOptions,
}) => {
  const MAX_GENERATOR_MARKS = 15;
  const [marks, setMarks] = useState(initialMarks > MAX_GENERATOR_MARKS ? 7 : initialMarks);
  const [isLoading, setIsLoading] = useState(false);
  // Escape closes this modal like every other modal surface (but never mid-operation).
  useEscapeKey(isOpen && !isLoading, onClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  const [selectedTier, setSelectedTier] = useState<number>(4);
  const [selectedSpecificVerb, setSelectedSpecificVerb] = useState<PromptVerb | null>(null);
  const [targetBand, setTargetBand] = useState<number>(6);

  const [scenarioType, setScenarioType] = useState<string>('random');
  const [skillFocus, setSkillFocus] = useState<string>('balanced');
  // Not every question needs a manufactured context — direct knowledge/skill
  // questions read better without one.
  const [includeScenario, setIncludeScenario] = useState<boolean>(true);

  // Focus areas: the dot point's parsed sub-items, toggleable here. Seeded
  // from the syllabus navigator's active Focus selection, but editable so a
  // teacher can refine the scope without leaving the modal.
  const [focusItems, setFocusItems] = useState<string[]>([]);

  const syllabusVerbInfo = useMemo(() => extractCommandVerb(dotPoint), [dotPoint]);

  // Every sub-item the dot point offers, plus any navigator selection that the
  // parser no longer yields (e.g. after a dot point edit) so nothing selected
  // ever silently disappears.
  const availableFocusItems = useMemo(() => {
    const resolved = focusAreaOptions ?? parseSubItemsFromDescription(dotPoint);
    const extras = selectedFocusItems.filter((item) => !resolved.includes(item));
    return [...resolved, ...extras];
  }, [dotPoint, focusAreaOptions, selectedFocusItems]);

  // The cognitive level (tier) the syllabus dot point itself demands — the
  // "scope of knowledge" the syllabus asks for. The question the user builds is
  // measured against this so over-/under-shooting is obvious.
  const syllabusTier = syllabusVerbInfo?.tier ?? null;
  const syllabusTierInfo = useMemo(
    () => (syllabusTier ? TIER_GROUPS.find((t) => t.tier === syllabusTier) : null),
    [syllabusTier]
  );

  // How the chosen question level compares to what the syllabus demands.
  const difficulty = useMemo(() => {
    if (!syllabusTier) return null;
    const delta = selectedTier - syllabusTier;
    const status: 'match' | 'above' | 'below' =
      delta === 0 ? 'match' : delta > 0 ? 'above' : 'below';
    return { status, steps: Math.abs(delta) };
  }, [selectedTier, syllabusTier]);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  useEffect(() => {
    if (isOpen) {
      const defaultTier = syllabusVerbInfo?.tier || 4;
      const defaultVerb = syllabusVerbInfo?.term || null;
      const suggestedMark =
        initialMarks ||
        (defaultTier === 1
          ? 2
          : defaultTier === 2
            ? 3
            : defaultTier === 3
              ? 5
              : defaultTier === 4
                ? 6
                : defaultTier === 5
                  ? 8
                  : 10);

      setMarks(suggestedMark);
      setSelectedTier(defaultTier);
      setSelectedSpecificVerb(defaultVerb as PromptVerb);

      setScenarioType('random');
      setSkillFocus('balanced');
      setIncludeScenario(true);
      setFocusItems(selectedFocusItems);
      // Default to the tier's own ceiling band (Tier N → Band N).
      setTargetBand(TIER_GROUPS.find((t) => t.tier === defaultTier)?.maxBand ?? 6);
      setError(null);
      setIsLoading(false);
    }
  }, [isOpen, syllabusVerbInfo, initialMarks]);

  const verbsForCurrentTier = useMemo(() => {
    return commandTermsList.filter((v) => v.tier === selectedTier);
  }, [selectedTier]);

  useEffect(() => {
    if (verbsForCurrentTier.length > 0) {
      const currentVerbIsValid = verbsForCurrentTier.some((v) => v.term === selectedSpecificVerb);
      if (!currentVerbIsValid) {
        setSelectedSpecificVerb(verbsForCurrentTier[0].term);
      }
    }
  }, [selectedTier, verbsForCurrentTier, selectedSpecificVerb]);

  // When the selected verb changes, clamp marks to its valid range.
  useEffect(() => {
    if (!selectedSpecificVerb) return;
    const info = getCommandTermInfo(selectedSpecificVerb);
    if (marks < info.markRange[0]) setMarks(info.markRange[0]);
    else if (marks > info.markRange[1]) setMarks(info.markRange[1]);
  }, [selectedSpecificVerb]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeBandConfig = getTierBandConfig(selectedTier);
  const activeTierInfo = TIER_GROUPS.find((g) => g.tier === selectedTier);

  // The verb tier caps the achievable band (Tier N = Band N ceiling). Picking
  // a tier defaults the target to that tier's ceiling, which the user can
  // then aim below.
  const tierMaxBand = activeTierInfo?.maxBand ?? 6;
  useEffect(() => {
    setTargetBand(tierMaxBand);
  }, [tierMaxBand]);

  const selectedVerbInfo = selectedSpecificVerb ? getCommandTermInfo(selectedSpecificVerb) : null;

  const handleGenerate = async () => {
    setIsLoading(true);
    setError(null);
    try {
      let verbsToUse: CommandTermInfo[] = [];
      if (selectedSpecificVerb) {
        const v = getCommandTermInfo(selectedSpecificVerb);
        if (v) verbsToUse = [v];
      }

      if (verbsToUse.length === 0 && verbsForCurrentTier.length > 0) {
        const v = getCommandTermInfo(verbsForCurrentTier[0].term);
        verbsToUse = [v];
      }

      const prompt = await generateNewPrompt(
        courseName,
        topicName,
        dotPoint,
        marks,
        verbsToUse,
        courseOutcomes,
        includeScenario ? scenarioType : undefined,
        skillFocus,
        targetBand,
        includeScenario,
        focusItems
      );
      onPromptGenerated(prompt);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    if (isLoading) return;
    onClose();
  };

  const renderHighlightedSyllabus = () => {
    if (!syllabusVerbInfo) return dotPoint;
    const parts = dotPoint.split(new RegExp(`(${escapeRegExp(syllabusVerbInfo.term)})`, 'i'));
    const verbConfig = getTierBandConfig(syllabusVerbInfo.tier);

    return (
      <span>
        {parts.map((part, i) =>
          part.toLowerCase() === syllabusVerbInfo.term.toLowerCase() ? (
            <span
              key={i}
              className={`relative inline-block px-1.5 py-0.5 mx-1 rounded-lg shadow-sm bg-gradient-to-r ${verbConfig.gradient} ${verbConfig.solidText} font-bold tracking-wide transform -skew-x-3 decoration-clone`}
            >
              <span className="block transform skew-x-3">{part.toUpperCase()}</span>
            </span>
          ) : (
            <span
              key={i}
              className="text-[rgb(var(--color-text-secondary))] light:text-slate-700 font-medium"
            >
              {part}
            </span>
          )
        )}
      </span>
    );
  };

  if (!isOpen || !mounted || typeof document === 'undefined' || !document.body) return null;

  const focusCount = focusItems.length;

  return createPortal(
    <div className={CREATOR_BACKDROP} onClick={handleClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-generator-title"
        className={`${CREATOR_SHELL} max-w-5xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <Wand2 className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            {/* The breadcrumb the question will be filed under. */}
            <div className={`${CREATOR_KICKER} flex flex-wrap items-center gap-x-1.5 gap-y-1`}>
              <span>{courseName}</span>
              <ChevronRight
                className="w-3 h-3 flex-shrink-0 text-[rgb(var(--color-text-muted))]"
                aria-hidden="true"
              />
              <span>{topicName}</span>
              {subTopicName && (
                <>
                  <ChevronRight
                    className="w-3 h-3 flex-shrink-0 text-[rgb(var(--color-text-muted))]"
                    aria-hidden="true"
                  />
                  <span className="text-indigo-600 dark:text-indigo-400">{subTopicName}</span>
                </>
              )}
            </div>
            <h2 id="prompt-generator-title" className={CREATOR_TITLE}>
              Generate a question
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isLoading}
            aria-label="Close"
            className={CREATOR_CLOSE}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className={`${CREATOR_BODY} space-y-8 sm:space-y-10`}>
          {/* Generation failure: surfaced here so a rejected request never
              leaves the modal silently empty once the busy overlay hides. */}
          {error && !isLoading && (
            <AiErrorNotice
              message={error}
              onRetry={handleGenerate}
              onDismiss={() => setError(null)}
            />
          )}

          {/* Syllabus Context */}
          <div className="rounded-panel border p-5 sm:p-8 relative overflow-hidden transition-all duration-500 shadow-lg bg-slate-50 border-slate-200 dark:bg-black/20 dark:border-white/5">
            <div className="flex flex-col gap-6 relative z-10">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-xl bg-slate-100 dark:bg-white/5 text-[rgb(var(--color-text-secondary))] border border-slate-200 dark:border-white/10 shadow-inner">
                  <Hash
                    className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400"
                    aria-hidden="true"
                  />
                  <span className="t-label">Syllabus dot point</span>
                </div>
                {focusCount > 0 && (
                  <div className="inline-flex items-center gap-2.5 px-4 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 shadow-lg shadow-emerald-900/10">
                    <ListFilter className="w-3.5 h-3.5" aria-hidden="true" />
                    <span className="t-label">
                      {`Focused on ${focusCount} ${focusCount === 1 ? 'part' : 'parts'}`}
                    </span>
                  </div>
                )}
              </div>
              <p className="text-xl sm:text-2xl font-serif leading-relaxed text-[rgb(var(--color-text-primary))] light:text-slate-800">
                {renderHighlightedSyllabus()}
              </p>

              {/* The scope of knowledge the syllabus itself demands: the dot
                  point's own command verb and the cognitive tier it sits at.
                  This is the baseline the generated question is judged against. */}
              {syllabusVerbInfo && syllabusTierInfo ? (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <div
                    className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-xl ${getTierBandConfig(syllabusVerbInfo.tier).bg} ${getTierBandConfig(syllabusVerbInfo.tier).border} border shadow-inner`}
                  >
                    <GraduationCap
                      className={`w-4 h-4 ${getTierBandConfig(syllabusVerbInfo.tier).text}`}
                      aria-hidden="true"
                    />
                    <span className="t-label text-muted">Syllabus demands</span>
                    <span className={`t-label ${getTierBandConfig(syllabusVerbInfo.tier).text}`}>
                      {syllabusVerbInfo.term} · up to Band {syllabusVerbInfo.tier}
                    </span>
                  </div>
                  <span className="t-label text-muted">{syllabusTierInfo.title}</span>
                </div>
              ) : (
                <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 shadow-inner">
                  <Info className="w-4 h-4 text-muted" aria-hidden="true" />
                  <span className="t-label text-muted">
                    No command verb detected in this dot point — set the level manually below.
                  </span>
                </div>
              )}

              {availableFocusItems.length > 0 && (
                <div className="pt-2">
                  <span className="t-label text-muted block mb-2">
                    Focus the question on part of the dot point (optional)
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {availableFocusItems.map((item) => {
                      const isActive = focusItems.includes(item);
                      return (
                        <button
                          key={item}
                          type="button"
                          aria-pressed={isActive}
                          onClick={() =>
                            setFocusItems((prev) =>
                              isActive ? prev.filter((f) => f !== item) : [...prev, item]
                            )
                          }
                          className={`min-h-11 sm:min-h-0 t-label px-3 py-1 rounded-lg border italic transition-all duration-300 ${
                            isActive
                              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 light:text-emerald-700 shadow-lg shadow-emerald-900/10'
                              : 'bg-white/[0.03] light:bg-slate-50 border-white/10 light:border-slate-200 text-muted hover:text-white light:hover:text-slate-900 hover:border-white/20 light:hover:border-slate-400'
                          }`}
                        >
                          {item}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-10">
            <div className="space-y-8 sm:space-y-10">
              <section>
                <div className="flex justify-between items-end mb-6">
                  <h4 className="text-sm font-bold text-white light:text-slate-900 flex items-center gap-3">
                    <Target
                      className="w-5 h-5 text-indigo-400 light:text-indigo-700"
                      aria-hidden="true"
                    />
                    Marks
                  </h4>
                  <div className="text-right">
                    <span
                      className={`text-4xl font-black ${activeBandConfig.text} tracking-tighter tabular-nums`}
                    >
                      {marks}
                    </span>
                    <span className="t-label text-muted ml-2">marks</span>
                  </div>
                </div>
                {/* The native range is the control; its track is painted here.
                    The thumb draws a focus ring when the keyboard reaches it. */}
                <div className="h-4 bg-black/40 light:bg-slate-200 rounded-full border border-white/5 light:border-slate-300 p-1 shadow-inner relative group/slider">
                  <input
                    type="range"
                    aria-label="Marks"
                    min={selectedVerbInfo?.markRange[0] ?? 1}
                    max={selectedVerbInfo?.markRange[1] ?? MAX_GENERATOR_MARKS}
                    value={marks}
                    onChange={(e) => setMarks(Number(e.target.value))}
                    className="peer absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                  />
                  <div
                    className={`h-full bg-gradient-to-r ${activeBandConfig.gradient} rounded-full transition-all duration-300 relative peer-focus-visible:[&>div]:ring-4 peer-focus-visible:[&>div]:ring-white/60`}
                    style={{
                      width: `${((marks - (selectedVerbInfo?.markRange[0] ?? 1)) / ((selectedVerbInfo?.markRange[1] ?? MAX_GENERATOR_MARKS) - (selectedVerbInfo?.markRange[0] ?? 1) || 1)) * 100}%`,
                    }}
                  >
                    <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-white shadow-lg scale-125 group-hover/slider:scale-150 transition-transform" />
                  </div>
                </div>
              </section>

              <section>
                <h4 className="text-sm font-bold text-white light:text-slate-900 flex items-center gap-3 mb-6">
                  <Brain
                    className="w-5 h-5 text-purple-400 light:text-purple-700"
                    aria-hidden="true"
                  />
                  Cognitive level
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {TIER_GROUPS.map((tier) => {
                    const isSelected = selectedTier === tier.tier;
                    const isSyllabusLevel = syllabusTier === tier.tier;
                    const config = getTierScaleConfig(tier.tier);
                    return (
                      <button
                        key={tier.tier}
                        type="button"
                        aria-pressed={isSelected}
                        onClick={() => setSelectedTier(tier.tier)}
                        title={
                          isSyllabusLevel ? 'The level the syllabus dot point asks for' : undefined
                        }
                        className={`relative p-4 sm:p-5 rounded-panel border text-left transition-all duration-500 ${isSelected ? `${config.bg} ${config.border} shadow-lg scale-[1.03]` : isSyllabusLevel ? 'bg-white/[0.04] light:bg-emerald-50 border-emerald-500/30 hover:bg-white/[0.06]' : 'bg-white/[0.03] light:bg-slate-50 border-white/5 light:border-slate-200 hover:bg-white/[0.05] light:hover:bg-slate-100 hover:border-white/10'}`}
                      >
                        {isSyllabusLevel && (
                          <span className="t-label absolute -top-2 left-4 px-2 py-0.5 rounded-full bg-emerald-700 text-white shadow-lg flex items-center gap-1">
                            <GraduationCap className="w-2.5 h-2.5" aria-hidden="true" /> Syllabus
                          </span>
                        )}
                        <div className="flex justify-between items-start mb-3">
                          <span className="text-2xl" aria-hidden="true">
                            {tier.emoji}
                          </span>
                          <span className={`t-label ${isSelected ? config.text : 'text-muted'}`}>
                            B{tier.tier}
                          </span>
                        </div>
                        <div
                          className={`t-label leading-tight ${isSelected ? 'text-white light:text-slate-900' : 'text-muted'}`}
                        >
                          {tier.title}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Too-hard / too-easy signal, measured against the syllabus. */}
                {difficulty && syllabusTierInfo && (
                  <div
                    className={`mt-4 flex items-start gap-3 p-4 rounded-2xl border ${
                      difficulty.status === 'match'
                        ? 'bg-emerald-500/10 border-emerald-500/30'
                        : 'bg-amber-500/10 border-amber-500/30'
                    }`}
                  >
                    <div
                      className={`p-1.5 rounded-lg shrink-0 ${difficulty.status === 'match' ? 'bg-emerald-500/20 text-emerald-400 light:text-emerald-700' : 'bg-amber-500/20 text-amber-400 light:text-amber-700'}`}
                    >
                      {difficulty.status === 'match' ? (
                        <CircleCheck className="w-4 h-4" aria-hidden="true" />
                      ) : difficulty.status === 'above' ? (
                        <TrendingUp className="w-4 h-4" aria-hidden="true" />
                      ) : (
                        <TrendingDown className="w-4 h-4" aria-hidden="true" />
                      )}
                    </div>
                    <div>
                      <span
                        className={`t-label block mb-0.5 ${difficulty.status === 'match' ? 'text-emerald-400 light:text-emerald-700' : 'text-amber-400 light:text-amber-700'}`}
                      >
                        {difficulty.status === 'match'
                          ? 'On the syllabus level'
                          : difficulty.status === 'above'
                            ? `Harder than the syllabus asks · +${difficulty.steps} level${difficulty.steps > 1 ? 's' : ''}`
                            : `Easier than the syllabus asks · −${difficulty.steps} level${difficulty.steps > 1 ? 's' : ''}`}
                      </span>
                      <p className="text-xs font-medium text-slate-400 light:text-slate-600 leading-relaxed">
                        {difficulty.status === 'match'
                          ? `This question matches the "${syllabusVerbInfo?.term}" demand of the syllabus dot point.`
                          : difficulty.status === 'above'
                            ? `The dot point only asks students to '${syllabusVerbInfo?.term?.toLowerCase()}' (Band ${syllabusTier} ceiling). Your question demands more than the syllabus requires here.`
                            : `The dot point asks students to '${syllabusVerbInfo?.term?.toLowerCase()}' (Band ${syllabusTier} ceiling). Your question asks for less than the syllabus requires here.`}
                      </p>
                    </div>
                  </div>
                )}
              </section>
            </div>

            <div className="space-y-8 sm:space-y-10">
              <section>
                <div className="flex items-center justify-between gap-3 mb-6">
                  <h4 className="text-sm font-bold text-white light:text-slate-900 flex items-center gap-3">
                    <Briefcase
                      className="w-5 h-5 text-blue-400 light:text-blue-700"
                      aria-hidden="true"
                    />
                    Scenario
                  </h4>
                  {/* Scenario is optional — a direct knowledge/skill question can
                      be generated with no case-study framing. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={includeScenario}
                    aria-label="Include a scenario"
                    onClick={() => setIncludeScenario((v) => !v)}
                    className={`min-h-11 sm:min-h-0 flex items-center gap-2.5 pl-3 pr-1.5 py-1.5 rounded-full border transition-all ${includeScenario ? 'bg-blue-500/10 border-blue-500/30 text-blue-300 light:text-blue-700' : 'bg-white/[0.03] light:bg-slate-100 border-white/10 light:border-slate-300 text-slate-400 light:text-slate-600'}`}
                    title={
                      includeScenario
                        ? 'Scenario on — a context paragraph will be written'
                        : 'Scenario off — a direct question with no scenario'
                    }
                  >
                    <span className="t-label">{includeScenario ? 'Scenario' : 'No scenario'}</span>
                    <span
                      className={`relative w-9 h-5 rounded-full transition-colors ${includeScenario ? 'bg-blue-500' : 'bg-slate-600'}`}
                    >
                      <span
                        className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all ${includeScenario ? 'left-[1.15rem]' : 'left-0.5'}`}
                      />
                    </span>
                  </button>
                </div>
                {includeScenario ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {SCENARIO_TYPES.map((type) => (
                      <button
                        key={type.id}
                        type="button"
                        aria-pressed={scenarioType === type.id}
                        onClick={() => setScenarioType(type.id)}
                        className={`flex items-center gap-4 p-4 rounded-2xl border text-left transition-all duration-300 ${scenarioType === type.id ? 'bg-blue-500/10 border-blue-500/30 shadow-lg' : 'bg-white/[0.03] light:bg-slate-50 border-white/5 light:border-slate-200 hover:bg-white/[0.05] light:hover:bg-slate-100'}`}
                      >
                        <div
                          className={`p-2 rounded-xl flex-shrink-0 transition-colors ${scenarioType === type.id ? 'bg-blue-600 text-white shadow-lg' : 'bg-black/20 light:bg-slate-200 text-muted'}`}
                        >
                          <type.icon className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <div
                            className={`t-label ${scenarioType === type.id ? 'text-white light:text-slate-900' : 'text-slate-400 light:text-slate-600'}`}
                          >
                            {type.label}
                          </div>
                          <div className="t-label text-muted truncate">{type.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-5 rounded-2xl border border-dashed border-white/10 light:border-slate-300 bg-white/[0.02] light:bg-slate-50 text-slate-400 light:text-slate-600">
                    <Info
                      className="w-4 h-4 shrink-0 text-blue-400 light:text-blue-700"
                      aria-hidden="true"
                    />
                    <p className="text-xs font-medium leading-relaxed">
                      This question will be generated as a{' '}
                      <span className="font-bold text-white light:text-slate-900">
                        direct question
                      </span>{' '}
                      with no scenario — the stem stands on its own. Turn the switch back on to add
                      a context paragraph.
                    </p>
                  </div>
                )}
              </section>

              <section
                // The one saturated outline in an otherwise neutral modal,
                // and it was drawn around this band's own pale wash. The
                // chip inside it keeps its edge and becomes the accent.
                style={
                  {
                    '--band-rgb': getBandRgb(getTierTargetBand(selectedTier)),
                  } as React.CSSProperties
                }
                className={`p-6 rounded-panel border band-edge transition-all duration-700 ${activeBandConfig.bg} shadow-lg`}
              >
                <div className="flex justify-between items-center gap-3 mb-6">
                  <h4
                    id="target-band-heading"
                    className={`text-sm font-bold flex items-center gap-3 ${activeBandConfig.text}`}
                  >
                    <Trophy className="w-5 h-5" aria-hidden="true" />
                    Target band
                  </h4>
                  <span
                    className={`t-label px-3 py-1 rounded-full bg-white/10 light:bg-slate-100 ${activeBandConfig.text} border ${activeBandConfig.border}`}
                  >
                    Band {targetBand}
                  </span>
                </div>
                <div
                  role="group"
                  aria-labelledby="target-band-heading"
                  className="relative h-14 flex items-center px-4"
                >
                  <div className="absolute inset-x-8 h-1 top-1/2 -translate-y-1/2 rounded-full bg-black/20 shadow-inner" />
                  <div className="absolute inset-x-8 flex justify-between">
                    {[1, 2, 3, 4, 5, 6].map((b) => {
                      const bConf = getBandConfig(b);
                      const isTarget = targetBand === b;
                      const isCappedOut = b > tierMaxBand;
                      return (
                        <button
                          key={b}
                          type="button"
                          onClick={() => !isCappedOut && setTargetBand(b)}
                          disabled={isCappedOut}
                          aria-pressed={isTarget}
                          aria-label={`Target Band ${b}`}
                          title={
                            isCappedOut
                              ? `'${activeTierInfo?.title}' verbs support up to Band ${tierMaxBand}`
                              : `Target Band ${b}`
                          }
                          className={`relative z-10 w-11 h-11 sm:w-10 sm:h-10 shrink-0 rounded-2xl flex items-center justify-center text-xs font-bold transition-all duration-500 transform ${
                            isTarget
                              ? `${bConf.solidBg} ${bConf.solidText} shadow-lg scale-110 border border-white/20`
                              : isCappedOut
                                ? 'bg-black/20 light:bg-slate-100 text-slate-700 border border-white/5 light:border-slate-200 cursor-not-allowed line-through'
                                : 'bg-black/40 light:bg-slate-200 text-muted hover:scale-110 hover:text-white light:hover:text-slate-900 border border-white/5 light:border-slate-300'
                          }`}
                        >
                          {b}
                        </button>
                      );
                    })}
                  </div>
                </div>
                {tierMaxBand < 6 && (
                  <p className="t-label mt-3 text-muted text-center">
                    These verbs support up to Band {tierMaxBand}
                  </p>
                )}
              </section>
            </div>
          </div>

          <section className="pt-6 border-t border-white/5 light:border-slate-200">
            <h4 className="text-sm font-bold text-white light:text-slate-900 flex items-center gap-3 mb-6">
              <Wrench className="w-5 h-5 text-amber-400 light:text-amber-700" aria-hidden="true" />
              Command verb
            </h4>
            <div className="flex flex-wrap gap-2 p-6 bg-black/40 light:bg-slate-100 rounded-panel border border-white/5 light:border-slate-200 shadow-inner">
              {verbsForCurrentTier.map((verb) => (
                <button
                  key={verb.term}
                  type="button"
                  aria-pressed={selectedSpecificVerb === verb.term}
                  onClick={() => setSelectedSpecificVerb(verb.term)}
                  title={`${verb.term}: ${verb.markRange[0]}–${verb.markRange[1]} marks`}
                  className={`min-h-11 sm:min-h-0 t-label px-4 py-2 rounded-xl transition-all duration-300 border ${selectedSpecificVerb === verb.term ? `${activeBandConfig.bg} ${activeBandConfig.border} ${activeBandConfig.text} shadow-lg scale-105` : 'bg-white/5 light:bg-slate-50 border-transparent light:border-slate-200 text-muted hover:text-white light:hover:text-slate-900 hover:border-white/10 light:hover:border-slate-400'}`}
                >
                  {verb.term}
                </button>
              ))}
            </div>
          </section>
        </div>

        {/* Footer: the summary of what will be built, then the actions. */}
        <div className={CREATOR_FOOTER}>
          <p className="flex-1 min-w-0 text-sm text-[rgb(var(--color-text-secondary))]">
            A{' '}
            <strong className="font-semibold text-[rgb(var(--color-text-primary))]">
              {marks}-mark {activeTierInfo?.title}
            </strong>{' '}
            question aimed at{' '}
            <strong className="font-semibold text-[rgb(var(--color-text-primary))]">
              Band {targetBand}
            </strong>
            {selectedVerbInfo && (
              <span className="text-muted">
                {' '}
                ({selectedVerbInfo.markRange[0]}–{selectedVerbInfo.markRange[1]} mark range)
              </span>
            )}
            {focusCount > 0 && (
              <span className="text-emerald-700 dark:text-emerald-400">
                {` · scoped to ${focusCount} ${focusCount === 1 ? 'part' : 'parts'} of the dot point`}
              </span>
            )}
          </p>

          <div className="flex w-full sm:w-auto gap-3 justify-end">
            <button
              type="button"
              onClick={handleClose}
              disabled={isLoading}
              className={CREATOR_SECONDARY_BUTTON}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isLoading}
              className={CREATOR_PRIMARY_BUTTON}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                  <span>Generating…</span>
                </>
              ) : (
                <>
                  <Wand2 className="w-4 h-4" aria-hidden="true" />
                  <span>Generate question</span>
                </>
              )}
            </button>
          </div>
        </div>

        <AiBusyOverlay show={isLoading} z="z-[100]">
          <LoadingIndicator
            task="generation"
            message="Writing your question"
            messages={[
              focusItems.length > 0
                ? 'Reading the parts of the dot point you chose'
                : 'Reading the dot point',
              selectedSpecificVerb
                ? `Pitching it to '${selectedSpecificVerb}'`
                : 'Choosing a command verb',
              includeScenario ? 'Writing a scenario' : 'Writing a direct question',
              'Drafting the marking guidelines',
            ]}
            duration={12}
            band={selectedTier}
          />
        </AiBusyOverlay>
      </div>
    </div>,
    document.body
  );
};

export default PromptGeneratorModal;
