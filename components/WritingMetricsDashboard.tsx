import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Prompt, WritingMode } from '../types';
import { getCommandTermInfo, getRecommendedTime, getExpectedTerms } from '../data/commandTerms';
import { BandConfig } from '../utils/renderUtils';
import { useWritingMetrics } from '../hooks/useWritingMetrics';
import type { SyllabusPlacement } from '../utils/syllabusTermSource';
import {
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  BarChart3,
  Check,
  Sparkles,
  AlignLeft,
  BookMarked,
} from 'lucide-react';
import { PANEL_HEADER_OPEN, PANEL_SURFACE } from '../utils/panelStyles';
import { PanelReadChip, useOpenedOnce } from './PanelDisclosure';

interface PillProps {
  label: string;
  active: boolean;
  theme?: BandConfig;
  onClick?: () => void;
  /** Named by the question or its syllabus — a must-use term. */
  keyTerm?: boolean;
}

/**
 * How long a Coach-Mode draft may sit untouched before the clock stops.
 *
 * The clock starts itself on the first keystroke, which is the only way it was
 * ever going to measure anything — in Coach Mode it waited for a Play button
 * almost nobody presses, so the one figure on this strip with a consequence
 * was usually frozen at its starting value. Starting itself means it also has
 * to stop itself: a tab left open overnight would otherwise report a student
 * eight hours over their six-mark question, and a number nobody believes is
 * worse than no number. Exam Mode never pauses — under exam conditions the
 * clock does not stop while you think.
 */
const IDLE_PAUSE_MS = 3 * 60 * 1000;

/** A figure that supports the clock rather than competing with it. */
const SupportStat: React.FC<{ children: React.ReactNode; title?: string }> = ({
  children,
  title,
}) => (
  <span title={title} className="t-label block truncate text-slate-600 dark:text-slate-300">
    {children}
  </span>
);

/** Telemetry, per DesignSpec §4: figures are set in the mono face. */
const Figure: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="font-mono tabular-nums">{children}</span>
);

/** Compact structural stat (paragraphs / sentences / sentence length). */
const StructureTile: React.FC<{
  label: string;
  value: string | number;
  alert?: boolean;
  title?: string;
}> = ({ label, value, alert = false, title }) => (
  <div
    title={title}
    className={`rounded-xl border p-2.5 text-center transition-colors duration-300 ${
      alert
        ? 'border-amber-300 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-900/10'
        : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]'
    }`}
  >
    <span className="block text-lg font-black tabular-nums tracking-tight text-slate-900 dark:text-white">
      {value}
    </span>
    <span className="t-label block text-slate-500 dark:text-slate-400 mt-0.5">{label}</span>
  </div>
);

const Pill: React.FC<PillProps> = React.memo(({ label, active, theme, onClick, keyTerm }) => {
  const interactiveStyle = onClick
    ? 'cursor-pointer hover:scale-[1.02] active:scale-[0.98]'
    : 'cursor-default';

  const baseStyle = `inline-flex items-center justify-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-semibold tracking-tight transition-all duration-300 border ${interactiveStyle}`;

  let colorStyle =
    'bg-slate-50 dark:bg-white/[0.03] text-slate-600 dark:text-white/60 border-slate-200 dark:border-white/10 hover:border-slate-300 dark:hover:border-white/20';

  if (active && theme) {
    colorStyle = `${theme.bg} ${theme.text} ${theme.border} shadow-sm`;
  } else if (active) {
    colorStyle =
      'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 shadow-sm';
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      title={
        keyTerm
          ? 'Named in the question or its syllabus — a must-use term'
          : 'Supporting term — click to add it to your answer'
      }
      className={`${baseStyle} ${colorStyle}`}
    >
      {active ? (
        <Check className="w-2.5 h-2.5" strokeWidth={3} />
      ) : keyTerm ? (
        // The same bookmark the Syllabus Terms panel gives a must-use chip, so
        // a term that matters more is recognisable as the same thing on both
        // surfaces rather than two unrelated decorations.
        <BookMarked className="w-2.5 h-2.5 shrink-0 opacity-70" />
      ) : (
        <div className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
      )}
      <span>{label}</span>
    </button>
  );
});

