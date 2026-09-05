import React, { useId, useState, useMemo, useEffect } from 'react';
import { Prompt, SampleAnswer, UserRole } from '../types';
import { canCurateContent, canUseAiGeneration } from '../utils/permissions';
import {
  renderFormattedText,
  getBandConfig,
  getTierScaleConfig,
  cleanMarkdown,
} from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import { PANEL_SURFACE } from '../utils/panelStyles';
import { PanelReadChip, useOpenedOnce } from './PanelDisclosure';
import { useSupportResource } from '../hooks/useSupportResource';
import SampleAnswerGeneratorModal from './SampleAnswerGeneratorModal';
import SampleAnswerRevisionModal from './SampleAnswerRevisionModal';
import SampleAnswerEditorModal from './SampleAnswerEditorModal';
import RecalibrateSamplesModal from './RecalibrateSamplesModal';
import ConfirmationModal from './ConfirmationModal';
import FlagContentModal from './FlagContentModal';
import {
  ChevronDown,
  FileText,
  Sparkles,
  Award,
  Edit3,
  Repeat,
  Trash2,
  Pencil,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  BookOpen,
  Layers,
  Zap,
  Copy,
  Check,
  Bookmark,
  ZoomIn,
  ZoomOut,
  Lightbulb,
  RefreshCw,
  UploadCloud,
  Flag,
} from 'lucide-react';
import { useAnswerMetrics } from '../hooks/useAnswerMetrics';
import AnswerMetricsDisplay from './AnswerMetricsDisplay';
import { isFeatureLocked, isSampleAnswerLocked, requestUpgrade } from '../services/entitlements';
import { PlusLockChip, ContentLockOverlay } from './UpgradeModal';

// --- Shared Internal Components ---

const MeshOverlay = ({ opacity = 'opacity-[0.05]' }: { opacity?: string }) => (
  <div
    className={`absolute inset-0 ${opacity} light:opacity-[0.08] pointer-events-none mix-blend-overlay z-0 transition-opacity duration-500`}
    style={{
      backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v12M0 1h12' stroke='%23ffffff' stroke-width='0.5' fill='none'/%3E%3C/svg%3E")`,
    }}
  />
);

interface GroupedSampleAnswers {
  mark: number;
  answers: SampleAnswer[];
  /** Band for this mark level, derived via the Verb Gate (getBandForMark). */
  calculatedBand: number;
}

/** Exemplar chips shown at a mark level before the rest fold behind "+N more". */
const VISIBLE_VARIANTS = 4;

const wordCountOf = (text: string): number => text.trim().split(/\s+/).filter(Boolean).length;

/**
 * Provenance, in one word — the single thing that most distinguishes two
 * exemplars sitting at the same mark. Shared by the badge and the variant
 * picker so a sample cannot be called "Official" in one and "AI Model" in the
 * other.
 */
const sourceLabel = (sample: Pick<SampleAnswer, 'source' | 'derivedFromStudent'>): string =>
  sample.source === 'USER'
    ? 'Student'
    : sample.source === 'HSC_EXEMPLAR'
      ? 'Official'
      : sample.source === 'AI' && sample.derivedFromStudent
        ? 'Student + AI'
        : 'AI Model';

/**
 * Reading order within one mark level: verified HSC exemplars first, then real
 * student work, then AI rewrites of student work, then clean-room AI. It is a
 * confidence ordering — the exemplar a student should read FIRST is the one
 * closest to a real marked HSC response — and it makes "1 of 5" mean something
 * predictable rather than reflecting the order they happened to be generated.
 */
const SOURCE_RANK: Record<string, number> = { HSC_EXEMPLAR: 0, USER: 1, AI: 2 };
const byTrustworthiness = (a: SampleAnswer, b: SampleAnswer): number => {
  const rank = (s: SampleAnswer) =>
    (SOURCE_RANK[s.source ?? 'AI'] ?? 3) + (s.source === 'AI' && s.derivedFromStudent ? -0.5 : 0);
  return rank(a) - rank(b) || (a.id > b.id ? 1 : a.id < b.id ? -1 : 0);
};

