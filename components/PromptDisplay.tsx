import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Prompt, UserRole, CourseOutcome } from '../types';
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
} from 'lucide-react';
import { getBandConfig, renderFormattedText } from '../utils/renderUtils';
import { getCommandTermInfo } from '../data/commandTerms';
import OutcomeDetailModal from './OutcomeDetailModal';

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
}) => {
  const [isEditingQuestion, setIsEditingQuestion] = useState(false);
  const [editQuestionText, setEditQuestionText] = useState(prompt.question);
  const [isEditingScenario, setIsEditingScenario] = useState(false);
  const [editScenarioText, setEditScenarioText] = useState(prompt.scenario || '');
  const [selectedOutcome, setSelectedOutcome] = useState<CourseOutcome | null>(null);

  const headerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const isAdmin = userRole === 'admin';
  const verbInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  // Use the verb's Tier to determine the band config (color) for the header
  const bandConfig = useMemo(() => getBandConfig(verbInfo.tier), [verbInfo.tier]);

  const linkedOutcomes = useMemo(() => {
    if (!prompt.linkedOutcomes) return [];
    return courseOutcomes.filter((o) => prompt.linkedOutcomes?.includes(o.code));
  }, [courseOutcomes, prompt.linkedOutcomes]);

  useEffect(() => {
    setEditQuestionText(prompt.question);
  }, [prompt.question]);

  useEffect(() => {
    setEditScenarioText(prompt.scenario || '');
  }, [prompt.scenario]);

  // Header height observation
  useEffect(() => {
    if (!headerRef.current || !onHeaderResize) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === headerRef.current) {
          onHeaderResize(entry.borderBoxSize[0].blockSize);
        }
      }
    });

    observer.observe(headerRef.current);
    return () => observer.disconnect();
  }, [onHeaderResize, prompt.question, prompt.verb, prompt.totalMarks]);

  // Total height observation
  useEffect(() => {
    if (!containerRef.current || !onTotalHeightChange) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        if (entry.target === containerRef.current) {
          onTotalHeightChange(entry.borderBoxSize[0].blockSize);
        }
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [onTotalHeightChange, prompt.question, prompt.scenario, fontSize]);

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

  return (
    <div
      ref={containerRef}
      className={`
            relative overflow-hidden rounded-[32px] 
            bg-[rgb(var(--color-bg-surface))] light:bg-white 
            border-2 ${bandConfig.border} ${bandConfig.glow}
            transition-all duration-500 group/prompt flex flex-col h-full
        `}
    >
      {/* Header Container */}
      <div
        ref={headerRef}
        className={`px-8 py-5 bg-gradient-to-r ${bandConfig.gradient} text-white flex justify-between items-center relative overflow-hidden flex-shrink-0`}
        style={{ minHeight: minHeaderHeight ? `${minHeaderHeight}px` : 'auto' }}
      >
        <MeshOverlay opacity="opacity-20" />

        {/* Content */}
        <div className="relative z-10 w-full flex justify-between items-center">
          {/* Left: Title & Icon */}
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-xl flex items-center justify-center border border-white/30 shadow-lg group flex-shrink-0">
              <FileQuestion className="w-6 h-6 text-white group-hover:scale-110 transition-transform" />
            </div>
            <div>
              <h3 className="text-lg md:text-xl font-black tracking-tight leading-none flex items-center gap-2">
                Writing Prompt
              </h3>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] font-black uppercase tracking-[0.2em] opacity-70">
                  Tier {verbInfo.tier} • Cognitive Challenge
                </span>
              </div>
            </div>
          </div>

          {/* Right: Directive, Time, Marks */}
          <div className="flex flex-col items-end gap-2 flex-shrink-0">
            <div className="flex items-center gap-4">
              <button
                onClick={onVerbClick}
                className="group/vbtn flex items-center gap-2 transition-transform hover:scale-105 active:scale-95"
                title="View Verb Definition"
              >
                <div className="text-right">
                  <span className="block text-[9px] font-bold uppercase tracking-[0.3em] opacity-60 mb-0.5">
                    Directive
                  </span>
                  <span className="block text-xl md:text-2xl font-black uppercase tracking-widest leading-none drop-shadow-sm group-hover/vbtn:text-white/90">
                    {prompt.verb}
                  </span>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-3 text-[10px] font-bold uppercase tracking-widest bg-black/20 rounded-lg px-2 py-1 border border-white/10 shadow-inner">
              <span className="flex items-center gap-1.5 opacity-90">
                <Clock className="w-3 h-3 text-white/70" /> {Math.round(prompt.totalMarks * 1.5)}{' '}
                min
              </span>
              <span className="w-px h-3 bg-white/20"></span>
              <span className="flex items-center gap-1.5 opacity-90">
                <Award className="w-3 h-3 text-white/70" /> {prompt.totalMarks} Marks
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ambient Tier Glow & Gradient Background */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${bandConfig.gradient} opacity-[0.03] pointer-events-none`}
      />

      <div className="flex-1 flex flex-col min-h-0">
        <div className="p-8 sm:p-10 pb-4 relative z-10 flex flex-col gap-8">
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
                  className="font-medium text-[rgb(var(--color-text-primary))] light:text-slate-900 font-serif tracking-tight"
                  style={{ fontSize: `${fontSize * 1.2}px`, lineHeight: 1.3 }}
                >
                  {renderFormattedText(prompt.question, prompt.keywords, prompt.verb)}
                </h2>
                {isAdmin && (
                  <div className="absolute -right-4 -top-10 opacity-0 group-hover/question:opacity-100 transition-opacity flex gap-2">
                    <button
                      onClick={() => onRunQualityCheck(prompt.question, 'question')}
                      className="p-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-white/10 light:border-slate-300 text-emerald-400 hover:text-emerald-300 shadow-xl hover:scale-110 transition-all"
                      title="Run Quality Check"
                    >
                      <ShieldCheck className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setIsEditingQuestion(true)}
                      className="p-2.5 rounded-xl bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-white/10 light:border-slate-300 text-slate-400 hover:text-white light:hover:text-indigo-600 shadow-xl hover:scale-110 transition-all"
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
          <div className="relative group/scenario">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-500 light:text-slate-400 flex items-center gap-2">
                <BookOpen className="w-3.5 h-3.5" /> Context Scenario
              </h3>
              {isAdmin && !isEditingScenario && (
                <div className="flex gap-2 opacity-0 group-hover/prompt:opacity-100 transition-opacity">
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
                  <button
                    onClick={() => setIsEditingScenario(true)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white light:hover:text-indigo-600 hover:bg-white/10 transition-colors"
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
                      className="text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-relaxed font-serif italic pl-6 pr-2"
                      style={{ fontSize: `${fontSize}px` }}
                    >
                      {renderFormattedText(prompt.scenario, prompt.keywords, prompt.verb)}
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-8 text-center gap-3">
                    <p className="text-xs text-slate-500 mb-1 font-medium">No scenario provided.</p>
                    {isAdmin && (
                      <button
                        onClick={onGenerateScenario}
                        disabled={isGeneratingScenario}
                        className="px-5 py-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 text-xs font-bold hover:bg-indigo-500/20 transition-all flex items-center gap-2 hover:scale-105"
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

          {/* Enrich Error Banner */}
          {enrichError && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between animate-fade-in">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400">
                <Info className="w-3.5 h-3.5" />
                <span>Context Enrichment Failed: {enrichError}</span>
              </div>
              <button
                onClick={onDismissEnrichError}
                className="p-1 hover:bg-amber-500/20 rounded text-amber-400"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Outcomes Footer - "The Evidence" */}
        <div className="relative z-10 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50 border-t border-white/5 light:border-slate-200/50 px-6 py-3 flex flex-col sm:flex-row sm:items-center gap-6 backdrop-blur-sm mt-auto flex-shrink-0">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6 flex-1 min-w-0">
            <div className="flex items-center justify-between sm:justify-start gap-4 flex-shrink-0 min-w-[140px]">
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
              {isAdmin && onSuggestOutcomes && (
                <button
                  onClick={onSuggestOutcomes}
                  disabled={isSuggestingOutcomes}
                  className={`p-2 rounded-lg bg-[rgb(var(--color-accent))]/10 text-[rgb(var(--color-accent))] hover:bg-[rgb(var(--color-accent))]/20 transition-all ${isSuggestingOutcomes ? 'animate-pulse' : 'hover:scale-110'}`}
                  title="Auto-link Outcomes with AI"
                >
                  <Wand2 className={`w-3.5 h-3.5 ${isSuggestingOutcomes ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>

            <div className="flex flex-wrap gap-2.5">
              {linkedOutcomes.length > 0 ? (
                linkedOutcomes.map((outcome) => (
                  <div key={outcome.code} className="relative group/outcome">
                    <button
                      onClick={() => handleOutcomeClickInternal(outcome)}
                      className={`
                                            flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider
                                            bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white border border-white/5 light:border-slate-200
                                            text-slate-400 light:text-slate-600 transition-all duration-300
                                            hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-50 hover:text-[rgb(var(--color-text-primary))] light:hover:text-slate-900 hover:border-white/10 light:hover:border-slate-300 hover:scale-105 hover:shadow-md
                                            active:scale-95
                                        `}
                    >
                      {outcome.code}
                    </button>
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 p-4 text-xs text-left font-medium leading-relaxed text-white light:text-slate-800 bg-[rgb(var(--color-bg-surface-elevated))]/95 light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-200 rounded-2xl shadow-2xl opacity-0 group-hover/outcome:opacity-100 transition-all duration-300 pointer-events-none z-50 backdrop-blur-xl translate-y-2 group-hover/outcome:translate-y-0">
                      <div className={`flex items-center gap-2 mb-2 ${bandConfig.text}`}>
                        <Award className="w-3.5 h-3.5" />
                        <span className="font-black uppercase tracking-widest text-[10px]">
                          Objective
                        </span>
                      </div>
                      {outcome.description}
                    </div>
                  </div>
                ))
              ) : (
                <span className="text-xs text-[rgb(var(--color-text-dim))] light:text-slate-400 italic font-medium py-2 opacity-60">
                  No specific outcomes linked.
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 bg-black/10 light:bg-slate-200/50 backdrop-blur-xl p-1 rounded-lg border border-white/10 light:border-slate-300 shadow-inner ml-auto flex-shrink-0">
            <button
              onClick={() => onFontSizeChange(Math.max(12, fontSize - 2))}
              className="p-1.5 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-white/10 light:hover:bg-black/5 rounded-md transition-colors"
              title="Decrease font size"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono font-bold text-[rgb(var(--color-text-muted))] w-6 text-center select-none">
              {fontSize}
            </span>
            <button
              onClick={() => onFontSizeChange(Math.min(48, fontSize + 2))}
              className="p-1.5 text-[rgb(var(--color-text-secondary))] hover:text-[rgb(var(--color-text-primary))] hover:bg-white/10 light:hover:bg-black/5 rounded-md transition-colors"
              title="Increase font size"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {selectedOutcome && (
        <OutcomeDetailModal
          isOpen={!!selectedOutcome}
          onClose={() => setSelectedOutcome(null)}
          outcome={selectedOutcome}
          question={prompt.question}
        />
      )}
    </div>
  );
};

export default PromptDisplay;
