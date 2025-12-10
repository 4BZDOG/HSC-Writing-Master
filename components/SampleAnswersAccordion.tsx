
import React, { useState, useMemo, KeyboardEvent, useEffect } from 'react';
import { Prompt, SampleAnswer, UserRole } from '../types';
import { renderFormattedText, getBandConfig } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import SampleAnswerGeneratorModal from './SampleAnswerGeneratorModal';
import SampleAnswerRevisionModal from './SampleAnswerRevisionModal';
import SampleAnswerEditorModal from './SampleAnswerEditorModal';
import { ChevronDown, FileText, Sparkles, Award, Edit3, Repeat, Trash2, Pencil, ChevronLeft, ChevronRight, BadgeAlert, User as UserIcon, BookOpen } from 'lucide-react';
import { useAnswerMetrics } from '../hooks/useAnswerMetrics';
import AnswerMetricsDisplay from './AnswerMetricsDisplay';

// Grouped type for rendering
interface GroupedSampleAnswers {
    mark: number;
    answers: SampleAnswer[];
    band: number;
    calculatedBand: number; // To check against strict criteria
}

const SourceBadge: React.FC<{ source?: string }> = ({ source }) => {
    if (source === 'USER') {
        return (
            <span className="inline-flex items-center gap-1 text-[9px] font-black bg-blue-500/10 light:bg-blue-50 text-blue-400 light:text-blue-700 px-1.5 py-0.5 rounded border border-blue-500/20 light:border-blue-200 uppercase tracking-wider">
                <UserIcon className="w-2.5 h-2.5" /> Student
            </span>
        );
    }
    if (source === 'HSC_EXEMPLAR') {
        return (
            <span className="inline-flex items-center gap-1 text-[9px] font-black bg-amber-500/10 light:bg-amber-50 text-amber-400 light:text-amber-700 px-1.5 py-0.5 rounded border border-amber-500/20 light:border-amber-200 uppercase tracking-wider">
                <BookOpen className="w-2.5 h-2.5" /> HSC
            </span>
        );
    }
    // Default AI
    return (
        <span className="inline-flex items-center gap-1 text-[9px] font-black bg-purple-500/10 light:bg-purple-50 text-purple-400 light:text-purple-700 px-1.5 py-0.5 rounded border border-purple-500/20 light:border-purple-200 uppercase tracking-wider">
            <Sparkles className="w-2.5 h-2.5" /> AI
        </span>
    );
};

