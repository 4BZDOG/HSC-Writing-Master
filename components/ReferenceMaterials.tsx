import React, { useState, useMemo } from 'react';
import { Prompt, Topic, UserRole, CourseOutcome } from '../types';
import KeywordEditor from './KeywordEditor';
import MarkingCriteriaManager from './MarkingCriteriaAccordion';
import { ChevronDown, GraduationCap, Sparkles, Award, BookOpen, ListChecks } from 'lucide-react';
import { getBandConfig } from '../utils/renderUtils';
import CognitiveSpectrum from './CognitiveSpectrum';
import { getCommandTermInfo } from '../data/commandTerms';

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
  band = 6,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bandConfig = useMemo(() => getBandConfig(band), [band]);

  return (
    <div
      className={`border border-slate-300 dark:border-white/20 rounded-[20px] overflow-hidden mb-3 last:mb-0 bg-white/60 dark:bg-[rgb(var(--color-bg-surface))]/30 light:bg-white shadow-sm transition-all duration-300`}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full py-3.5 px-5 flex items-center justify-between transition-all group ${isOpen ? 'bg-slate-50/50 dark:bg-white/[0.03]' : 'hover:bg-slate-50 dark:hover:bg-white/[0.02]'}`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-500 ${isOpen ? `${bandConfig.solidBg} border-white/20 text-white shadow-lg` : 'bg-slate-100 dark:bg-black/20 border-slate-300 dark:border-white/10 text-slate-500'}`}
          >
            {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
          </div>
          <span
            className={`text-[10px] font-black uppercase tracking-[0.2em] ${isOpen ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}
          >
            {title}
          </span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-500 ${isOpen ? 'rotate-180 text-slate-900 dark:text-white' : ''}`}
        />
      </button>

      <div
        className={`overflow-hidden transition-all duration-500 ${isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'}`}
      >
        <div className="p-5 pt-0 border-t border-slate-300 dark:border-white/10">
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
};

interface ReferenceMaterialsProps {
  prompt: Prompt;
  topic: Topic | undefined;
  onKeywordsChange: (keywords: string[]) => void;
  onMarkingCriteriaChange: (criteria: string) => void;
  isEnriching: boolean;
  onRegenerateKeywords: () => void;
  isRegeneratingKeywords: boolean;
  regenerateError: React.ReactNode | null;
  onSuggestKeywords: () => void;
  isSuggestingKeywords: boolean;
  suggestError: React.ReactNode | null;
  userRole: UserRole;
  userAnswer?: string;
  onAddWord?: (word: string) => void;
  courseOutcomes?: CourseOutcome[];
}

const ReferenceMaterials: React.FC<ReferenceMaterialsProps> = (props) => {
  const { prompt, topic, userRole, courseOutcomes = [] } = props;
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  return (
    <div className="flex flex-col gap-1 animate-fade-in">
      <div className="px-5 py-3.5 border border-slate-300 dark:border-white/20 rounded-[20px] bg-slate-50 dark:bg-black/30 flex items-center justify-between mb-4 transition-colors shadow-sm">
        <div className="flex items-center gap-3">
          <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.25em] text-slate-800 dark:text-white">
            Syllabus Reference
          </h3>
        </div>
        <CognitiveSpectrum
          tier={commandTermInfo.tier}
          showLabel={false}
          className="!bg-transparent !border-0 !p-0"
        />
      </div>

      <AccordionSection title="Syllabus Terms" icon={<Sparkles />} band={4} defaultOpen={true}>
        <KeywordEditor
          {...props}
          onRegenerate={props.onRegenerateKeywords}
          isRegenerating={props.isRegeneratingKeywords}
          onSuggest={props.onSuggestKeywords}
          isSuggesting={props.isSuggestingKeywords}
        />
      </AccordionSection>

      <AccordionSection title="Marking Guide" icon={<ListChecks />} band={5}>
        <MarkingCriteriaManager
          prompt={prompt}
          markingCriteria={prompt.markingCriteria || ''}
          onSave={props.onMarkingCriteriaChange}
          band={5}
          userRole={userRole}
          courseOutcomes={courseOutcomes}
        />
      </AccordionSection>

      {topic?.performanceBandDescriptors && topic.performanceBandDescriptors.length > 0 && (
        <AccordionSection title="Grade Standards" icon={<GraduationCap />} band={6}>
          <div className="space-y-4">
            {[...topic.performanceBandDescriptors]
              .sort((a, b) => b.band - a.band)
              .map((descriptor) => {
                const bConfig = getBandConfig(descriptor.band);
                return (
                  <div
                    key={descriptor.band}
                    className={`relative rounded-2xl border ${bConfig.bg} ${bConfig.border} p-4 shadow-sm group/descriptor transition-all hover:shadow-md`}
                  >
                    <div className="flex gap-4 items-start">
                      <div
                        className={`p-2 rounded-xl ${bConfig.iconBg} border ${bConfig.border} shadow-inner`}
                      >
                        <Award className={`w-4 h-4 ${bConfig.text} shrink-0`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span
                            className={`text-[10px] font-black ${bConfig.text} uppercase tracking-widest`}
                          >
                            Band {descriptor.band}
                          </span>
                          <span className="text-[8px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-[0.2em] opacity-80">
                            • {descriptor.shortLabel}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-serif">
                          {descriptor.description}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </AccordionSection>
      )}
    </div>
  );
};

export default ReferenceMaterials;