/**
 * Where an exemplar came from — and, for an AI one, whether it was written from
 * scratch or lifted from a student's own response. A "Student + AI" sample
 * carries the student's structure and voice, so it is read (and trusted)
 * differently from a clean-room AI exemplar, and gets its own colour and icon
 * pair rather than being filed under the same grey "AI Model" chip.
 */
const SourceBadge: React.FC<{ source?: string; derivedFromStudent?: boolean }> = ({
  source,
  derivedFromStudent,
}) => {
  const isUser = source === 'USER';
  const isHsc = source === 'HSC_EXEMPLAR';
  const isUpgrade = source === 'AI' && !!derivedFromStudent;

  const config = isUser
    ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
    : isHsc
      ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
      : isUpgrade
        ? 'bg-violet-500/10 text-violet-500 dark:text-violet-400 border-violet-500/25'
        : 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10';

  const Icon = isUser ? UserIcon : isHsc ? BookOpen : Sparkles;
  const label = isUser ? 'Student' : isHsc ? 'Official' : isUpgrade ? 'Student + AI' : 'AI Model';
  const title = isUpgrade
    ? "A student's own response, rewritten by the AI to reach the next mark"
    : isUser
      ? 'A response written by a student and marked by the AI'
      : isHsc
        ? 'A verified HSC exemplar'
        : 'Written by the AI from the question and rubric';

  return (
    <span
      title={title}
      className={`t-label inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border ${config}`}
    >
      {isUpgrade ? (
        <span className="inline-flex items-center gap-0.5">
          <UserIcon className="w-2.5 h-2.5" />
          <Sparkles className="w-2.5 h-2.5" />
        </span>
      ) : (
        <Icon className="w-2.5 h-2.5" />
      )}
      {label}
    </span>
  );
};

