import React, { useId, useState, useMemo } from 'react';
import { Prompt, Topic, UserRole, CourseOutcome } from '../types';
import KeywordEditor from './KeywordEditor';
import MarkingCriteriaManager from './MarkingCriteriaAccordion';
import OutcomeDetailModal from './OutcomeDetailModal';
import { ChevronDown, GraduationCap, Sparkles, Award, ListChecks, Target, Eye } from 'lucide-react';
import { getBandConfig, getTierScaleConfig } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { canCurateContent } from '../utils/permissions';
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
            className={`w-8 h-8 rounded-xl flex items-center justify-center border transition-all duration-500 ${isOpen ? `${bandConfig.solidBg} border-white/20 ${bandConfig.solidText} shadow-lg` : 'bg-slate-100 dark:bg-black/20 border-slate-300 dark:border-white/10 text-slate-500'}`}
          >
            {React.cloneElement(icon as React.ReactElement<any>, { className: 'w-4 h-4' })}
          </div>
          <span className="text-left">
            <span
              // The panel's NAME, so it takes the section treatment; the
              // subtitle under it stays `.t-label`, which is what makes the
              // pair read as a heading and its caption rather than two labels.
              className={`t-section block ${isOpen ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400'}`}
            >
              {title}
            </span>
            {subtitle && (
              <span className="t-label block text-slate-600 dark:text-slate-400">{subtitle}</span>
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
  const canCurate = canCurateContent(userRole);
  const commonMistakes = useMemo(
    () => (prompt.commonStudentErrors || []).map((s) => s.trim()).filter(Boolean),
    [prompt.commonStudentErrors]
  );
  const markerNotes = useMemo(
    () => (prompt.markerNotes || []).map((s) => s.trim()).filter(Boolean),
    [prompt.markerNotes]
  );
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
              <p className="flex items-center gap-1.5 text-[10px] text-slate-500 dark:text-slate-400">
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
                className={`w-full text-left rounded-2xl border ${tierConfig.border} ${tierConfig.bg} p-4 transition-all hover:shadow-lg hover:brightness-110 active:scale-[0.98] group/outcome-row`}
              >
                <div className="flex items-center gap-2 mb-1.5">
                  {/* The same target that heads the panel and marks every
                      outcome chip on the question card, so an outcome is
                      recognisable as one wherever it appears. */}
                  <span
                    className={`w-5 h-5 shrink-0 rounded-lg flex items-center justify-center border ${tierConfig.border} ${tierConfig.bg}`}
                    aria-hidden="true"
                  >
                    <Target className={`w-3 h-3 ${tierConfig.text}`} />
                  </span>
                  <span className={`t-label ${tierConfig.text}`}>{outcome.code}</span>
                  <span className="t-label ml-auto flex items-center gap-1.5 text-slate-500 dark:text-slate-400 opacity-70 group-hover/outcome-row:opacity-100 transition-opacity">
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

      {/* What goes wrong here.

          Two audiences in one panel, which is why the rule is in the middle of
          it. `commonStudentErrors` is written about students and is useful TO
          them ("Confusing the roles of the template and coding strands").
          `markerNotes` is written to a marker — "Credit explicit mention of…",
          "Higher marks awarded for…" — so it sits behind `canCurate`, in the
          same device the Syllabus Terms panel uses for its own boundary: a rule
          that names what is below it rather than a second heading above it.

          Deliberately NOT numbered. These are a set of pitfalls a marker sees
          again and again, not a sequence anyone works through in order, and a
          01/02/03 down the side would claim an order the content does not have.

          Band 2 is the caution end of the app's own ramp rather than a
          hand-picked amber, and it makes no claim about the question — the same
          use of `band` as chrome the Syllabus Terms panel already makes. */}
      {(commonMistakes.length > 0 || (canCurate && markerNotes.length > 0)) && (
        <AccordionSection
          title="Common mistakes"
          icon={<Eye />}
          band={2}
          resetKey={prompt.id}
          supportId="commonMistakes"
        >
          <div className="space-y-3">
            {commonMistakes.length > 0 && (
              <>
                <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 leading-snug">
                  What students most often get wrong on this question.
                </p>
                <ul className="space-y-2">
                  {commonMistakes.map((mistake) => (
                    <li key={mistake} className="flex items-start gap-2.5">
                      <span
                        className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500"
                        aria-hidden="true"
                      />
                      <span className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                        {mistake}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}

            {canCurate && markerNotes.length > 0 && (
              <>
                {commonMistakes.length > 0 && (
                  <div className="flex items-center gap-3" aria-hidden="true">
                    <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                    <span className="t-label shrink-0 text-slate-500 dark:text-slate-400">
                      What the marker looks for
                    </span>
                    <span className="h-px flex-1 bg-slate-200 dark:bg-white/10" />
                  </div>
                )}
                <ul
                  className="space-y-2"
                  role="group"
                  aria-label="What the marker looks for — visible to teachers"
                >
                  {markerNotes.map((note) => (
                    <li key={note} className="flex items-start gap-2.5">
                      <span
                        className="mt-[0.45rem] h-1 w-1 shrink-0 rounded-full bg-indigo-400/70"
                        aria-hidden="true"
                      />
                      <span className="text-[11px] leading-relaxed text-slate-700 dark:text-slate-300">
                        {note}
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </AccordionSection>
      )}

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
                    className={`relative rounded-2xl border ${bConfig.bg} ${bConfig.border} p-4 shadow-sm group/descriptor transition-all hover:shadow-lg`}
                  >
                    <div className="flex gap-4 items-start">
                      <div
                        className={`p-2 rounded-xl ${bConfig.iconBg} border ${bConfig.border} shadow-inner`}
                      >
                        <Award className={`w-4 h-4 ${bConfig.text} shrink-0`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`t-label ${bConfig.text}`}>Band {descriptor.band}</span>
                          {/* The band's word ("Outstanding", "Sound") sits on a
                              tinted card in both themes, so it cannot afford a
                              muted tone AND an opacity on top: at 8px that
                              landed under every readability floor the rest of
                              the app respects. */}
                          <span className="t-label text-slate-600 dark:text-slate-300">
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