interface WritingMetricsDashboardProps {
  userAnswer: string;
  prompt: Prompt;
  onAddWord: (word: string) => void;
  writingMode?: WritingMode;
  /** The syllabus above this question, so the term tracker can mark the terms
   *  the question names itself — the same split the panel above it shows. */
  syllabus?: SyllabusPlacement;
}

export const WritingMetricsDashboard: React.FC<WritingMetricsDashboardProps> = React.memo(
  ({ userAnswer, prompt, onAddWord, writingMode = 'coach', syllabus }) => {
    // Exam Mode: no live feedback — just the essentials (words + a running
    // countdown). The syllabus %, insights, term tracker and connectors are all
    // coaching aids and stay hidden.
    const isExamMode = writingMode === 'exam';
    // Collapsed by default. The headline stats stay on the strip; the detail
    // panels below are reference material a student opens deliberately, not
    // something that should push the evaluation results off screen.
    const [isCollapsed, setIsCollapsed] = useState(true);
    const opened = useOpenedOnce(!isCollapsed, prompt.id);
    const [isTimerActive, setIsTimerActive] = useState(false);
    const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const commandTermInfo = useMemo(() => getCommandTermInfo(prompt.verb), [prompt.verb]);
    const { wordCount, analysis, keywordStats, progressInfo } = useWritingMetrics(
      userAnswer,
      prompt,
      syllabus
    );

    // The term tracker lists every term as a pill. Ordering them by whether the
    // question names them puts the ones a marker is looking for at the front of
    // each group, which is the only place a student reads before scrolling.
    const isKeyTerm = useMemo(() => {
      const keyTerms = new Set(keywordStats.mustUse);
      return (term: string) => keyTerms.has(term);
    }, [keywordStats.mustUse]);
    const byPriority = useMemo(
      () => (terms: string[]) => [
        ...terms.filter(isKeyTerm),
        ...terms.filter((t) => !isKeyTerm(t)),
      ],
      [isKeyTerm]
    );
    const recommendedTime = useMemo(
      () => getRecommendedTime(prompt.totalMarks, commandTermInfo),
      [prompt.totalMarks, commandTermInfo]
    );
    const expectedTerms = useMemo(
      () => getExpectedTerms(prompt.totalMarks, commandTermInfo),
      [prompt.totalMarks, commandTermInfo]
    );
    // Time SPENT, not time left. The clock used to count a remaining figure
    // down and stop dead at 00:00, where it sat red for the rest of the
    // session — a cliff at exactly the moment the information gets useful,
    // because "you are two minutes over" is what a student practising under
    // HSC conditions actually needs to know. Counting up and deriving the
    // remainder gives both readings from one number, and the overrun has
    // somewhere to go.
    const [elapsed, setElapsed] = useState(0);
    /** Set when the STUDENT pressed pause, so typing does not override them. */
    const pausedByUser = useRef(false);
    const lastTypedAt = useRef(0);

    // Reset the clock whenever the question or the mode changes. Keyed on the
    // prompt id (not just the recommended time) so switching between two
    // questions worth the same marks still restarts it. In Exam Mode it starts
    // immediately — you are under exam conditions the moment you switch in.
    useEffect(() => {
      setElapsed(0);
      pausedByUser.current = false;
      lastTypedAt.current = Date.now();
      setIsTimerActive(isExamMode);
    }, [prompt.id, recommendedTime, isExamMode]);

    // Writing starts the clock, and resumes it after an idle pause. Pressing
    // Pause is a decision, so it survives the next keystroke.
    useEffect(() => {
      if (!userAnswer.trim()) return;
      lastTypedAt.current = Date.now();
      if (!pausedByUser.current) setIsTimerActive(true);
    }, [userAnswer]);

    useEffect(() => {
      if (!isTimerActive) return;
      timerIntervalRef.current = setInterval(() => {
        if (!isExamMode && Date.now() - lastTypedAt.current > IDLE_PAUSE_MS) {
          setIsTimerActive(false);
          return;
        }
        setElapsed((seconds) => seconds + 1);
      }, 1000);
      return () => {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      };
    }, [isTimerActive, isExamMode]);

    const formatTime = (s: number) =>
      `${Math.floor(s / 60)
        .toString()
        .padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;

    const remainingTime = recommendedTime - elapsed;
    const isOverTime = remainingTime < 0;
    const budgetMinutes = Math.max(1, Math.round(recommendedTime / 60));
    const clock = isOverTime
      ? `+${formatTime(-remainingTime)}`
      : formatTime(Math.max(0, remainingTime));

    // The caption says what the figure above it is measuring against, which
    // the figure alone cannot: before the clock starts it names the budget and
    // where the budget comes from, and after it starts it names the direction.
    const clockCaption = isOverTime
      ? `over ${budgetMinutes} min`
      : elapsed === 0
        ? `${budgetMinutes} min for ${prompt.totalMarks} ${prompt.totalMarks === 1 ? 'mark' : 'marks'}`
        : isTimerActive
          ? `left of ${budgetMinutes} min`
          : 'paused';

    // Tone, not opacity. The sub-minute state used to be `animate-pulse` on red
    // text — an opacity animation on a reading, which DesignSpec §2 rule 3 is
    // written to keep out of this codebase, and it dipped the contrast of the
    // one figure that had just become urgent.
    const clockTone = isOverTime
      ? 'text-red-600 dark:text-red-400'
      : remainingTime <= 60
        ? 'text-amber-700 dark:text-amber-400'
        : 'text-slate-900 dark:text-white';

    // A ticking display is not readable as digits by a screen reader, and
    // role="timer" is implicitly aria-live="off", so this is read on demand
    // rather than announced every second.
    const spokenClock = `${Math.floor(Math.abs(remainingTime) / 60)} minutes ${
      Math.abs(remainingTime) % 60
    } seconds ${isOverTime ? 'over' : 'left of'} the ${budgetMinutes} minute guide for this question`;

    // The panel wears the same surface as every other one below the writing
    // area — see utils/panelStyles. It used to carry a heavier border, a
    // `shadow-xl` and a near-black fill, which made the live stats read as a
    // separate device bolted under the workspace rather than the first of the
    // reference panels.
    return (
      <div className={PANEL_SURFACE}>
        {/* The divider only earns its place when something sits below it —
            collapsed, it doubled up with the card's own bottom border. */}
        <div
          className={`flex flex-col sm:flex-row items-stretch ${PANEL_HEADER_OPEN} ${
            isCollapsed || isExamMode ? '' : 'border-b border-slate-300 dark:border-white/10'
          }`}
        >
          {/* One lead, two supports.
              Three equal stat boxes — icon, small label, large figure, divider
              — is the treatment the design skill names as the generic default,
              and the three facts here are not equal. The clock is the only one
              that moves on its own, the only one with a consequence, and the
              one a student under exam conditions is actually managing. Words
              and syllabus coverage answer to it. */}
          <div className="flex flex-1 items-center gap-5 sm:gap-8 px-4 sm:px-5 py-3 min-w-0">
            <div className="shrink-0">
              <span
                role="timer"
                aria-label={spokenClock}
                className={`block font-mono text-2xl sm:text-3xl font-bold tabular-nums tracking-tight leading-none transition-colors duration-500 ${clockTone}`}
              >
                {clock}
              </span>
              <span className="t-label block mt-1.5 text-slate-500 dark:text-slate-400">
                {clockCaption}
              </span>
            </div>

            <div className="min-w-0 flex flex-col gap-1">
              <SupportStat
                title={`${wordCount} of about ${progressInfo.targetCount} words for a ${progressInfo.targetLabel} response`}
              >
                <Figure>{wordCount}</Figure> words of about{' '}
                <Figure>{progressInfo.targetCount}</Figure>
              </SupportStat>
              {isExamMode ? (
                <SupportStat title="No highlighting, no draft checks, no exemplars">
                  Exam conditions
                </SupportStat>
              ) : (prompt.keywords?.length || 0) > 0 ? (
                <SupportStat
                  title={`${expectedTerms}+ syllabus terms expected for this verb and mark value`}
                >
                  <Figure>{keywordStats.used.length}</Figure> of{' '}
                  <Figure>{prompt.keywords?.length || 0}</Figure> syllabus terms
                </SupportStat>
              ) : (
                <SupportStat>{progressInfo.targetLabel} target</SupportStat>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 px-3 py-2 sm:py-0 border-t sm:border-t-0 sm:border-l border-slate-300 dark:border-white/10">
            <div className="flex gap-1 bg-slate-100 dark:bg-white/5 p-1 rounded-xl border border-slate-200 dark:border-white/10">
              <button
                onClick={() => {
                  const next = !isTimerActive;
                  // A deliberate pause outranks the auto-start: without this,
                  // the next keystroke would start the clock straight back up.
                  pausedByUser.current = !next;
                  if (next) lastTypedAt.current = Date.now();
                  setIsTimerActive(next);
                }}
                aria-label={isTimerActive ? 'Pause timer' : 'Start timer'}
                title={isTimerActive ? 'Pause timer' : 'Start timer'}
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition-all active:scale-90"
              >
                {isTimerActive ? (
                  <Pause className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => {
                  setIsTimerActive(false);
                  pausedByUser.current = false;
                  setElapsed(0);
                }}
                aria-label="Reset timer"
                title="Reset timer"
                className="p-1.5 rounded-lg hover:bg-white dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 transition-all active:scale-90"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
            {!isExamMode && (
              <button
                onClick={() => setIsCollapsed(!isCollapsed)}
                aria-label={isCollapsed ? 'Expand writing metrics' : 'Collapse writing metrics'}
                aria-expanded={!isCollapsed}
                title={
                  isCollapsed
                    ? 'Show syllabus term tracker and structure breakdown'
                    : 'Collapse metrics'
                }
                className="flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-full hover:bg-slate-100 dark:hover:bg-white/10 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all"
              >
                {/* Named, not just a chevron — the panel starts collapsed, so
                    nothing else tells a student the term tracker is in here. */}
                <span className="t-label whitespace-nowrap">
                  {isCollapsed ? 'Terms & Structure' : 'Hide'}
                </span>
                <PanelReadChip show={opened && isCollapsed} />
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-500 ${isCollapsed ? '-rotate-90' : ''}`}
                />
              </button>
            )}
          </div>
        </div>

        {/* Improved Smooth Expansion Container — all live-feedback panels; hidden
            entirely under Exam conditions. */}
        <div
          inert={isCollapsed || isExamMode}
          className={`grid transition-all duration-500 ease-in-out ${isCollapsed || isExamMode ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] opacity-100'}`}
        >
          <div className="overflow-hidden">
            <div className="p-4 sm:p-5 space-y-5">
              <div className="p-3.5 sm:p-4 rounded-2xl border border-slate-200 dark:border-white/20 bg-slate-50 dark:bg-black/30 shadow-inner">
                <div className="flex items-center justify-between gap-4 mb-3 px-0.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <BarChart3 className="w-4 h-4 shrink-0 text-indigo-500 dark:text-indigo-400" />
                    <span className="t-label sm:tracking-[0.3em] text-slate-500 dark:text-slate-400 truncate">
                      Target Standard: {progressInfo.targetLabel}
                    </span>
                  </div>
                  <span className="t-label font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                    {Math.round(progressInfo.percentage)}% Capacity
                  </span>
                </div>
                <div className="h-2.5 bg-slate-200 dark:bg-black/40 rounded-full overflow-hidden border border-slate-300/50 dark:border-white/10">
                  <div
                    className={`h-full bg-gradient-to-r ${progressInfo.currentBandColor.gradient} transition-all duration-1000 ease-out`}
                    style={{ width: `${progressInfo.percentage}%` }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between gap-3 px-0.5">
                    <div className="flex items-center gap-3">
                      <Sparkles className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                      <h4 className="t-section text-slate-500 dark:text-slate-400">
                        Syllabus Terms
                      </h4>
                    </div>
                    {(prompt.keywords?.length || 0) > 0 && (
                      <span
                        className={`t-label px-2 py-0.5 rounded-full border ${
                          keywordStats.missed.length === 0
                            ? `${progressInfo.currentBandColor.bg} ${progressInfo.currentBandColor.text} ${progressInfo.currentBandColor.border}`
                            : 'text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10'
                        }`}
                        title={
                          keywordStats.mustUseTotal > 0
                            ? `${keywordStats.mustUseUsed} of ${keywordStats.mustUseTotal} terms the question names, and ${keywordStats.used.length} of ${prompt.keywords?.length || 0} in all (${expectedTerms}+ expected for this verb/marks)`
                            : `Terms detected (${expectedTerms}+ expected for this verb/marks)`
                        }
                      >
                        {/* Counted apart only where both kinds exist — with one
                            group there is nothing to separate, and the panel
                            above makes the same call the same way. */}
                        {keywordStats.mustUseTotal > 0 &&
                        keywordStats.mustUseTotal < (prompt.keywords?.length || 0)
                          ? `${keywordStats.mustUseUsed}/${keywordStats.mustUseTotal} key · ${keywordStats.used.length - keywordStats.mustUseUsed}/${(prompt.keywords?.length || 0) - keywordStats.mustUseTotal} more`
                          : `${keywordStats.used.length}/${prompt.keywords?.length || 0}`}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto custom-scrollbar pr-2">
                    {byPriority(keywordStats.used).map((kw) => (
                      <Pill
                        key={kw}
                        label={kw}
                        active={true}
                        keyTerm={isKeyTerm(kw)}
                        theme={progressInfo.currentBandColor}
                        onClick={() => onAddWord(kw)}
                      />
                    ))}
                    {byPriority(keywordStats.missed).map((kw) => (
                      <Pill
                        key={kw}
                        label={kw}
                        active={false}
                        keyTerm={isKeyTerm(kw)}
                        onClick={() => onAddWord(kw)}
                      />
                    ))}
                    {prompt.keywords?.length === 0 && (
                      <span className="text-[10px] text-slate-400 italic">No terms defined</span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center gap-3 px-0.5">
                    <AlignLeft className="w-4 h-4 text-sky-500 dark:text-sky-400" />
                    <h4 className="t-section text-slate-500 dark:text-slate-400">Structure</h4>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <StructureTile
                      label="Paragraphs"
                      value={analysis.wordCount > 0 ? analysis.paragraphCount : '—'}
                    />
                    <StructureTile
                      label="Sentences"
                      value={analysis.wordCount > 0 ? analysis.sentenceCount : '—'}
                    />
                    <StructureTile
                      label="Avg Words"
                      value={analysis.wordCount > 0 ? analysis.avgWordsPerSentence : '—'}
                      alert={analysis.avgWordsPerSentence > 30}
                      title={
                        analysis.avgWordsPerSentence > 30
                          ? 'Sentences are running long — HSC markers reward clear, controlled sentences'
                          : 'Average words per sentence'
                      }
                    />
                  </div>
                  <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 px-0.5">
                    {analysis.wordCount === 0
                      ? 'Structure updates live as you write.'
                      : analysis.longestSentenceWords > 45
                        ? `Longest sentence: ${analysis.longestSentenceWords} words — consider splitting it.`
                        : `Longest sentence: ${analysis.longestSentenceWords} words.`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

WritingMetricsDashboard.displayName = 'WritingMetricsDashboard';
export default WritingMetricsDashboard;
