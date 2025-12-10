
import React, { useState, useMemo, KeyboardEvent } from 'react';
import { Prompt, Topic, UserRole } from '../types';
import KeywordEditor from './KeywordEditor';
import MarkingCriteriaManager from './MarkingCriteriaAccordion';
import { ChevronDown, GraduationCap, Library, Sparkles, ClipboardList } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';

interface AccordionSectionProps {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  band?: number;
}

export const AccordionSection: React.FC<AccordionSectionProps> = ({ 
  title, 
  icon, 
  children, 
  defaultOpen = false,
  band = 6
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bandConfig = useMemo(() => getBandConfig(band), [band]);

  const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setIsOpen(!isOpen);
    }
  };

  return (
    <div 
      className={`
        rounded-xl overflow-hidden transition-all duration-300 ease-out
        border hover-lift
        ${isOpen 
            ? `bg-[rgb(var(--color-bg-surface))] light:bg-white border-[rgb(var(--color-border-secondary))]/50 light:border-slate-300 shadow-xl light:shadow-lg` 
            : `bg-[rgb(var(--color-bg-surface))]/60 light:bg-white border-white/5 light:border-slate-200 hover:bg-[rgb(var(--color-bg-surface))]/80 light:hover:bg-white/80 hover:border-white/10 light:hover:border-slate-300 shadow-sm hover:shadow-md`
        }
      `}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        aria-expanded={isOpen}
        className={`
          w-full p-4 flex items-center justify-between
          transition-all duration-300 ease-out
          focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]/50 focus:ring-inset
          group relative overflow-hidden
        `}
      >
        {/* Header Background for Open State */}
        {isOpen && (
            <div className={`absolute inset-0 opacity-5 bg-gradient-to-r ${bandConfig.gradient} pointer-events-none`} />
        )}

        <div className="flex items-center gap-3 relative z-10 flex-1 min-w-0">
          <div className={`
            w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0
            transition-all duration-300
            ${isOpen 
              ? `bg-gradient-to-br ${bandConfig.gradient} text-white shadow-md` 
              : `bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-100 text-[rgb(var(--color-text-muted))] light:text-slate-500 border border-[rgb(var(--color-border-secondary))] light:border-slate-300 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900`
            }
          `}>
            {icon}
          </div>
          <span className={`
            text-sm font-bold tracking-wide
            ${isOpen ? 'text-[rgb(var(--color-text-primary))] light:text-slate-900' : 'text-[rgb(var(--color-text-secondary))] light:text-slate-700 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900'}
            transition-colors duration-200
          `}>
            {title}
          </span>
        </div>

        <div className={`
            relative z-10
            w-6 h-6 rounded-full flex items-center justify-center
            transition-all duration-300
            ${isOpen ? 'bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white/50 rotate-180' : 'bg-transparent group-hover:bg-[rgb(var(--color-bg-surface-inset))] light:group-hover:bg-slate-100'}
        `}>
            <ChevronDown className={`
              w-4 h-4 
              ${isOpen ? bandConfig.text : 'text-[rgb(var(--color-text-muted))] light:text-slate-400'}
            `} />
        </div>
      </button>

      <div className={`
        transition-all duration-300 ease-in-out overflow-hidden
        ${isOpen ? 'max-h-[3000px] opacity-100' : 'max-h-0 opacity-0'}
      `}>
        <div className="p-4 sm:p-5 border-t border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 light:bg-slate-50/50">
          {children}
        </div>
      </div>
    </div>
  );
};

AccordionSection.displayName = 'AccordionSection';

interface ReferenceMaterialsProps {
  prompt: Prompt;
  topic: Topic | undefined;
  onKeywordsChange: (keywords: string[]) => void;
  onMarkingCriteriaChange: (criteria: string) => void;
  isEnriching: boolean;
  onRegenerateKeywords: () => void;
  isRegeneratingKeywords: boolean;
  regenerateKeywordsError: React.ReactNode | null;
  onSuggestKeywords: () => void;
  isSuggestingKeywords: boolean;
  suggestKeywordsError: React.ReactNode | null;
  userRole: UserRole;
  userAnswer?: string;
  onAddWord?: (word: string) => void;
}

