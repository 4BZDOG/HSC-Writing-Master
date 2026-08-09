import React, { useId, useState, useMemo } from 'react';
import { Prompt, Topic, UserRole, CourseOutcome } from '../types';
import KeywordEditor from './KeywordEditor';
import MarkingCriteriaManager from './MarkingCriteriaAccordion';
import OutcomeDetailModal from './OutcomeDetailModal';
import { ChevronDown, GraduationCap, Sparkles, Award, ListChecks, Target } from 'lucide-react';
import { getBandConfig, getTierScaleConfig } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { PANEL_HEADER_CLOSED, PANEL_HEADER_OPEN, PANEL_SURFACE } from '../utils/panelStyles';
import { PanelReadChip, useOpenedOnce } from './PanelDisclosure';
import { isFeatureLocked } from '../services/entitlements';
import { PlusLockChip } from './UpgradeModal';
import { useSupportResource } from '../hooks/useSupportResource';
import { markSupportOpened, type SupportResourceId } from '../utils/supportEngagement';

interface AccordionSectionProps {
  title: string;
  /** Second line under the title, matching the exemplars panel's band line. */
  subtitle?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  band?: number;
  /** Question id — clears the "read" tick when the student moves on. */
  resetKey?: string;
  /** Which of the question's supports this panel is, for the feedback report. */
  supportId?: SupportResourceId;
}

