import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Prompt, UserRole, CourseOutcome } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import {
  Edit3,
  Save,
  X,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  BookOpen,
  Link2,
  Wand2,
  Award,
  ShieldCheck,
  Info,
  Clock,
  Quote,
  FileQuestion,
  ZoomIn,
  ZoomOut,
  Loader2,
  Target,
  Flag,
} from 'lucide-react';
import { getTierScaleConfig, renderFormattedText } from '../utils/renderUtils';
import { getCommandTermInfo, getTargetBand } from '../data/commandTerms';
import { naturalCardHeight } from '../utils/layoutConstants';
import OutcomeDetailModal from './OutcomeDetailModal';
import FlagContentModal from './FlagContentModal';

interface PromptDisplayProps {
  prompt: Prompt;
  isEnriching: boolean;
  enrichError: string | null;
  onVerbClick: () => void;
  onGenerateScenario: () => void;
  onUpdatePrompt: (updates: Partial<Prompt>) => void;
  isGeneratingScenario: boolean;
  generateScenarioError: string | null;
  courseOutcomes: CourseOutcome[];
  onOutcomeClick: (outcome: CourseOutcome) => void;
  userRole: UserRole;
  onDismissEnrichError: () => void;
  onRunQualityCheck: (content: string, type: 'question' | 'code') => void;
  onSuggestOutcomes: () => void;
  isSuggestingOutcomes: boolean;
  fontSize: number;
  onFontSizeChange: (size: number) => void;
  onHeaderResize?: (height: number) => void;
  minHeaderHeight?: number;
  onTotalHeightChange?: (height: number) => void;
  onFooterResize?: (height: number) => void;
  minFooterHeight?: number;
  minTotalHeight?: number;
  /** Focus Mode: keep the card to just the question — skip the empty scenario
      placeholder and empty outcomes footer so the writing surface stays high
      on screen. Sections with real content still render. */
  condensed?: boolean;
  breadcrumb?: string[];
  /** Exam Mode: the card states the question and nothing that coaches. The
   *  outcome briefing and the verb guide are assistance in the same sense the
   *  hidden reference rail and the writing area's strategy tip are — a student
   *  sitting an exam is not handed the outcomes their answer is marked against,
   *  let alone an AI explanation of how to satisfy them. */
  examMode?: boolean;
}

