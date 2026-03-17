import React, { useState, useMemo, useEffect } from 'react';
import { Prompt, SampleAnswer, UserRole } from '../types';
import { renderFormattedText, getBandConfig, cleanMarkdown } from '../utils/renderUtils';
import { getBandForMark, getCommandTermInfo } from '../data/commandTerms';
import SampleAnswerGeneratorModal from './SampleAnswerGeneratorModal';
import SampleAnswerRevisionModal from './SampleAnswerRevisionModal';
import SampleAnswerEditorModal from './SampleAnswerEditorModal';
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
} from 'lucide-react';
import { useAnswerMetrics } from '../hooks/useAnswerMetrics';
import AnswerMetricsDisplay from './AnswerMetricsDisplay';

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
  band: number;
  calculatedBand: number;
}

const SourceBadge: React.FC<{ source?: string }> = ({ source }) => {
  const isAi = source === 'AI';
  const isUser = source === 'USER';
  const isHsc = source === 'HSC_EXEMPLAR';

  const config = isAi
    ? 'bg-slate-100 text-slate-500 border-slate-200 dark:bg-white/5 dark:text-slate-400 dark:border-white/10'
    : isUser
      ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
      : 'bg-amber-500/10 text-amber-500 border-amber-500/20';

  const Icon = isUser ? UserIcon : isHsc ? BookOpen : Sparkles;
  const label = isUser ? 'Student' : isHsc ? 'Official' : 'AI Model';

  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${config}`}
    >
      <Icon className="w-2.5 h-2.5" /> {label}
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
    canModify,
    fontSize,
  }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isCopied, setIsCopied] = useState(false);

    useEffect(() => {
      if (currentIndex >= group.answers.length && group.answers.length > 0) {
        setCurrentIndex(group.answers.length - 1);
      }
    }, [group.answers.length, currentIndex]);

    const currentSample = group.answers[currentIndex];
    const safeAnswer = currentSample?.answer || '';
    const safeBand = currentSample?.band || 1;
    const bandConfig = useMemo(() => getBandConfig(safeBand), [safeBand]);
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
      const cleanText = cleanMarkdown(currentSample.answer);
      onUseSample(cleanText);
    };

    const handleCopy = async () => {
      await navigator.clipboard.writeText(cleanMarkdown(currentSample.answer));
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    };

    return (
      <div
        className={`group border-b border-slate-100 dark:border-white/5 last:border-0 transition-all duration-500 ${isOpen ? `bg-opacity-10 ${bandConfig.bg}` : ''}`}
      >
        <button
          onClick={onToggle}
          className={`w-full py-4 px-6 flex items-center justify-between transition-all duration-300 relative overflow-hidden`}
        >
          {/* Active Indicator Bar */}
          <div
            className={`absolute left-0 top-0 bottom-0 w-1 transition-all duration-500 ${isOpen ? bandConfig.solidBg : 'bg-transparent'}`}
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
                className={`text-[8px] font-black uppercase tracking-widest mb-0.5 relative z-10 ${isOpen ? bandConfig.text : 'text-slate-400 dark:text-slate-500'}`}
              >
                Band
              </span>
              <span className={`text-2xl font-black leading-none relative z-10 ${bandConfig.text}`}>
                {group.band}
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
                  <span className="flex items-center gap-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-200/50 dark:bg-white/10 px-1.5 py-0.5 rounded-md">
                    <Layers className="w-2.5 h-2.5" /> {group.answers.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 mt-1.5 opacity-90">
                <SourceBadge source={currentSample.source} />
                <span className="text-[10px] font-mono text-slate-400">
                  #{currentSample.id.split('-').pop()?.slice(0, 4)}
                </span>
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
                  className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-slate-500 transition-colors"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[9px] font-bold w-4 text-center text-slate-600 dark:text-slate-300">
                  {currentIndex + 1}
                </span>
                <button
                  onClick={handleNext}
                  className="p-1 hover:bg-slate-100 dark:hover:bg-white/10 rounded text-slate-500 transition-colors"
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
          className={`grid transition-all duration-500 ease-in-out ${isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}
        >
          <div className="overflow-hidden">
            <div className="px-6 pb-6">
              <div
                className={`relative rounded-2xl bg-slate-50 dark:bg-[#0f1115] border ${bandConfig.border} border-opacity-30 overflow-hidden shadow-inner`}
              >
                {/* Controls Bar */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 p-4 border-b border-slate-200 dark:border-white/5 bg-white/50 dark:bg-white/[0.02]">
                  <AnswerMetricsDisplay
                    metrics={metrics}
                    showLabel={false}
                    className="opacity-100 scale-95 origin-left"
                    tier={group.band}
                  />

                  <div className="flex items-center gap-2 ml-auto">
                    <button
                      onClick={handleUseSample}
                      className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all flex items-center gap-1.5"
                    >
                      <Copy className="w-3 h-3" /> Use
                    </button>
                    <button
                      onClick={handleCopy}
                      className="text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 transition-all flex items-center gap-1.5"
                    >
                      {isCopied ? <Check className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                      {isCopied ? 'Copied' : 'Copy'}
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

              {/* Feedback and Coach's Tip */}
              <div className="space-y-3 mt-3">
                {currentSample.quickTip && (
                  <div
                    className={`px-4 py-3 rounded-xl border border-indigo-100 dark:border-indigo-500/20 bg-indigo-50 dark:bg-indigo-900/10 flex items-start gap-3`}
                  >
                    <div className="mt-0.5 p-1 rounded-full bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                      <Lightbulb className="w-3 h-3" />
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-1">
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
                      <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider mb-1">
                        Feedback
                      </p>
                      <p className="text-xs text-amber-800 dark:text-amber-200/80 leading-relaxed">
                        {currentSample.feedback}
                      </p>
                    </div>
                  </div>
                )}
              </div>
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
  userRole,
  onRecalibrate,
}) => {
  const [openGroupMark, setOpenGroupMark] = useState<number | null>(null);
  const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);
  const [revisionTarget, setRevisionTarget] = useState<SampleAnswer | null>(null);
  const [editorTarget, setEditorTarget] = useState<SampleAnswer | null>(null);
  const [fontSize, setFontSize] = useState(13);
  const [isRecalibrating, setIsRecalibrating] = useState(false);

  const isAdmin = userRole === 'admin';
  const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);

  // Calculate maximum possible band for this question based on its cognitive Tier
  const maxPossibleBand = useMemo(() => {
    return getBandForMark(prompt.totalMarks, prompt.totalMarks, commandTermInfo.tier);
  }, [prompt.totalMarks, commandTermInfo.tier]);

  const maxBandConfig = useMemo(() => getBandConfig(maxPossibleBand), [maxPossibleBand]);

  const groupedAnswers = useMemo(() => {
    const groups: Record<number, GroupedSampleAnswers> = {};
    (prompt.sampleAnswers || []).forEach((sa) => {
      if (!groups[sa.mark]) {
        groups[sa.mark] = {
          mark: sa.mark,
          answers: [],
          band: sa.band,
          calculatedBand: getBandForMark(sa.mark, prompt.totalMarks, commandTermInfo.tier),
        };
      }
      groups[sa.mark].answers.push(sa);
    });
    return Object.values(groups).sort((a, b) => b.mark - a.mark);
  }, [prompt.sampleAnswers, prompt.totalMarks, prompt.verb, commandTermInfo.tier]);

  const handleRecalibrate = async () => {
    if (onRecalibrate) {
      setIsRecalibrating(true);
      await onRecalibrate();
      setIsRecalibrating(false);
    }
  };

  return (
    <div className="bg-white dark:bg-[rgb(var(--color-bg-surface))] rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col">
      {/* Header - Styled with highest possible tier color to indicate the question's potential */}
      <div
        className={`px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-white/[0.02] flex items-center justify-between relative overflow-hidden`}
      >
        {/* Ambient Background Gradient matching the question's Max Band */}
        <div
          className={`absolute inset-0 opacity-[0.03] bg-gradient-to-r ${maxBandConfig.gradient} pointer-events-none`}
        />

        <div className="flex items-center gap-3 relative z-10">
          <div
            className={`p-2 rounded-xl transition-colors duration-500 ${maxBandConfig.bg} ${maxBandConfig.text} border ${maxBandConfig.border} border-opacity-30 shadow-sm`}
          >
            <Bookmark className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[10px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">
              Sample Answers
            </h3>
            <p
              className={`text-[10px] font-bold uppercase tracking-wider opacity-80 ${maxBandConfig.text}`}
            >
              {groupedAnswers.length > 0
                ? `${groupedAnswers.length} Performance Levels`
                : 'No models available'}
              {` • Max Tier Cap: Band ${maxPossibleBand}`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <div className="flex items-center gap-1 bg-white dark:bg-black/20 p-1 rounded-lg border border-slate-200 dark:border-white/10 shadow-sm">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFontSize(Math.max(10, fontSize - 1));
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-md hover:bg-slate-100 dark:hover:bg-white/10"
              title="Decrease text size"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <span className="text-[10px] font-mono font-bold text-slate-400 w-6 text-center select-none">
              {fontSize}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setFontSize(Math.min(24, fontSize + 1));
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors rounded-md hover:bg-slate-100 dark:hover:bg-white/10"
              title="Increase text size"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {isAdmin && (
            <>
              {onRecalibrate && (
                <button
                  onClick={handleRecalibrate}
                  disabled={isRecalibrating || !prompt.sampleAnswers?.length}
                  className={`
                                    p-2 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 
                                    text-slate-500 hover:text-indigo-500 disabled:opacity-50 transition-all
                                    ${isRecalibrating ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-500 border-indigo-200' : ''}
                                `}
                  title="Recalibrate All Samples with AI"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isRecalibrating ? 'animate-spin' : ''}`} />
                </button>
              )}
              <button
                onClick={() => setIsGeneratorOpen(true)}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:border-indigo-500/30 text-xs font-bold text-slate-600 dark:text-slate-300 shadow-sm hover:shadow transition-all"
              >
                <Zap className="w-3.5 h-3.5 text-amber-400" />
                <span>Generate</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Content List */}
      <div>
        {groupedAnswers.length > 0 ? (
          groupedAnswers.map((group) => (
            <CarouselAccordionItem
              key={group.mark}
              group={group}
              prompt={prompt}
              isOpen={openGroupMark === group.mark}
              onToggle={() => setOpenGroupMark((prev) => (prev === group.mark ? null : group.mark))}
              onUseSample={onUseSampleAnswer}
              onRevise={(sa) => setRevisionTarget(sa)}
              onEdit={(sa) => setEditorTarget(sa)}
              onDelete={onDeleteSampleAnswer}
              canModify={isAdmin}
              fontSize={fontSize}
            />
          ))
        ) : (
          <div className="py-12 flex flex-col items-center text-center opacity-60">
            <FileText className="w-8 h-8 text-slate-300 dark:text-slate-600 mb-3" />
            <p className="text-xs font-medium text-slate-500">No model responses available yet.</p>
            {isAdmin && (
              <p className="text-[10px] text-slate-400 mt-1">
                Click generate to create exemplary answers.
              </p>
            )}
          </div>
        )}
      </div>

      <SampleAnswerGeneratorModal
        isOpen={isGeneratorOpen}
        onClose={() => setIsGeneratorOpen(false)}
        prompt={prompt}
        onSampleAnswerGenerated={onSampleAnswerGenerated}
      />

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
    </div>
  );
};

interface SampleAnswersAccordionProps {
  prompt: Prompt;
  onSampleAnswerGenerated: (answer: SampleAnswer) => void;
  onUseSampleAnswer: (text: string) => void;
  onDeleteSampleAnswer: (id: string) => void;
  onUpdateSampleAnswer: (answer: SampleAnswer) => void;
  userRole: UserRole;
  onRecalibrate?: () => Promise<void>;
}

export default SampleAnswersAccordion;