const CarouselAccordionItem: React.FC<{
  group: GroupedSampleAnswers;
  prompt: Prompt;
  isOpen: boolean;
  onToggle: () => void;
  /** Absent for a student — see the note on the button itself. */
  onUseSample?: (answer: string) => void;
  onRevise: (sample: SampleAnswer) => void;
  onEdit: (sample: SampleAnswer) => void;
  onDelete: (id: string) => void;
  onContribute?: (sample: SampleAnswer) => void;
  onFlag: (sample: SampleAnswer) => void;
  canModify: boolean;
  fontSize: number;
}> = React.memo(
  ({
    group,
    prompt,
    isOpen,
    onToggle,
    onUseSample,
    onRevise,
    onEdit,
    onDelete,
    onContribute,
    onFlag,
    canModify,
    fontSize,
  }) => {
    const [isContributing, setIsContributing] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isCopied, setIsCopied] = useState(false);
    const [feedbackExpanded, setFeedbackExpanded] = useState(true);
    // A generated batch can leave a dozen exemplars at one mark. The picker
    // shows the first few — which, after the trustworthiness sort, are the ones
    // worth reading first — and keeps the rest one click away rather than
    // spending four rows of chips on near-identical AI variations.
    const [showAllVariants, setShowAllVariants] = useState(false);
    // Stepping past the fold with the header arrows opens the strip rather
    // than leaving the reader on an exemplar no chip is highlighting.
    const visibleVariants =
      showAllVariants || currentIndex >= VISIBLE_VARIANTS
        ? group.answers
        : group.answers.slice(0, VISIBLE_VARIANTS);

    useEffect(() => {
      if (currentIndex >= group.answers.length && group.answers.length > 0) {
        setCurrentIndex(group.answers.length - 1);
      }
    }, [group.answers.length, currentIndex]);

    const currentSample = group.answers[currentIndex];
    const safeAnswer = currentSample?.answer || '';
    // Band number AND colour both come from the Verb Gate (getBandForMark)
    // — so a Band 5 is always blue, Band 4 green, Band 6 purple, and this
    // placard mirrors the Marking Guide exactly.
    const displayBand = group.calculatedBand;
    const bandConfig = useMemo(() => getBandConfig(displayBand), [displayBand]);
    const metrics = useAnswerMetrics(safeAnswer, prompt.keywords);

    if (!currentSample) return null;

    const handleNext = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentIndex((prev) => (prev + 1) % group.answers.length);
    };

    const handlePrev = (e: React.MouseEvent) => {
      e.stopPropagation();
      setCurrentIndex((prev) => (prev - 1 + group.answers.length) % group.answers.length);
    };

    const handleUseSample = () => {
      if (!onUseSample) return;
      onUseSample(cleanMarkdown(currentSample.answer));
    };

    const handleCopy = async () => {
      await navigator.clipboard.writeText(cleanMarkdown(currentSample.answer));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    };

    const handleContribute = () => {
      if (!onContribute || isContributing) return;
      setIsContributing(true);
      // The handler runs its own AI screen + toast; resolve either shape.
      Promise.resolve(onContribute(currentSample)).finally(() => setIsContributing(false));
    };

    return (
      <div
        className={`group border-b border-slate-100 dark:border-white/10 last:border-0 transition-all duration-500 ${isOpen ? bandConfig.bg : ''}`}
      >
        <button
          onClick={onToggle}
          className={`w-full py-4 px-6 flex items-center justify-between transition-all duration-300 relative overflow-hidden`}
        >
          {/* Collapsed rows carry a faint wash of their band colour so the
              performance ladder reads at a glance before anything is opened. */}
          <div
            className={`absolute inset-0 bg-gradient-to-r ${bandConfig.gradient} pointer-events-none transition-opacity duration-500 ${
              isOpen ? 'opacity-0' : 'opacity-[0.12] dark:opacity-[0.15] group-hover:opacity-[0.2]'
            }`}
          />
          {/* Indicator Bar — always in band colour, full strength when open */}
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-500 ${bandConfig.solidBg} ${isOpen ? 'opacity-100' : 'opacity-40'}`}
          />

          <div className="flex items-center gap-5">
            {/* Band Badge - Styled with tier colors */}
            <div
              className={`
                flex flex-col items-center justify-center w-14 h-14 rounded-2xl border transition-all duration-500 relative overflow-hidden
                ${
                  isOpen
                    ? `${bandConfig.bg} ${bandConfig.border} shadow-lg scale-105`
                    : `bg-slate-50 dark:bg-white/5 border-slate-200 dark:border-white/10 group-hover:border-slate-300 dark:group-hover:border-white/20`
                }
            `}
            >
              <div
                className={`absolute inset-0 bg-gradient-to-br ${bandConfig.gradient} ${isOpen ? 'opacity-15' : 'opacity-5 group-hover:opacity-10'}`}
              />
              <span
                className={`t-label mb-0.5 relative z-10 ${isOpen ? bandConfig.text : 'text-slate-500 dark:text-slate-400'}`}
              >
                Band
              </span>
              <span className={`text-2xl font-black leading-none relative z-10 ${bandConfig.text}`}>
                {displayBand}
              </span>
            </div>

            <div className="text-left">
              <div className="flex items-center gap-3">
                <span
                  className={`text-sm font-bold tracking-tight transition-colors duration-300 ${isOpen ? 'text-slate-900 dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}
                >
                  {group.mark}/{prompt.totalMarks} Marks
                </span>
                {group.answers.length > 1 && (
                  <span className="t-label flex items-center gap-1 text-slate-400 bg-slate-200/50 dark:bg-white/10 px-1.5 py-0.5 rounded-lg">
                    <Layers className="w-2.5 h-2.5" /> {group.answers.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 opacity-90">
                <SourceBadge
                  source={currentSample.source}
                  derivedFromStudent={currentSample.derivedFromStudent}
                />
                {currentSample.contentFlag?.status === 'open' && (
                  <span
                    className="t-label inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-amber-500/10 text-amber-500 border-amber-500/30"
                    title={`Flagged for review: ${currentSample.contentFlag.reason}`}
                  >
                    <Flag className="w-2.5 h-2.5 fill-current" /> Flagged
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isOpen && group.answers.length > 1 && (
              <div
                className="flex items-center gap-1 bg-white dark:bg-black/20 rounded-lg p-0.5 border border-slate-200 dark:border-white/10 shadow-sm"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  onClick={handlePrev}
                  aria-label="Previous sample"
                  className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-500 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                {/* "2 of 3", not a bare "2": the position is meaningless
                    without the total, and a batch of exemplars now arrives
                    several at a time. */}
                <span className="text-[9px] font-bold px-1 text-center text-slate-600 dark:text-slate-300 tabular-nums">
                  {currentIndex + 1}/{group.answers.length}
                </span>
                <button
                  onClick={handleNext}
                  aria-label="Next sample"
                  className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-500 transition-colors"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-500 ${isOpen ? 'rotate-180 text-slate-600 dark:text-white' : 'text-slate-400'}`}
            />
          </div>
        </button>

        {/* Smooth Expansion Animation Container */}
        <div
          inert={!isOpen}
          className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <div className="px-6 pb-6 relative">
              {isSampleAnswerLocked(displayBand) && (
                <ContentLockOverlay
                  feature="sampleAnswers"
                  message={`Band ${displayBand} sample answers are a Plus feature`}
                />
              )}
              <div
                className={`relative rounded-2xl bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))] border ${bandConfig.border} overflow-hidden shadow-inner ${isSampleAnswerLocked(displayBand) ? 'blur-sm select-none pointer-events-none' : ''}`}
              >
                {/* Which exemplar, of the several at this mark.
                    The arrows in the header can step through them, but they
                    say nothing about what is being stepped through: "2 of 5"
                    turns five distinct exemplars into a shuffle, and a student
                    reads all five to find out that four were AI variations on
                    the same shape. Naming each one by where it came from and
                    how long it is makes the choice a choice — most students
                    want the Official one and one contrast, not the set. */}
                {group.answers.length > 1 && (
                  <div className="px-4 pt-4">
                    <p className="t-label text-slate-500 dark:text-slate-400 mb-2">
                      {group.answers.length} exemplars at {group.mark}/{prompt.totalMarks}
                    </p>
                    <div
                      className="flex flex-wrap gap-1.5"
                      role="tablist"
                      aria-label="Exemplars at this mark"
                    >
                      {visibleVariants.map((sample, i) => {
                        const isCurrent = i === currentIndex;
                        return (
                          <button
                            key={sample.id}
                            role="tab"
                            aria-selected={isCurrent}
                            onClick={() => setCurrentIndex(i)}
                            className={`px-2.5 py-1 rounded-lg text-[10px] font-bold border transition-all ${
                              isCurrent
                                ? `${bandConfig.solidBg} ${bandConfig.solidText} border-transparent shadow-sm`
                                : 'bg-white dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20'
                            }`}
                          >
                            {sourceLabel(sample)}
                            <span className={isCurrent ? 'opacity-70' : 'opacity-60'}>
                              {' · '}
                              {wordCountOf(sample.answer)}w
                            </span>
                          </button>
                        );
                      })}
                      {group.answers.length > visibleVariants.length && (
                        <button
                          onClick={() => setShowAllVariants(true)}
                          className="px-2.5 py-1 rounded-lg text-[10px] font-bold border border-dashed border-slate-300 dark:border-white/15 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                        >
                          +{group.answers.length - visibleVariants.length} more
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Controls Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-b border-slate-200 dark:border-white/10 bg-white/50 dark:bg-white/[0.02]">
                  <AnswerMetricsDisplay
                    metrics={metrics}
                    showLabel={false}
                    className="opacity-100 scale-95 origin-left"
                    band={displayBand}
                  />

                  <div className="flex items-center gap-2 ml-auto">
                    {/* "Use" writes the exemplar straight into the student's
                      draft, which is the one thing the writing surface refuses
                      to let a student do by hand: paste is blocked there so a
                      response is the student's own writing. A button that did
                      the same job in one click left the front door locked and
                      the window open. It is handed down only to a curator, who
                      moves exemplars through the editor as part of the job —
                      for a student the exemplar stays something to read and
                      compare against. */}
                    {onUseSample && (
                      <button
                        onClick={handleUseSample}
                        title="Load this exemplar into the writing surface"
                        className="t-label px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all flex items-center gap-1.5"
                      >
                        <Copy className="w-3 h-3" /> Use
                      </button>
                    )}
                    <button
                      onClick={handleCopy}
                      className="t-label px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-all flex items-center gap-1.5"
                    >
                      {isCopied ? <Check className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                      {isCopied ? 'Copied' : 'Copy'}
                    </button>
                    {onContribute && (
                      <button
                        onClick={handleContribute}
                        disabled={isContributing}
                        title="Submit this sample answer to the shared library for review"
                        className="t-label px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-500/30 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <UploadCloud className="w-3 h-3" />{' '}
                        {isContributing ? 'Submitting…' : 'Submit'}
                      </button>
                    )}
                    <button
                      onClick={() => onFlag(currentSample)}
                      className={`p-1.5 rounded-lg transition-all ${
                        currentSample.contentFlag?.status === 'open'
                          ? 'text-amber-500 bg-amber-50 dark:bg-amber-500/10'
                          : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20'
                      }`}
                      title={
                        currentSample.contentFlag?.status === 'open'
                          ? 'This sample is flagged for review — click to view'
                          : 'Something off about this sample? Flag it for review'
                      }
                    >
                      <Flag
                        className={`w-3.5 h-3.5 ${currentSample.contentFlag?.status === 'open' ? 'fill-current' : ''}`}
                      />
                    </button>
                    {canModify && <div className="w-px h-4 bg-slate-300 dark:bg-white/10 mx-1" />}
                    {canModify && (
                      <>
                        <button
                          onClick={() => onRevise(currentSample)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all"
                          title="Revise with AI"
                        >
                          <Repeat className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onEdit(currentSample)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-all"
                          title="Edit manually"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => onDelete(currentSample.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Content */}
                <div
                  className="p-6 font-serif leading-loose text-slate-700 dark:text-slate-300 whitespace-pre-wrap transition-all duration-200"
                  style={{ fontSize: `${fontSize}px`, lineHeight: 1.6 }}
                >
                  {renderFormattedText(currentSample.answer, prompt.keywords, prompt.verb)}
                </div>
              </div>

              {/* Feedback and Coach's Tip — collapsible */}
              {(currentSample.quickTip || currentSample.feedback) && (
                <div className="mt-3">
                  <button
                    onClick={() => setFeedbackExpanded((prev) => !prev)}
                    className="t-label flex items-center gap-1.5 text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-secondary))] transition-colors mb-2"
                  >
                    <ChevronDown
                      className={`w-3 h-3 transition-transform duration-200 ${feedbackExpanded ? '' : '-rotate-90'}`}
                    />
                    {feedbackExpanded ? 'Hide Feedback' : 'Show Feedback'}
                  </button>
                  <div
                    inert={!feedbackExpanded}
                    className={`grid transition-all duration-300 ease-in-out ${feedbackExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
                  >
                    <div className="overflow-hidden space-y-3">
                      {currentSample.quickTip && (
                        <div
                          className={`px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-900/10 flex items-start gap-3`}
                        >
                          <div className="mt-0.5 p-1 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                            <Lightbulb className="w-3 h-3" />
                          </div>
                          <div>
                            <p className="t-label text-indigo-600 dark:text-indigo-400 mb-1">
                              Coach's Tip
                            </p>
                            <p className="text-xs text-indigo-900 dark:text-indigo-200/90 leading-relaxed font-medium">
                              {currentSample.quickTip}
                            </p>
                          </div>
                        </div>
                      )}

                      {currentSample.feedback && (
                        <div className="px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-500/20 flex items-start gap-3">
                          <div className="mt-0.5 p-1 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400 shrink-0">
                            <BookOpen className="w-3 h-3" />
                          </div>
                          <div>
                            <p className="t-label text-amber-600 dark:text-amber-400 mb-1">
                              Feedback
                            </p>
                            <p className="text-xs text-amber-800 dark:text-amber-200/80 leading-relaxed">
                              {renderFormattedText(
                                currentSample.feedback,
                                prompt.keywords,
                                prompt.verb
                              )}
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }
);

const SampleAnswersAccordion: React.FC<SampleAnswersAccordionProps> = ({
  prompt,
  onSampleAnswerGenerated,
  onUseSampleAnswer,
  onDeleteSampleAnswer,
  onUpdateSampleAnswer,
  onContributeSampleAnswer,
  userRole,
  onRecalibrate,
  defaultCollapsed = true,
  fontSize: fontSizeProp,
  onFontSizeChange,
}) => {
  const [openGroupMark, setOpenGroupMark] = useState<number | null>(null);
  // Folded by default, like the Marking Guide and Grade Standards it sits with.
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const panelId = useId();
  const opened = useOpenedOnce(!isCollapsed, prompt.id);
  useSupportResource(prompt.id, 'sampleAnswers', !isCollapsed);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<SampleAnswer | null>(null);
  const [editorTarget, setEditorTarget] = useState<SampleAnswer | null>(null);
  // Deleting an exemplar is destructive and single-click — route it through
  // the shared ConfirmationModal like every other delete in the app.
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [flagTarget, setFlagTarget] = useState<SampleAnswer | null>(null);
  // Reading size is a workspace-wide setting when the parent supplies one, so
  // zooming the question also zooms the exemplars. The local state is only the
  // fallback for any standalone use of this card.
  const [localFontSize, setLocalFontSize] = useState(15);
  const fontSize = fontSizeProp ?? localFontSize;
  const setFontSize = onFontSizeChange ?? setLocalFontSize;
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const [isRecalibratePickerOpen, setIsRecalibratePickerOpen] = useState(false);

  const canCurate = canCurateContent(userRole);
  // AI generation (draft/recalibrate) is a separate capability from manual
  // curation so the role sets can diverge — see utils/permissions.ts.
  const canGenerate = canUseAiGeneration(userRole);
  const studioLocked = isFeatureLocked('aiContentStudio');
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  const maxPossibleBand = useMemo(
    () => getBandForMark(prompt.totalMarks, prompt.totalMarks, commandTermInfo.tier),
    [prompt.totalMarks, commandTermInfo.tier]
  );

  // Placard chrome uses the verb's tier identity (matches the prompt and
  // writing surface); the band ceiling stays numeric in the subtitle.
  const maxBandConfig = useMemo(
    () => getTierScaleConfig(commandTermInfo.tier),
    [commandTermInfo.tier]
  );

  const groupedAnswers = useMemo(() => {
    const groups: Record<number, GroupedSampleAnswers> = {};
    (prompt.sampleAnswers || []).forEach((sa) => {
      if (!groups[sa.mark]) {
        groups[sa.mark] = {
          mark: sa.mark,
          answers: [],
          calculatedBand: getBandForMark(sa.mark, prompt.totalMarks, commandTermInfo.tier),
        };
      }
      groups[sa.mark].answers.push(sa);
    });
    Object.values(groups).forEach((g) => g.answers.sort(byTrustworthiness));
    return Object.values(groups).sort((a, b) => b.mark - a.mark);
  }, [prompt.sampleAnswers, prompt.totalMarks, prompt.verb, commandTermInfo.tier]);

  const totalSamples = groupedAnswers.reduce((sum, g) => sum + g.answers.length, 0);

  const handleRecalibrate = async (
    sampleIds: string[],
    onProgress?: (done: number, total: number) => void
  ) => {
    if (!onRecalibrate) return;
    setIsRecalibrating(true);
    try {
      await onRecalibrate(sampleIds, onProgress);
    } finally {
      // Always release the spinner — a failed AI call must not leave the
      // button stuck in its "recalibrating" state.
      setIsRecalibrating(false);
    }
  };

  return (
    <div className={`${PANEL_SURFACE} mb-3 last:mb-0`}>
      {/* Header: the disclosure on the left, the panel's own controls on the
          right. Reading size, "Generate" and "Recalibrate" used to live in a
          strip inside the body, which meant a student had to open the panel to
          make the exemplars readable and a teacher had to open it to add one.
          They belong in the chrome, where a panel's controls are expected — and
          where they stay reachable while it is folded.

          Access is decided per control: the zoom is a reading aid everybody
          gets, while the two AI actions are gated on `canUseAiGeneration` and
          are simply not rendered for a student or a guest. */}
      <div
        className={`w-full flex items-stretch relative overflow-hidden transition-all ${
          isCollapsed ? '' : 'bg-slate-50/50 dark:bg-white/[0.03]'
        }`}
      >
        <div
          className={`absolute inset-0 opacity-[0.03] bg-gradient-to-r ${maxBandConfig.gradient} pointer-events-none`}
        />

        <button
          onClick={() => setIsCollapsed((c) => !c)}
          aria-expanded={!isCollapsed}
          aria-controls={panelId}
          className={`flex-1 min-w-0 py-3.5 pl-5 pr-3 flex items-center gap-4 text-left transition-all group relative z-10 ${
            isCollapsed ? 'hover:bg-slate-50 dark:hover:bg-white/[0.02]' : ''
          }`}
        >
          <div
            className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center border transition-all duration-500 ${
              isCollapsed
                ? 'bg-slate-100 dark:bg-black/20 border-slate-300 dark:border-white/10 text-slate-500'
                : `${maxBandConfig.solidBg} border-white/20 ${maxBandConfig.solidText} shadow-lg`
            }`}
          >
            <Bookmark className="w-4 h-4" />
          </div>
          <div className="text-left min-w-0">
            <span
              className={`t-label block ${
                isCollapsed
                  ? 'text-slate-500 dark:text-slate-400'
                  : 'text-slate-900 dark:text-white'
              }`}
            >
              Sample Answers
            </span>
            <span className={`t-label block truncate opacity-80 ${maxBandConfig.text}`}>
              {/* The exemplar TOTAL, not just the level count. Eleven models
                  spread over three levels and three models over three levels
                  are very different things to walk into, and the folded card
                  used to describe both as "3 performance levels". */}
              {groupedAnswers.length > 0
                ? `${groupedAnswers.length} level${groupedAnswers.length === 1 ? '' : 's'} · ${totalSamples} exemplar${totalSamples === 1 ? '' : 's'}`
                : 'No models yet'}
              {` · Band ceiling ${maxPossibleBand}`}
            </span>
          </div>
          <div className="flex items-center gap-2.5 shrink-0 ml-auto">
            <PanelReadChip show={opened && isCollapsed} />
            <ChevronDown
              className={`w-4 h-4 shrink-0 text-slate-400 transition-transform duration-500 ${
                isCollapsed ? '' : 'rotate-180 text-slate-900 dark:text-white'
              }`}
            />
          </div>
        </button>

        <div className="flex items-center gap-2 pl-2 pr-4 relative z-10 shrink-0">
          <div className="flex items-center gap-0.5 bg-white dark:bg-black/20 p-0.5 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm">
            <button
              onClick={() => setFontSize(Math.max(12, fontSize - 2))}
              disabled={fontSize <= 12}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40"
              title="Decrease text size"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono font-bold text-slate-500 dark:text-slate-400 w-5 text-center select-none">
              {fontSize}
            </span>
            <button
              onClick={() => setFontSize(Math.min(32, fontSize + 2))}
              disabled={fontSize >= 32}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-100 dark:hover:bg-white/10 disabled:opacity-40"
              title="Increase text size"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {canGenerate && (
            <>
              {onRecalibrate && (
                <button
                  onClick={() => setIsRecalibratePickerOpen(true)}
                  disabled={isRecalibrating || !prompt.sampleAnswers?.length}
                  className={`
                    p-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10
                    text-slate-500 hover:text-indigo-500 disabled:opacity-50 transition-all
                    ${isRecalibrating ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 border-indigo-200' : ''}
                  `}
                  title="Recalibrate samples with AI — choose which ones"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRecalibrating ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={
                  studioLocked
                    ? () => requestUpgrade('aiContentStudio')
                    : () => setIsGeneratorOpen(true)
                }
                title={
                  studioLocked
                    ? 'AI sample-answer generation is part of Band 6 Plus — tap to learn more'
                    : 'Add a sample answer with AI'
                }
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold shadow-sm hover:shadow-lg transition-all ${
                  studioLocked
                    ? 'bg-amber-400/10 border-amber-400/40 text-amber-600 dark:text-amber-400'
                    : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 hover:border-indigo-500/30 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden sm:inline">Generate</span>
                {studioLocked && <PlusLockChip />}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Folded away means not rendered — a card with several exemplars, each
          running its own metrics, should not keep working out of sight. */}
      {!isCollapsed && (
        <div id={panelId}>
          {groupedAnswers.length > 0 ? (
            groupedAnswers.map((group) => (
              <CarouselAccordionItem
                key={group.mark}
                group={group}
                prompt={prompt}
                isOpen={openGroupMark === group.mark}
                onToggle={() =>
                  setOpenGroupMark((prev) => (prev === group.mark ? null : group.mark))
                }
                onUseSample={onUseSampleAnswer}
                onRevise={(sa) => setRevisionTarget(sa)}
                onEdit={(sa) => setEditorTarget(sa)}
                onDelete={(id) => setDeleteTargetId(id)}
                onContribute={onContributeSampleAnswer}
                onFlag={(sa) => setFlagTarget(sa)}
                canModify={canCurate}
                fontSize={fontSize}
              />
            ))
          ) : (
            <div className="py-12 flex flex-col items-center text-center opacity-60">
              <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-3" />
              <p className="text-xs font-medium text-slate-500">
                No model responses available yet.
              </p>
              {canCurate && (
                <p className="text-[10px] text-slate-400 mt-1">
                  Click generate to create exemplary answers.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <SampleAnswerGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        prompt={prompt}
        onSampleAnswerGenerated={(answer) => {
          // Open the panel behind the modal as the batch lands. A teacher who
          // just generated five exemplars into a folded card had nothing to
          // show for it but a toast, and the panel defaults to folded.
          setIsCollapsed(false);
          setOpenGroupMark(answer.mark);
          onSampleAnswerGenerated(answer);
        }}
      />

      {onRecalibrate && (
        <RecalibrateSamplesModal
          isOpen={isRecalibratePickerOpen}
          onClose={() => setIsRecalibratePickerOpen(false)}
          prompt={prompt}
          onRecalibrate={handleRecalibrate}
        />
      )}

      {revisionTarget && (
        <SampleAnswerRevisionModal
          isOpen={!!revisionTarget}
          onClose={() => setRevisionTarget(null)}
          prompt={prompt}
          sampleToRevise={revisionTarget}
          existingMarks={groupedAnswers.map((g) => g.mark)}
          onRevisionComplete={(sa) => {
            onSampleAnswerGenerated(sa);
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
          onSave={(updated) => {
            onUpdateSampleAnswer(updated);
            setEditorTarget(null);
          }}
        />
      )}

      {flagTarget && (
        <FlagContentModal
          isOpen={!!flagTarget}
          onClose={() => setFlagTarget(null)}
          itemLabel="sample answer"
          existingFlag={flagTarget.contentFlag}
          onFlag={(reason) =>
            onUpdateSampleAnswer({
              ...flagTarget,
              contentFlag: { reason, flaggedAt: Date.now(), status: 'open' },
            })
          }
          onResolve={() =>
            onUpdateSampleAnswer(
              flagTarget.contentFlag
                ? {
                    ...flagTarget,
                    contentFlag: { ...flagTarget.contentFlag, status: 'resolved' },
                  }
                : flagTarget
            )
          }
        />
      )}

      <ConfirmationModal
        isOpen={!!deleteTargetId}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={() => {
          if (deleteTargetId) onDeleteSampleAnswer(deleteTargetId);
        }}
        title="Delete this sample answer?"
        message="The model response will be removed from this question. This cannot be undone."
        confirmButtonText="Delete"
        isDestructive
      />
    </div>
  );
};

interface SampleAnswersAccordionProps {
  prompt: Prompt;
  onSampleAnswerGenerated: (answer: SampleAnswer) => void;
  /** Load an exemplar into the writing surface. Supplied for a curator only:
   *  a student's draft has to be a student's own writing (see Editor's paste
   *  guard), and this button is the same act in one click. */
  onUseSampleAnswer?: (text: string) => void;
  onDeleteSampleAnswer: (id: string) => void;
  onUpdateSampleAnswer: (answer: SampleAnswer) => void;
  onContributeSampleAnswer?: (answer: SampleAnswer) => void | Promise<void>;
  userRole: UserRole;
  /** Re-mark the chosen exemplars against the rubric. */
  onRecalibrate?: (
    sampleIds: string[],
    onProgress?: (done: number, total: number) => void
  ) => Promise<void>;
  /** Start folded. Defaults to true, matching the rail's other panels. */
  defaultCollapsed?: boolean;
  /** Shared workspace reading size. Omit to keep a private size. */
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
}

export default SampleAnswersAccordion;