const CarouselAccordionItem: React.FC<{
  group: GroupedSampleAnswers;
  prompt: Prompt;
  isOpen: boolean;
  onToggle: () => void;
  onUseSample: (answer: string) => void;
  onRevise: (sample: SampleAnswer) => void;
  onEdit: (sample: SampleAnswer) => void;
  onDelete: (id: string) => void;
  canModify: boolean;
}> = React.memo(({ group, prompt, isOpen, onToggle, onUseSample, onRevise, onEdit, onDelete, canModify }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // Reset index when group length changes (e.g., deletion)
  useEffect(() => {
    if (currentIndex >= group.answers.length && group.answers.length > 0) {
        setCurrentIndex(group.answers.length - 1);
    }
  }, [group.answers.length, currentIndex]);

  const currentSample = group.answers[currentIndex];

  // Determine safe values for hooks to ensure they run unconditionally
  const safeAnswer = currentSample?.answer || "";
  const safeBand = currentSample?.band || 1;

  const bandConfig = useMemo(() => getBandConfig(safeBand), [safeBand]);
  
  const renderedAnswer = useMemo(() => {
    if (!currentSample) return null;
    if (typeof currentSample.answer !== 'string') {
      return <p className="text-red-400 italic">[Error: Invalid sample answer format]</p>;
    }
    return renderFormattedText(currentSample.answer, prompt.keywords, prompt.verb);
  }, [currentSample, prompt.keywords, prompt.verb]);

  const metrics = useAnswerMetrics(safeAnswer, prompt.keywords);

  // Safe to return early now that all hooks have been called
  if (!currentSample) return null;

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    }
  };

  const handleNext = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentIndex((prev) => (prev + 1) % group.answers.length);
  };

  const handlePrev = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentIndex((prev) => (prev - 1 + group.answers.length) % group.answers.length);
  };
  
  const isBandMismatch = group.band !== group.calculatedBand;

  return (
    <div 
      className={`
        group rounded-xl transition-all duration-300 ease-out transform
        ${isOpen ? bandConfig.bg : 'bg-[rgb(var(--color-bg-surface))]/80 light:bg-white'}
        border ${bandConfig.border}
        ${isOpen 
          ? `shadow-lg ${bandConfig.glow} scale-[1.01]` 
          : 'border-opacity-40 light:border-opacity-100 hover:border-opacity-60 light:hover:border-slate-300 light:shadow-sm hover:shadow-md hover-lift'
        }
      `}
    >
      <button 
        onClick={onToggle}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        className={`
          w-full p-4 flex items-center justify-between
          transition-all duration-200 ease-out
          focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50 rounded-xl
        `}
      >
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <div className={`
            w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0
            transition-all duration-200 ease-out
            ${isOpen 
              ? `bg-gradient-to-br ${bandConfig.gradient} shadow-md text-white` 
              : `${bandConfig.iconBg} border ${bandConfig.border} ${bandConfig.text}`
            }
          `}>
            <Award className="w-5 h-5" />
          </div>
          
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-2">
                <span className={`font-bold text-base leading-none ${bandConfig.text}`}>
                Band {currentSample.band}
                </span>
                {isBandMismatch && (
                    <div className="group/tooltip relative">
                         <BadgeAlert className="w-4 h-4 text-amber-400" />
                         <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 text-xs text-gray-200 rounded shadow-lg border border-gray-700 opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-normal z-10">
                            Based on the mark ({group.mark}), this aligns more closely with Band {group.calculatedBand}.
                         </div>
                    </div>
                )}
            </div>
            <span className="text-[rgb(var(--color-text-dim))] light:text-slate-500 text-xs font-medium font-mono">
              {group.mark}/{prompt.totalMarks} marks
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
             {/* Preview Badges for contained sources */}
             <div className="flex -space-x-1">
                {group.answers.map((ans, i) => {
                    if (i > 3) return null;
                    // Tiny dot indicator
                    let color = 'bg-purple-400';
                    if (ans.source === 'USER') color = 'bg-blue-400';
                    if (ans.source === 'HSC_EXEMPLAR') color = 'bg-amber-400';
                    return <div key={ans.id} className={`w-2 h-2 rounded-full border border-[rgb(var(--color-bg-surface))] light:border-white ${color}`} />
                })}
             </div>

             {group.answers.length > 1 && (
                <span className="text-[10px] font-bold bg-black/20 light:bg-slate-100 px-2 py-1 rounded-full text-[rgb(var(--color-text-secondary))] light:text-slate-600 border border-white/5 light:border-slate-300">
                    {group.answers.length} Variations
                </span>
             )}
             <ChevronDown className={`w-5 h-5 text-[rgb(var(--color-text-muted))] light:text-slate-400 transition-transform duration-200 ease-out flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} />
        </div>
      </button>
      
      {isOpen && (
        <div className="px-5 pb-5 pt-0 animate-fade-in-up-sm">
            
          {/* Controls and Metrics Header */}
          <div className="mb-4 pt-4 border-t border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
             <div className="flex flex-col gap-2">
                 <SourceBadge source={currentSample.source} />
                 <AnswerMetricsDisplay metrics={metrics} showLabel={true} />
             </div>
             
             <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
                {group.answers.length > 1 && (
                    <div className="flex items-center gap-1 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-white/50 rounded-lg p-0.5 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 mr-auto sm:mr-0">
                        <button 
                            onClick={handlePrev} 
                            className="p-1 hover:bg-white/10 light:hover:bg-slate-100 rounded text-[rgb(var(--color-text-secondary))] light:text-slate-600 transition-colors"
                            title="Previous Variation"
                        >
                            <ChevronLeft className="w-4 h-4" />
                        </button>
                        <span className="text-[10px] font-mono w-12 text-center text-[rgb(var(--color-text-muted))] light:text-slate-500">
                            {currentIndex + 1} / {group.answers.length}
                        </span>
                        <button 
                            onClick={handleNext} 
                            className="p-1 hover:bg-white/10 light:hover:bg-slate-100 rounded text-[rgb(var(--color-text-secondary))] light:text-slate-600 transition-colors"
                            title="Next Variation"
                        >
                            <ChevronRight className="w-4 h-4" />
                        </button>
                    </div>
                )}

                <div className="flex items-center gap-2 ml-auto">
                    <button
                        onClick={(e) => { e.stopPropagation(); onUseSample(currentSample.answer); }}
                        disabled={typeof currentSample.answer !== 'string'}
                        className="text-xs font-bold px-3 py-1.5 rounded-lg bg-emerald-500/10 light:bg-emerald-100 text-emerald-400 light:text-emerald-700 hover:bg-emerald-500/20 light:hover:bg-emerald-200 border border-emerald-500/30 light:border-emerald-300 transition-all flex items-center gap-1.5 hover-scale"
                        title="Copy to editor"
                    >
                        <Edit3 className="w-3.5 h-3.5" /> Use
                    </button>
                    {canModify && (
                        <>
                            <button
                                onClick={(e) => { e.stopPropagation(); onRevise(currentSample); }}
                                className="text-xs font-bold px-2 py-1.5 rounded-lg bg-blue-500/10 light:bg-blue-100 text-blue-400 light:text-blue-700 hover:bg-blue-500/20 light:hover:bg-blue-200 border border-blue-500/30 light:border-blue-300 transition-all flex items-center gap-1.5 hover-scale"
                                title="Revise with AI"
                            >
                                <Repeat className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onEdit(currentSample); }}
                                className="text-xs font-bold px-2 py-1.5 rounded-lg bg-yellow-500/10 light:bg-yellow-100 text-yellow-400 light:text-yellow-700 hover:bg-yellow-500/20 light:hover:bg-yellow-200 border border-yellow-500/30 light:border-yellow-300 transition-all flex items-center gap-1.5 hover-scale"
                                title="Edit Manually"
                            >
                                <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                                onClick={(e) => { e.stopPropagation(); onDelete(currentSample.id); }}
                                className="text-xs font-bold px-2 py-1.5 rounded-lg bg-red-500/10 light:bg-red-100 text-red-400 light:text-red-700 hover:bg-red-500/20 light:hover:bg-red-200 border border-red-500/30 light:border-red-300 transition-all flex items-center hover-scale"
                                title="Delete"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                            </button>
                        </>
                    )}
                </div>
             </div>
          </div>
          
          <div className="bg-[rgb(var(--color-bg-surface-inset))]/60 light:bg-white p-5 rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 font-serif relative overflow-hidden min-h-[100px] shadow-inner light:shadow-none">
             {/* Quote decorative icon */}
             <div className="absolute top-2 left-3 text-6xl text-[rgb(var(--color-text-muted))]/5 light:text-slate-300/20 font-serif leading-none select-none">“</div>
            <div className="prose prose-sm max-w-none text-[rgb(var(--color-text-secondary))] light:text-slate-800 leading-relaxed relative z-10">
              {renderedAnswer}
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

interface SampleAnswersAccordionProps {
  prompt: Prompt;
  onSampleAnswerGenerated: (answer: SampleAnswer) => void;
  onUseSampleAnswer: (text: string) => void;
  onDeleteSampleAnswer: (id: string) => void;
  onUpdateSampleAnswer: (answer: SampleAnswer) => void;
  userRole: UserRole;
}

const SampleAnswersAccordion: React.FC<SampleAnswersAccordionProps> = ({
  prompt,
  onSampleAnswerGenerated,
  onUseSampleAnswer,
  onDeleteSampleAnswer,
  onUpdateSampleAnswer,
  userRole,
}) => {
  const [openGroupMark, setOpenGroupMark] = useState<number | null>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<SampleAnswer | null>(null);
  const [editorTarget, setEditorTarget] = useState<SampleAnswer | null>(null);

  const isAdmin = userRole === 'admin';

  const groupedAnswers = useMemo(() => {
    const groups: Record<number, GroupedSampleAnswers> = {};
    const commandTermInfo = getCommandTermInfo(prompt.verb);
    
    (prompt.sampleAnswers || []).forEach(sa => {
        if (!groups[sa.mark]) {
            groups[sa.mark] = {
                mark: sa.mark,
                answers: [],
                band: sa.band,
                calculatedBand: getBandForMark(sa.mark, prompt.totalMarks, commandTermInfo.tier)
            };
        }
        groups[sa.mark].answers.push(sa);
    });

    return Object.values(groups).sort((a, b) => b.mark - a.mark);
  }, [prompt.sampleAnswers, prompt.totalMarks, prompt.verb]);

  return (
    <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                Sample Answers
            </h3>
            {isAdmin && (
                <button 
                    onClick={() => setIsGeneratorOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-200 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 text-xs font-bold text-[rgb(var(--color-text-secondary))] light:text-slate-700 transition-all hover-scale"
                >
                    <Sparkles className="w-3.5 h-3.5 text-yellow-400" />
                    Generate
                </button>
            )}
        </div>

        {/* List */}
        <div className="space-y-3">
            {groupedAnswers.length > 0 ? (
                groupedAnswers.map(group => (
                    <CarouselAccordionItem 
                        key={group.mark}
                        group={group}
                        prompt={prompt}
                        isOpen={openGroupMark === group.mark}
                        onToggle={() => setOpenGroupMark(prev => prev === group.mark ? null : group.mark)}
                        onUseSample={onUseSampleAnswer}
                        onRevise={(sa) => setRevisionTarget(sa)}
                        onEdit={(sa) => setEditorTarget(sa)}
                        onDelete={onDeleteSampleAnswer}
                        canModify={isAdmin}
                    />
                ))
            ) : (
                <div className="p-6 rounded-xl border border-dashed border-[rgb(var(--color-border-secondary))]/50 light:border-slate-300 bg-[rgb(var(--color-bg-surface-inset))]/20 light:bg-slate-50 text-center">
                    <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 italic">
                        No sample answers yet. 
                        {isAdmin ? " Generate one to get started." : " Check back later."}
                    </p>
                </div>
            )}
        </div>

        {/* Modals */}
        <SampleAnswerGeneratorModal
            isOpen={isGeneratorOpen}
            onClose={() => setIsGeneratorOpen(false)}
            prompt={prompt}
            onSampleAnswerGenerated={(answer) => onSampleAnswerGenerated(answer)}
        />
        
        {revisionTarget && (
            <SampleAnswerRevisionModal
                isOpen={!!revisionTarget}
                onClose={() => setRevisionTarget(null)}
                prompt={prompt}
                sampleToRevise={revisionTarget}
                existingMarks={groupedAnswers.map(g => g.mark)}
                onRevisionComplete={(revisedAnswer) => {
                    onSampleAnswerGenerated(revisedAnswer);
                    setRevisionTarget(null);
                }}
            />
        )}

        {editorTarget && (
            <SampleAnswerEditorModal
                isOpen={!!editorTarget}
                onClose={() => setEditorTarget(null)}
                prompt={prompt}
                sampleToEdit={editorTarget}
                onSave={(updatedAnswer) => {
                    onUpdateSampleAnswer(updatedAnswer);
                    setEditorTarget(null);
                }}
            />
        )}
    </div>
  );
};

export default SampleAnswersAccordion;