export const AccordionSection: React.FC<AccordionSectionProps> = ({
  title,
  subtitle,
  icon,
  children,
  defaultOpen = false,
  band = 6,
  resetKey,
  supportId,
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const bandConfig = useMemo(() => getBandConfig(band), [band]);
  const panelId = useId();
  const opened = useOpenedOnce(isOpen, resetKey);
  // `resetKey` is the prompt id everywhere this panel is used for a question.
  useSupportResource(resetKey, supportId, isOpen);

  return (
    <div className={`${PANEL_SURFACE} mb-3 last:mb-0`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className={`w-full py-3.5 px-5 flex items-center justify-between transition-all group ${isOpen ? PANEL_HEADER_OPEN : PANEL_HEADER_CLOSED}`}
      >
        <div className="flex items-center gap-4">
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-500 ${isOpen ? `${bandConfig.solidBg} border-white/20 text-white shadow-lg` : 'bg-slate-100 dark:bg-black/20 border-slate-300 dark:border-white/10 text-slate-500'}`}
          >
            {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
          </div>
          <span className="text-left">
            <span
              className={`block text-[10px] font-black uppercase tracking-[0.2em] ${isOpen ? 'text-slate-900 dark:text-white' : 'text-slate-500'}`}
            >
              {title}
            </span>
            {subtitle && (
              <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 opacity-80">
                {subtitle}
              </span>
            )}
          </span>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <PanelReadChip show={opened && !isOpen} />
          <ChevronDown
            className={`w-4 h-4 text-slate-400 transition-transform duration-500 ${isOpen ? 'rotate-180 text-slate-900 dark:text-white' : ''}`}
          />
        </div>
      </button>

      {/* A grid-rows transition rather than a max-height one. The old
          `max-h-[2000px]` was a guess at how tall the content could get, and
          anything past it — a long marking guide, a stack of exemplars — was
          silently cut off with no way to scroll to it. `1fr` animates to
          whatever the content actually needs.

          `inert` while collapsed, because zero height is not zero REACH: every
          button inside a shut panel stayed in the tab order, so a keyboard user
          tabbed through controls that were not on screen and a screen reader
          read out a panel the UI had told them was closed. It costs nothing
          visually — unlike hiding the content, which would fight the animation. */}
      <div
        id={panelId}
        inert={!isOpen}
        className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
      >
        <div className="overflow-hidden">
          <div className="p-5 pt-0 border-t border-slate-300 dark:border-white/10">
            <div className="mt-5">{children}</div>
          </div>
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
  /** The syllabus dot point text this question sits under, used to flag which
   *  keywords come straight from the syllabus. */
  dotPointText?: string;
  /** Course → Topic → Sub-Topic → Dot Point labels, shown in the outcome modal. */
  breadcrumb?: string[];
}

const ReferenceMaterials: React.FC<ReferenceMaterialsProps> = (props) => {
  const { prompt, topic, userRole, courseOutcomes = [], breadcrumb } = props;

  // Second, fuller entry point to the outcome briefing. The chips in the prompt
  // footer are a quick reminder of WHICH outcomes apply; this panel spells out
  // what each one asks for and offers the in-context explanation by name, so a
  // student can read it before attempting an answer rather than discovering it
  // by chance.
  const [selectedOutcome, setSelectedOutcome] = useState<CourseOutcome | null>(null);
  const briefingLocked = isFeatureLocked('outcomeBriefing');
  const verbInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
  const tierConfig = useMemo(() => getTierScaleConfig(verbInfo.tier), [verbInfo.tier]);
  const linkedOutcomes = useMemo(
    () => courseOutcomes.filter((o) => prompt.linkedOutcomes?.includes(o.code)),
    [courseOutcomes, prompt.linkedOutcomes]
  );
  const maxPossibleBand = useMemo(
    () => getBandForMark(prompt.totalMarks, prompt.totalMarks, verbInfo.tier),
    [prompt.totalMarks, verbInfo.tier]
  );

  return (
    <div className="flex flex-col gap-1 animate-fade-in">
      {linkedOutcomes.length > 0 && (
        <AccordionSection
          title={`What's Assessed · ${linkedOutcomes.length} Outcome${linkedOutcomes.length === 1 ? '' : 's'}`}
          icon={<Target />}
          band={verbInfo.tier}
          resetKey={prompt.id}
          supportId="outcomes"
        >
          <div className="space-y-2.5">
            {/* The briefing is easy to miss: nothing about a row of outcome
                statements says the app will explain them for THIS question. It
                is named here, and priced here — a student should learn what it
                is and that it is a Plus feature in the same breath, not by
                tapping and hitting a wall. */}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Read these before you start writing — they are the standards this question is marked
              against. Tap any outcome for a briefing on what it wants from this question.
            </p>
            {briefingLocked && (
              <p className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                <PlusLockChip feature="outcomeBriefing" />
                Briefings are part of Band 6 Plus — the outcomes themselves are always free to read.
              </p>
            )}
            {linkedOutcomes.map((outcome) => (
              <button
                key={outcome.code}
                onClick={() => {
                  setSelectedOutcome(outcome);
                  markSupportOpened(prompt.id, 'outcomeBriefing');
                }}
                className={`w-full text-left rounded-2xl border ${tierConfig.border} ${tierConfig.bg} p-4 transition-all hover:shadow-md hover:brightness-110 active:scale-[0.99] group/outcome-row`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {/* The same target that heads the panel and marks every
                      outcome chip on the question card, so an outcome is
                      recognisable as one wherever it appears. */}
                  <span
                    className={`w-5 h-5 shrink-0 rounded-md flex items-center justify-center border ${tierConfig.border} ${tierConfig.bg}`}
                    aria-hidden="true"
                  >
                    <Target className={`w-3 h-3 ${tierConfig.text}`} />
                  </span>
                  <span
                    className={`text-[10px] font-black uppercase tracking-widest ${tierConfig.text}`}
                  >
                    {outcome.code}
                  </span>
                  <span className="ml-auto flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400 opacity-70 group-hover/outcome-row:opacity-100 transition-opacity">
                    <Sparkles className="w-3 h-3" />
                    Explain for this question
                    {briefingLocked && <PlusLockChip feature="outcomeBriefing" />}
                  </span>
                </div>
                <p className="text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed font-serif">
                  {outcome.description}
                </p>
              </button>
            ))}
          </div>
        </AccordionSection>
      )}

      <AccordionSection
        title="Syllabus Terms"
        icon={<Sparkles />}
        band={4}
        resetKey={prompt.id}
        supportId="keywords"
      >
        <KeywordEditor
          {...props}
          syllabusText={props.dotPointText}
          onRegenerate={props.onRegenerateKeywords}
          isRegenerating={props.isRegeneratingKeywords}
          onSuggest={props.onSuggestKeywords}
          isSuggesting={props.isSuggestingKeywords}
        />
      </AccordionSection>

      {topic?.performanceBandDescriptors && topic.performanceBandDescriptors.length > 0 && (
        <AccordionSection
          title="Grade Standards"
          icon={<GraduationCap />}
          band={6}
          resetKey={prompt.id}
          supportId="gradeStandards"
        >
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

      <AccordionSection
        title="Marking Guide"
        subtitle={`Top level: Band ${maxPossibleBand}`}
        icon={<ListChecks />}
        band={5}
        resetKey={prompt.id}
        supportId="markingGuide"
      >
        <MarkingCriteriaManager
          prompt={prompt}
          markingCriteria={prompt.markingCriteria || ''}
          onSave={props.onMarkingCriteriaChange}
          band={5}
          userRole={userRole}
          courseOutcomes={courseOutcomes}
          embedded
        />
      </AccordionSection>

      {/* The exemplars used to sit here, under the Marking Guide. They are now
          docked beneath the student's own writing, where the comparison that
          makes them useful actually happens — see Workspace. */}

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
    </div>
  );
};

export default ReferenceMaterials;