const ReferenceMaterials: React.FC<ReferenceMaterialsProps> = ({
  prompt,
  topic,
  onKeywordsChange,
  onMarkingCriteriaChange,
  isEnriching,
  onRegenerateKeywords,
  isRegeneratingKeywords,
  regenerateKeywordsError,
  onSuggestKeywords,
  isSuggestingKeywords,
  suggestKeywordsError,
  userRole,
  userAnswer,
  onAddWord
}) => {
  const highestBand = useMemo(() => {
    if (topic?.performanceBandDescriptors?.length) {
      return Math.max(...topic.performanceBandDescriptors.map(d => d.band));
    }
    return 6;
  }, [topic?.performanceBandDescriptors]);

  const bandConfig = useMemo(() => getBandConfig(highestBand), [highestBand]);
  const isAdmin = userRole === 'admin';

  const hasReferenceContent = topic?.performanceBandDescriptors?.length || prompt.keywords?.length || prompt.prerequisiteKnowledge?.length || prompt.markerNotes?.length || prompt.commonStudentErrors?.length || prompt.markingCriteria;
  
  if (!hasReferenceContent && !isEnriching) {
    return null;
  }

  return (
    <div className="relative space-y-6">
      {isEnriching && (
        <div className="absolute inset-0 bg-[rgb(var(--color-bg-surface))]/90 light:bg-white/90 backdrop-blur-md flex items-center justify-center rounded-2xl z-20 animate-fade-in">
          <div className="flex flex-col items-center gap-4 text-center p-6">
            <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${bandConfig.gradient} flex items-center justify-center shadow-lg shadow-purple-500/20`}>
                <Sparkles className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div className="text-[rgb(var(--color-text-secondary))] light:text-slate-600">
              <p className="font-bold text-lg text-[rgb(var(--color-text-primary))] light:text-slate-900 mb-1">Enriching Context</p>
              <p className="text-xs uppercase tracking-wider opacity-70">Using Gemini AI</p>
            </div>
          </div>
        </div>
      )}

      {/* Hero Header */}
      <div className={`
        relative overflow-hidden rounded-2xl p-6
        bg-gradient-to-br from-[rgb(var(--color-bg-surface-elevated))] to-[rgb(var(--color-bg-surface))]
        border border-[rgb(var(--color-border-secondary))]/50 light:border-slate-300 light:from-white light:to-slate-50
        shadow-lg light:shadow-xl
        group
        hover-lift
      `}>
         <div className={`absolute top-0 right-0 w-64 h-64 bg-gradient-to-br ${bandConfig.gradient} opacity-5 blur-[80px] rounded-full pointer-events-none group-hover:opacity-10 transition-opacity duration-500`} />
         
        <div className="relative z-10 flex items-center gap-5">
          <div className={`
            w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0
            bg-gradient-to-br ${bandConfig.gradient} shadow-lg shadow-purple-500/20
            text-white
          `}>
            <Library className="w-7 h-7" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-black text-[rgb(var(--color-text-primary))] light:text-slate-900 tracking-tight mb-1">
              Reference Materials
            </h2>
            <p className="text-[rgb(var(--color-text-muted))] light:text-slate-600 text-sm leading-relaxed max-w-md">
              Syllabus standards, keywords, and marking guidelines for this question.
            </p>
          </div>
        </div>
      </div>

      {/* Band Descriptors */}
      {topic?.performanceBandDescriptors && topic.performanceBandDescriptors.length > 0 && (
        <AccordionSection
          title="Performance Band Descriptors"
          icon={<GraduationCap className="w-4 h-4" />}
          defaultOpen={false}
          band={highestBand}
        >
          <div className="space-y-3">
            {topic.performanceBandDescriptors.map((desc) => {
              const descBandConfig = getBandConfig(desc.band);
              return (
                <div 
                  key={desc.band} 
                  className={`
                    relative overflow-hidden rounded-xl border-l-4 transition-all duration-300
                    ${descBandConfig.border.replace('border', 'border-l')}
                    bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-white
                    border-y border-r border-[rgb(var(--color-border-secondary))]/30 light:border-slate-300
                    hover:bg-[rgb(var(--color-bg-surface-inset))]/80 hover:shadow-md light:hover:shadow-lg
                    group hover-slide-right
                  `}
                >
                   {/* Large Watermark Number */}
                  <div className={`
                    absolute -right-4 -bottom-6 text-[5rem] font-black opacity-5 
                    ${descBandConfig.text} select-none pointer-events-none
                    group-hover:scale-110 transition-transform duration-500
                  `}>
                    {desc.band}
                  </div>

                  <div className="p-4 relative z-10">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                             <span className={`text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded ${descBandConfig.bg} ${descBandConfig.text} border ${descBandConfig.border.replace('border-l-4', 'border')}`}>
                                Band {desc.band}
                             </span>
                             <span className={`text-sm font-bold ${descBandConfig.text}`}>
                                {desc.label}
                             </span>
                        </div>
                    </div>
                    <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-700 leading-relaxed font-serif opacity-90 group-hover:opacity-100 transition-opacity">
                        {desc.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </AccordionSection>
      )}

      {/* Combined Assessment Requirements (Keywords + Criteria) */}
      {(prompt.keywords?.length > 0 || prompt.markingCriteria || isEnriching || isAdmin) && (
          <AccordionSection
            title="Assessment Requirements"
            icon={<ClipboardList className="w-4 h-4" />}
            defaultOpen={true}
            band={highestBand}
          >
              <div className="flex flex-col gap-6">
                  {/* Keywords Card */}
                  <div className="animate-fade-in-up-sm" style={{ animationDelay: '0ms' }}>
                      <KeywordEditor 
                        prompt={prompt} 
                        onKeywordsChange={onKeywordsChange}
                        isEnriching={isEnriching}
                        onRegenerate={onRegenerateKeywords}
                        isRegenerating={isRegeneratingKeywords}
                        regenerateError={regenerateKeywordsError}
                        onSuggest={onSuggestKeywords}
                        isSuggesting={isSuggestingKeywords}
                        suggestError={suggestKeywordsError}
                        userRole={userRole}
                        userAnswer={userAnswer}
                        onAddWord={onAddWord}
                      />
                  </div>

                  {/* Criteria Card */}
                  <div className="animate-fade-in-up-sm" style={{ animationDelay: '100ms' }}>
                      <MarkingCriteriaManager
                        prompt={prompt}
                        markingCriteria={prompt.markingCriteria}
                        onSave={onMarkingCriteriaChange}
                        band={highestBand}
                        userRole={userRole}
                      />
                  </div>
              </div>
          </AccordionSection>
      )}
    </div>
  );
};

ReferenceMaterials.displayName = 'ReferenceMaterials';

export default ReferenceMaterials;