const MeshOverlay = ({
  opacity = 'opacity-[0.03]',
  color = '%23ffffff',
}: {
  opacity?: string;
  color?: string;
}) => (
  <div
    className={`absolute inset-0 ${opacity} pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='10' height='10' viewBox='0 0 10 10' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v10M0 1h10' stroke='${color}' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

const PromptDisplay: React.FC<PromptDisplayProps> = ({
  prompt,
  isEnriching,
  enrichError,
  onVerbClick,
  onGenerateScenario,
  onUpdatePrompt,
  isGeneratingScenario,
  generateScenarioError,
  courseOutcomes,
  onOutcomeClick,
  userRole,
  onDismissEnrichError,
  onRunQualityCheck,
  onSuggestOutcomes,
  isSuggestingOutcomes,
  fontSize,
  onFontSizeChange,
  onHeaderResize,
  minHeaderHeight,
  onTotalHeightChange,
  onFooterResize,
  minFooterHeight,
  minTotalHeight,
  condensed = false,
  breadcrumb,
  examMode = false,
}) => {
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editQuestionText, setEditQuestionText] = useState(prompt.question);
  const [isEditingScenario, setIsEditingScenario] = useState(false);
  const [editScenarioText, setEditScenarioText] = useState(prompt.scenario || '');
  const [selectedOutcome, setSelectedOutcome] = useState<CourseOutcome | null>(null);
  const [isFlagModalOpen, setIsFlagModalOpen] = useState(false);

  const hasOpenFlag = prompt.contentFlag?.status === 'open';

  const headerRef = useRef<HTMLDivElement>(null);
  const headerContentRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const contentWrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const bodyContentRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const footerContentRef = useRef<HTMLDivElement>(null);

  const canCurate = canCurateContent(userRole);
  const canGenerate = canUseAiGeneration(userRole);
  const verbInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  // The band a full-mark response reaches — used in COPY only ("Band 2").
  const targetBand = useMemo(
    () => getTargetBand(prompt.totalMarks, verbInfo.tier),
    [prompt.totalMarks, verbInfo.tier]
  );
  // Chrome colour = the verb's TIER identity (same scale as the picker and
  // hierarchy ribbon); targetBand stays purely numeric copy ("Band 2").
  const bandConfig = useMemo(() => getTierScaleConfig(verbInfo.tier), [verbInfo.tier]);

  const linkedOutcomes = useMemo(() => {
    if (examMode || !prompt.linkedOutcomes) return [];
    return courseOutcomes.filter((o) => prompt.linkedOutcomes?.includes(o.code));
  }, [courseOutcomes, prompt.linkedOutcomes, examMode]);

  useEffect(() => {
    setEditQuestionText(prompt.question);
  }, [prompt.question]);

  useEffect(() => {
    setEditScenarioText(prompt.scenario || '');
  }, [prompt.scenario]);

  // Header height observation. Reports the header's NATURAL height (content
  // + own padding) rather than its rendered box: the rendered box includes
  // the synced minHeight, which would turn the cross-card height sync into a
  // one-way ratchet that locks in transient wrapped layouts forever.
  useEffect(() => {
    if (!headerContentRef.current || !onHeaderResize) return;

    const observer = new ResizeObserver(() => {
      const header = headerRef.current;
      const content = headerContentRef.current;
      if (!header || !content) return;
      const cs = getComputedStyle(header);
      onHeaderResize(
        content.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      );
    });

    observer.observe(headerContentRef.current);
    return () => observer.disconnect();
  }, [onHeaderResize, prompt.question, prompt.verb, prompt.totalMarks]);

  // Total height observation — the single value the writing area is sized
  // from. It reports the NATURAL height, not the rendered box inflated by the
  // minHeight floor: the inner wrapper is a flex child that stretches to that
  // floor, so measuring it fed the inflated value straight back in and the
  // card could only ever grow. Substituting the body's content height for its
  // rendered height gives a value that shrinks again.
  //
  // The OUTER card is measured, not the inner wrapper, so the two 2px borders
  // are included — the writing area pins itself to this number exactly, and
  // measuring inside the border left it 4px shorter than the prompt.
  useEffect(() => {
    if (!contentWrapRef.current || !onTotalHeightChange) return;

    const report = () =>
      onTotalHeightChange(
        naturalCardHeight(containerRef.current, bodyRef.current, bodyContentRef.current)
      );

    const observer = new ResizeObserver(report);
    observer.observe(contentWrapRef.current);
    if (bodyContentRef.current) observer.observe(bodyContentRef.current);
    report();
    return () => observer.disconnect();
  }, [onTotalHeightChange, prompt.question, prompt.scenario, fontSize]);

  // Footer height observation. Like the header, this reports the NATURAL
  // height (content + own padding). The rendered box carries the synced
  // minFooterHeight, so measuring it fed the inflated value back into the sync
  // and the two footers could only ever grow — a footer that wrapped to two
  // rows at a narrow width stayed tall after widening again.
  useEffect(() => {
    if (!footerContentRef.current || !onFooterResize) return;

    const observer = new ResizeObserver(() => {
      const footer = footerRef.current;
      const content = footerContentRef.current;
      if (!footer || !content) return;
      const cs = getComputedStyle(footer);
      onFooterResize(
        content.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom)
      );
    });

    observer.observe(footerContentRef.current);
    return () => observer.disconnect();
  }, [onFooterResize, linkedOutcomes.length]);

  const handleSaveQuestion = () => {
    if (editQuestionText.trim() !== prompt.question) {
      onUpdatePrompt({ question: editQuestionText.trim() });
    }
    setIsEditingQuestion(false);
  };

  const handleSaveScenario = () => {
    if (editScenarioText.trim() !== prompt.scenario) {
      onUpdatePrompt({ scenario: editScenarioText.trim() });
    }
    setIsEditingScenario(false);
  };

  const handleOutcomeClickInternal = (outcome: CourseOutcome) => {
    setSelectedOutcome(outcome);
    onOutcomeClick(outcome);
  };

  // Anyone can raise a flag; resolving keeps the record (status: 'resolved')
  // so an admin can still see what was reported and when.
  const handleFlag = (reason: string) =>
    onUpdatePrompt({ contentFlag: { reason, flaggedAt: Date.now(), status: 'open' } });
  const handleResolveFlag = () => {
    if (prompt.contentFlag) {
      onUpdatePrompt({ contentFlag: { ...prompt.contentFlag, status: 'resolved' } });
    }
  };

  return (
    <div
      ref={containerRef}
      className={`
            clip-stable relative overflow-hidden rounded-[32px]
            bg-[rgb(var(--color-bg-surface))] light:bg-white
            border-2 ${bandConfig.border} shadow-2xl ${bandConfig.glow}
            transition-[box-shadow,border-color,background-color] duration-500
            group/prompt flex flex-col h-full
        `}
      // min and max are the same value, so the card is exactly the height the
      // sync decided: its own content where that fits, the viewport cap where
      // it doesn't. A question that outruns the cap scrolls in its body rather
      // than pushing the writing area below the fold.
      style={{
        minHeight: minTotalHeight || undefined,
        maxHeight: minTotalHeight ? `${minTotalHeight}px` : undefined,
      }}
    >
      <div ref={contentWrapRef} className="flex flex-col flex-1 min-h-0">
        {/* Header Container */}
        <div
          ref={headerRef}
          className={`px-4 sm:px-8 py-4 sm:py-5 bg-gradient-to-r ${bandConfig.gradient} text-white flex justify-between items-start relative overflow-hidden flex-shrink-0 rounded-t-[30px]`}
          style={{ minHeight: minHeaderHeight ? `${minHeaderHeight}px` : 'auto' }}
        >
          <MeshOverlay opacity="opacity-20" />

          <div
            ref={headerContentRef}
            className="relative z-10 w-full flex flex-wrap justify-between items-start gap-y-3 gap-x-4"
          >
            {/* Left: Icon + Hero Title */}
            <div className="flex items-center gap-3 sm:gap-4 min-w-0">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-lg group flex-shrink-0">
                <FileQuestion className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl sm:text-2xl font-black tracking-tight leading-none flex flex-wrap items-center gap-2 drop-shadow-sm">
                  Writing Prompt
                  {isEnriching && (
                    <span
                      className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] bg-white/15 border border-white/20 rounded-full px-2 py-0.5 animate-fade-in"
                      title="Fetching this question's scenario and syllabus terms in the background — you can start writing now."
                    >
                      <Loader2 className="w-2.5 h-2.5 animate-spin" />
                      Enhancing
                    </span>
                  )}
                  {hasOpenFlag && (
                    <button
                      onClick={() => setIsFlagModalOpen(true)}
                      className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] bg-amber-300/25 border border-amber-200/50 rounded-full px-2 py-0.5 animate-fade-in hover:bg-amber-300/40 transition-colors"
                      title={`Flagged for review: ${prompt.contentFlag?.reason ?? ''}`}
                    >
                      <Flag className="w-2.5 h-2.5" />
                      Flagged
                    </button>
                  )}
                </h3>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/60 mt-1.5">
                  Band {verbInfo.tier} ceiling
                </p>
              </div>
            </div>

            {/* Right: Directive + stat pills */}
            <div className="flex w-full md:w-auto md:ml-auto flex-row md:flex-col flex-wrap items-center md:items-end justify-between gap-2 flex-shrink-0">
              <button
                onClick={onVerbClick}
                disabled={examMode}
                className={`group/vbtn flex items-center gap-2 transition-transform ${examMode ? 'cursor-default' : 'hover:scale-105 active:scale-95'}`}
                title={examMode ? undefined : 'View Verb Definition'}
              >
                <div className="text-left md:text-right">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.3em] text-white/50 mb-0.5">
                    Directive
                  </span>
                  <span className="block text-xl md:text-2xl font-black uppercase tracking-widest leading-none drop-shadow-sm group-hover/vbtn:text-white/90">
                    {prompt.verb}
                  </span>
                </div>
              </button>

              <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest bg-black/20 rounded-xl px-3 py-1.5 border border-white/10 shadow-inner">
                <span className="flex items-center gap-1.5 opacity-90">
                  <Clock className="w-3 h-3 text-white/70" /> {Math.round(prompt.totalMarks * 1.5)}{' '}
                  min
                </span>
                <span className="w-px h-3 bg-white/20"></span>
                <span className="flex items-center gap-1.5 opacity-90">
                  <Award className="w-3 h-3 text-white/70" /> {prompt.totalMarks} Marks
                </span>
                <span className="w-px h-3 bg-white/20"></span>
                <span
                  className="flex items-center gap-1.5 font-black"
                  title={`A full-mark response to this ${prompt.verb} question reaches Band ${targetBand}.`}
                >
                  <Target className="w-3 h-3 text-white/70" /> Band {targetBand}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Ambient Tier Glow & Gradient Background */}
        <div
          className={`absolute inset-0 bg-gradient-to-br ${bandConfig.gradient} opacity-[0.03] pointer-events-none`}
        />

        <div ref={bodyRef} className="flex-1 flex flex-col min-h-0 overflow-y-auto">
          <div
            ref={bodyContentRef}
            className={`${condensed ? 'p-6 sm:p-8' : 'p-6 sm:p-8 pb-4 sm:pb-4'} relative z-10 flex flex-col gap-6 sm:gap-8`}
          >
            {/* Question Section - "The Canvas" */}
            <div className="group/question relative pt-2">
              {isEditingQuestion ? (
                <div className="animate-fade-in space-y-3 p-2 bg-[rgb(var(--color-bg-surface-inset))] light:bg-white rounded-3xl border border-white/10 light:border-slate-300 shadow-inner">
                  <textarea
                    value={editQuestionText}
                    onChange={(e) => setEditQuestionText(e.target.value)}
                    className="w-full bg-transparent border-none p-4 font-serif font-medium outline-none text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder-slate-500 min-h-[120px]"
                    style={{ fontSize: `${fontSize * 1.2}px`, lineHeight: 1.3 }}
                    autoFocus
                  />
                  <div className="flex justify-end gap-2 px-4 pb-2">
                    <button
                      onClick={() => setIsEditingQuestion(false)}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSaveQuestion}
                      className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 shadow-lg flex items-center gap-2 transition-all hover:scale-105 active:scale-95"
                    >
                      <Save className="w-3.5 h-3.5" /> Save Changes
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative pl-2">
                  <h2
                    className="font-medium text-[rgb(var(--color-text-primary))] light:text-slate-900 font-serif tracking-tight break-words"
                    style={{ fontSize: `${fontSize * 1.2}px`, lineHeight: 1.3 }}
                  >
                    {renderFormattedText(prompt.question, prompt.keywords, prompt.verb)}
                  </h2>
                  {/* Curator controls: hover-revealed on pointer devices; on
                    phones (no hover) they sit in flow under the question
                    instead of absolutely positioned into the header. */}
                  {canCurate && (
                    <div className="flex gap-2 justify-end mt-3 sm:mt-0 sm:absolute sm:-right-4 sm:-top-10 sm:opacity-0 sm:group-hover/question:opacity-100 transition-opacity">
                      {canGenerate && (
                        <button
                          onClick={() => onRunQualityCheck(prompt.question, 'question')}
                          className="p-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-white/10 light:border-slate-300 text-emerald-400 hover:text-emerald-300 shadow-xl hover:scale-110 transition-all"
                          title="Run Quality Check"
                        >
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => setIsEditingQuestion(true)}
                        className="p-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-white/10 light:border-slate-300 text-slate-400 light:text-slate-500 hover:text-white light:hover:text-indigo-600 shadow-xl hover:scale-110 transition-all"
                        title="Edit Question"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Scenario Section - "The Context" */}
            {!(condensed && !prompt.scenario && !isEditingScenario) && (
              <div className="relative group/scenario">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 light:text-slate-600 flex items-center gap-2">
                    <BookOpen className="w-3.5 h-3.5" /> Context Scenario
                  </h3>
                  {canCurate && !isEditingScenario && (
                    <div className="flex gap-2 opacity-100 sm:opacity-0 sm:group-hover/prompt:opacity-100 transition-opacity">
                      {canGenerate && (
                        <button
                          onClick={onGenerateScenario}
                          disabled={isGeneratingScenario}
                          className="p-1.5 rounded-lg text-indigo-400 hover:bg-indigo-500/10 transition-colors"
                          title="Regenerate Scenario"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${isGeneratingScenario ? 'animate-spin' : ''}`}
                          />
                        </button>
                      )}
                      <button
                        onClick={() => setIsEditingScenario(true)}
                        className="p-1.5 rounded-lg text-slate-400 light:text-slate-500 hover:text-white light:hover:text-indigo-600 hover:bg-white/10 light:hover:bg-slate-100 transition-colors"
                        title="Edit Scenario"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                {isEditingScenario ? (
                  <div className="animate-fade-in space-y-3 p-2 bg-[rgb(var(--color-bg-surface-inset))] light:bg-white rounded-2xl border border-white/10 light:border-slate-300">
                    <textarea
                      value={editScenarioText}
                      onChange={(e) => setEditScenarioText(e.target.value)}
                      className="w-full bg-transparent border-none p-4 font-medium outline-none text-[rgb(var(--color-text-primary))] light:text-slate-900 resize-none font-serif leading-relaxed"
                      style={{ fontSize: `${fontSize}px` }}
                      rows={4}
                    />
                    <div className="flex justify-end gap-2 px-2 pb-2">
                      <button
                        onClick={() => {
                          setEditScenarioText(prompt.scenario || '');
                          setIsEditingScenario(false);
                        }}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveScenario}
                        className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 flex items-center gap-2 shadow-md hover:scale-105 active:scale-95 transition-all"
                      >
                        <Save className="w-3.5 h-3.5" /> Save Scenario
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`
                           relative p-6 rounded-2xl transition-all duration-300
                           ${
                             prompt.scenario
                               ? `bg-black/20 light:bg-slate-100 border-2 border-white/10 light:border-slate-300 shadow-inner`
                               : 'bg-transparent border-dashed border border-slate-700/50 light:border-slate-300'
                           }
                       `}
                  >
                    {prompt.scenario ? (
                      <div className="relative">
                        {/* Decorative Quote Icon */}
                        <Quote className="absolute -top-3 -left-2 w-6 h-6 text-slate-500/20 light:text-slate-400/30 transform rotate-180" />
                        <p
                          className="text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-relaxed font-serif italic pl-6 pr-2 break-words"
                          style={{ fontSize: `${fontSize}px` }}
                        >
                          {renderFormattedText(prompt.scenario, prompt.keywords, prompt.verb)}
                        </p>
                      </div>
                    ) : (
                      /* Compact empty state — a single row, so a scenario-less
                       question doesn't push the writing surface down screen. */
                      <div className="flex flex-wrap items-center justify-center py-2 text-center gap-x-4 gap-y-2">
                        <p className="text-xs text-slate-500 font-medium">No scenario provided.</p>
                        {canGenerate && (
                          <button
                            onClick={onGenerateScenario}
                            disabled={isGeneratingScenario}
                            className="px-4 py-2 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold hover:bg-indigo-500/20 transition-all flex items-center gap-2 hover:scale-105"
                          >
                            <Sparkles className="w-3.5 h-3.5" /> Generate Context
                          </button>
                        )}
                      </div>
                    )}
                    {isGeneratingScenario && (
                      <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/80 light:bg-white/80 backdrop-blur-sm flex items-center justify-center rounded-2xl z-10">
                        <div className="flex items-center gap-3 text-sm font-bold text-indigo-400">
                          <Sparkles className="w-4 h-4 animate-pulse" /> Generating Context...
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {generateScenarioError && (
                  <div className="mt-3 text-xs text-red-400 flex items-center gap-2 bg-red-500/10 p-3 rounded-xl border border-red-500/20 animate-fade-in">
                    <AlertTriangle className="w-3.5 h-3.5" /> {generateScenarioError}
                  </div>
                )}
              </div>
            )}

            {/* Enrich Error Banner */}
            {enrichError && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between animate-fade-in">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                  <Info className="w-3.5 h-3.5" />
                  <span>Context Enrichment Failed: {enrichError}</span>
                </div>
                <button
                  onClick={onDismissEnrichError}
                  aria-label="Dismiss"
                  className="p-1 hover:bg-amber-500/20 rounded text-amber-400"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Outcomes Footer - "The Evidence". A sibling of the scroll region, not
          a child of it, so the syllabus link, outcome chips and zoom controls
          stay pinned to the bottom instead of scrolling out of reach when a
          long scenario overflows. */}
        {!(condensed && linkedOutcomes.length === 0) && (
          <div
            ref={footerRef}
            className="relative z-10 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50 border-t border-white/10 light:border-slate-200/50 px-4 sm:px-6 py-3 flex items-center backdrop-blur-sm mt-auto flex-shrink-0 rounded-b-[30px]"
            style={{ minHeight: minFooterHeight || 52 }}
          >
            {/* Inner wrapper carries the row layout so its height stays
              content-driven — the outer box is inflated by the synced
              minFooterHeight and cannot be measured. */}
            <div
              ref={footerContentRef}
              className="w-full flex flex-wrap items-center gap-x-3 sm:gap-x-6 gap-y-3"
            >
              {/* On phones: label and the flag/zoom controls share the first row
                and the outcome chips wrap to a full-width second row — two rows,
                not three. The label may shrink (`min-w-0`) to keep it that way.
                From sm up: label | chips | controls. */}
              <div className="order-1 flex items-center gap-2 sm:gap-4 min-w-0">
                {/* The whole label is the entry point, not just the chips. The
                  chips say WHICH outcomes apply; this says what opening them
                  gets you — a plain-English brief on what the markers want,
                  worth reading before the first sentence is written. */}
                {linkedOutcomes.length > 0 ? (
                  <button
                    onClick={() => handleOutcomeClickInternal(linkedOutcomes[0])}
                    title="Open the outcome brief — what this question is assessing, in plain English"
                    className={`flex items-center gap-2 sm:gap-3 group/link rounded-xl pr-1.5 sm:pr-3 -ml-1 pl-1 py-1 transition-all hover:bg-white/5 light:hover:bg-slate-100 active:scale-[0.98] ${bandConfig.border} border border-transparent hover:border-current/10`}
                  >
                    {/* Decorative icon tile — the inline Sparkles carries the
                      "there is something to read here" cue on its own, so the
                      tile is dropped on phones to buy the row its 44px. */}
                    <div
                      className={`
                                  hidden sm:block p-2.5 rounded-xl border shadow-sm backdrop-blur-sm transition-all duration-300
                                  ${bandConfig.bg} border-white/10 group-hover/link:scale-110
                              `}
                    >
                      <Link2 className={`w-4 h-4 ${bandConfig.text}`} />
                    </div>
                    <div className="flex flex-col text-left">
                      {/* The eyebrow is the first casualty whenever the row is
                        tight: it is the widest element in it and "What's
                        assessed" already says what the button does. It costs a
                        whole extra footer row on a phone AND in the two-column
                        layout below xl, where this card is only ~380px wide. */}
                      <span className="hidden xl:block text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 light:text-slate-500 leading-none mb-1">
                        Before you write
                      </span>
                      <span
                        className={`text-xs font-bold ${bandConfig.text} flex items-center gap-1.5`}
                      >
                        <Sparkles className="w-3 h-3 opacity-70" />
                        What&apos;s assessed
                      </span>
                    </div>
                  </button>
                ) : examMode ? null : (
                  <div className="flex items-center gap-3 group/link">
                    <div
                      className={`
                                  p-2.5 rounded-xl border shadow-sm backdrop-blur-sm transition-all duration-300
                                  ${bandConfig.bg} border-white/10 group-hover/link:scale-110
                              `}
                    >
                      <Link2 className={`w-4 h-4 ${bandConfig.text}`} />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-500 light:text-slate-500 leading-none mb-1">
                        Syllabus
                      </span>
                      <span className={`text-xs font-bold ${bandConfig.text}`}>Outcome Link</span>
                    </div>
                  </div>
                )}
                {canGenerate && onSuggestOutcomes && !examMode && (
                  <button
                    onClick={onSuggestOutcomes}
                    disabled={isSuggestingOutcomes}
                    className={`p-2 rounded-lg bg-[rgb(var(--color-accent))]/10 text-[rgb(var(--color-accent))] hover:bg-[rgb(var(--color-accent))]/20 transition-all ${isSuggestingOutcomes ? 'animate-pulse' : 'hover:scale-110'}`}
                    title="Auto-link Outcomes with AI"
                  >
                    <Wand2
                      className={`w-3.5 h-3.5 ${isSuggestingOutcomes ? 'animate-spin' : ''}`}
                    />
                  </button>
                )}
              </div>

              {/* A full-width row of their own, at every width. Sharing row one
                as a `flex-1` column left them ~130px between the label and the
                controls, so two codes stacked one per line and the footer grew
                a row taller than it needed to be. */}
              <div className="order-3 w-full min-w-0 flex flex-wrap gap-2">
                {linkedOutcomes.length > 0 ? (
                  linkedOutcomes.map((outcome) => (
                    <div key={outcome.code} className="relative group/outcome">
                      <button
                        onClick={() => handleOutcomeClickInternal(outcome)}
                        title={`Open the brief for ${outcome.code} — what it asks for and how it applies to this question`}
                        className={`
                        flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider whitespace-nowrap
                        ${bandConfig.bg} border ${bandConfig.border}
                        ${bandConfig.text} transition-all duration-300 cursor-pointer
                        hover:brightness-125 hover:scale-105 hover:shadow-md
                        active:scale-95
                      `}
                      >
                        <Target className="w-2.5 h-2.5 opacity-60" />
                        {outcome.code}
                      </button>
                      {/* Desktop-only preview. Touch browsers keep a tapped
                        element in :hover, so on a phone this 288px panel
                        latched open over the question — and it had nothing to
                        add there anyway, since the tap opens the full brief. */}
                      <div className="hidden sm:block absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 p-4 text-xs text-left font-medium leading-relaxed text-white light:text-slate-800 bg-[rgb(var(--color-bg-surface-elevated))]/95 light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-200 rounded-2xl shadow-2xl opacity-0 group-hover/outcome:opacity-100 transition-all duration-300 pointer-events-none z-50 backdrop-blur-xl translate-y-2 group-hover/outcome:translate-y-0">
                        <div className={`flex items-center gap-2 mb-2 ${bandConfig.text}`}>
                          <Award className="w-3.5 h-3.5" />
                          <span className="font-black uppercase tracking-widest text-[10px]">
                            Objective
                          </span>
                        </div>
                        {outcome.description}
                        <div
                          className={`mt-2.5 pt-2.5 border-t border-white/10 light:border-slate-200 flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest ${bandConfig.text}`}
                        >
                          <Sparkles className="w-3 h-3" />
                          Click for the full brief
                        </div>
                      </div>
                    </div>
                  ))
                ) : examMode ? null : (
                  <span className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-400 italic font-medium py-2 opacity-60">
                    No specific outcomes linked.
                  </span>
                )}
              </div>

              <div className="order-2 flex items-center gap-2 ml-auto flex-shrink-0">
                <button
                  onClick={() => setIsFlagModalOpen(true)}
                  className={`p-1.5 sm:p-2 rounded-lg border transition-all ${
                    hasOpenFlag
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-500 hover:bg-amber-500/25'
                      : 'bg-black/10 light:bg-slate-200/50 border-white/10 light:border-slate-300 text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:text-amber-500'
                  }`}
                  title={
                    hasOpenFlag
                      ? 'This question is flagged for review — click to view'
                      : 'Something off about this question? Flag it for review'
                  }
                >
                  <Flag className={`w-3.5 h-3.5 ${hasOpenFlag ? 'fill-current' : ''}`} />
                </button>

                <div className="flex items-center gap-1 bg-black/10 light:bg-slate-200/50 backdrop-blur-xl p-1 rounded-lg border border-white/10 light:border-slate-300 shadow-inner">
                  <button
                    onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
                    className="p-1 sm:p-1.5 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-white/10 light:hover:bg-black/5 rounded-md transition-colors"
                    title="Decrease font size"
                  >
                    <ZoomOut className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[10px] font-mono font-bold text-[rgb(var(--color-text-muted))] w-6 text-center select-none">
                    {fontSize}
                  </span>
                  <button
                    onClick={() => onFontSizeChange(Math.min(48, fontSize + 2))}
                    className="p-1 sm:p-1.5 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-white/10 light:hover:bg-black/5 rounded-md transition-colors"
                    title="Increase font size"
                  >
                    <ZoomIn className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedOutcome && (
          <OutcomeDetailModal
            isOpen={!!selectedOutcome}
            onClose={() => setSelectedOutcome(null)}
            outcomes={linkedOutcomes}
            initialCode={selectedOutcome.code}
            question={prompt.question}
            tier={verbInfo.tier}
            verb={prompt.verb}
            totalMarks={prompt.totalMarks}
            breadcrumb={breadcrumb}
          />
        )}

        <FlagContentModal
          isOpen={isFlagModalOpen}
          onClose={() => setIsFlagModalOpen(false)}
          itemLabel="question"
          existingFlag={prompt.contentFlag}
          onFlag={handleFlag}
          onResolve={handleResolveFlag}
        />
      </div>
    </div>
  );
};

export default PromptDisplay;
