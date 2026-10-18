import React, { useEffect, useMemo, useState } from 'react';
import type { Updater } from 'use-immer';
import type { ToastType } from '../hooks/useToast';
import type { Course, DotPoint, Prompt } from '../types';
import { generateNewPrompt } from '../services/geminiService';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { type BatchTask } from '../utils/batchProcessor';
import { useBatchRun } from '../hooks/useBatchRun';
import {
  findStarterTargets,
  planStarterQuestion,
  starterOutcomes,
  type StarterTarget,
} from '../utils/starterQuestions';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Sparkles, X, CheckCircle2, AlertTriangle, CircleHelp } from 'lucide-react';
import {
  CREATOR_BACKDROP,
  CREATOR_SHELL,
  CREATOR_HEADER,
  CREATOR_ICON_TILE,
  CREATOR_KICKER,
  CREATOR_TITLE,
  CREATOR_CLOSE,
  CREATOR_BODY,
  CREATOR_FOOTER,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_PRIMARY_BUTTON,
  CREATOR_FIELD_LABEL,
  CREATOR_INPUT,
} from '../utils/creatorChrome';

interface StarterQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course | undefined;
  /** Narrow the offer to one topic — e.g. the one just imported. */
  initialTopicId?: string;
  updateCourses: Updater<Course[]>;
  showToast: (message: string, type: ToastType) => void;
}

/**
 * The step that turns an imported syllabus into a usable course.
 *
 * An import produces topics, sub-topics and dot points and no questions — the
 * one thing a student opens the app for. Filling that in meant the admin audit
 * studio (a separate tool, built for auditing an existing library) or the
 * picker, one dot point at a time. For a 90-dot-point syllabus neither is a
 * plausible way to finish the job.
 *
 * Nothing runs until Start is pressed. This spends real AI budget per dot
 * point, so the count and the scope are on screen before the decision, and the
 * run can be stopped mid-way — the questions already written stay.
 */
const StarterQuestionsModal: React.FC<StarterQuestionsModalProps> = ({
  isOpen,
  onClose,
  course,
  initialTopicId,
  updateCourses,
  showToast,
}) => {
  const [topicId, setTopicId] = useState<string>('__all__');

  /**
   * `isRunning` used to be derived as `progress && !progress.isComplete`, and
   * `isComplete` is not "the run has ended" — it is "every task is accounted
   * for", which a stopped or halted run is not. Pressing Stop therefore left
   * this modal believing it was still running for ever: close disabled, Stop
   * still on screen doing nothing, Done never offered, and no way out but a
   * page reload. `useBatchRun` reports what the runner actually did.
   */
  const { progress, isRunning, run, stop, reset } = useBatchRun();

  useEffect(() => {
    if (isOpen) {
      setTopicId(initialTopicId ?? '__all__');
      reset();
    }
  }, [isOpen, initialTopicId, reset]);

  // Recomputed from the live course, so finishing a run leaves the count at
  // zero rather than showing what it was when the modal opened.
  const targets: StarterTarget[] = useMemo(
    () => findStarterTargets(course, topicId === '__all__' ? undefined : { topicId }),
    [course, topicId]
  );

  const handleClose = () => {
    if (isRunning) return;
    onClose();
  };

  useEscapeKey(isOpen && !isRunning, handleClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  const handleStart = async () => {
    if (!course || targets.length === 0) return;
    if (isFeatureLocked('aiContentStudio')) {
      requestUpgrade('aiContentStudio');
      return;
    }

    const tasks: BatchTask<void>[] = targets.map((target) => ({
      id: `starter-${target.path.dotPointId}`,
      description: `${target.subTopicName}: ${target.description.slice(0, 40)}…`,
      action: async () => {
        const topic = course.topics.find((t) => t.id === target.path.topicId);
        const { targetMarks, verbs } = planStarterQuestion(target.description);
        const prompt: Prompt = await generateNewPrompt(
          course.name,
          target.topicName,
          target.description,
          targetMarks,
          verbs,
          starterOutcomes(course, topic)
        );
        updateCourses((draft) => {
          const dotPoint: DotPoint | undefined = draft
            .find((c) => c.id === target.path.courseId)
            ?.topics.find((t) => t.id === target.path.topicId)
            ?.subTopics.find((st) => st.id === target.path.subTopicId)
            ?.dotPoints.find((dp) => dp.id === target.path.dotPointId);
          if (!dotPoint) return;
          if (!dotPoint.prompts) dotPoint.prompts = [];
          // Re-checked inside the write: a run started twice, or one overlapping
          // a question written by hand, must not stack two questions on a dot
          // point this pass was only ever meant to give a first one.
          if (dotPoint.prompts.length === 0) dotPoint.prompts.push(prompt);
        });
      },
    }));

    const outcome = await run(tasks, 2);
    if (outcome.runnerError) {
      showToast('The run could not start. Try again in a moment.', 'error');
    }
  };

  const handleFinish = () => {
    const written = progress?.completed ?? 0;
    if (written > 0) {
      showToast(`Wrote ${written} starter question${written === 1 ? '' : 's'}.`, 'success');
    }
    onClose();
  };

  if (!isOpen || !course) return null;

  /**
   * The run is over — finished, stopped part-way, or halted by the provider.
   * All three end with questions written and a person who needs to leave, so
   * all three get the same way out.
   */
  const ended = !!progress && !isRunning;
  const stoppedEarly = ended && progress.completed + progress.failed < progress.total;

  return (
    <div className={CREATOR_BACKDROP} onClick={handleClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="starter-questions-title"
        className={`${CREATOR_SHELL} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <CircleHelp className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={`${CREATOR_KICKER} truncate`}>{course.name}</p>
            <h2 id="starter-questions-title" className={CREATOR_TITLE}>
              Write starter questions
            </h2>
          </div>
          <button
            type="button"
            onClick={handleClose}
            aria-label="Close"
            disabled={isRunning}
            className={`${CREATOR_CLOSE} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className={`${CREATOR_BODY} space-y-5`}>
          {!progress && (
            <>
              <div>
                <label htmlFor="starter-scope" className={CREATOR_FIELD_LABEL}>
                  Cover
                </label>
                <select
                  id="starter-scope"
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className={CREATOR_INPUT}
                >
                  <option value="__all__">The whole course</option>
                  <optgroup label="One topic">
                    {course.topics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>

              <div className="rounded-xl border border-slate-300 dark:border-white/15 p-4 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-surface-inset">
                {targets.length === 0 ? (
                  <p className="text-sm text-muted flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 light:text-green-700" />
                    Every syllabus point here already has a question.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800 font-semibold">
                      {targets.length} syllabus point{targets.length === 1 ? '' : 's'} with no
                      question yet.
                    </p>
                    <p className="text-xs text-[rgb(var(--color-text-muted))] mt-1.5">
                      Each one gets a single question, with its marks and command verb taken from
                      the syllabus point&apos;s own wording. Points that already have a question are
                      skipped, so running this twice costs nothing. You can stop part-way and keep
                      what has been written.
                    </p>
                  </>
                )}
              </div>
            </>
          )}

          {progress && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between text-sm mb-2">
                  <span className="font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                    {ended
                      ? stoppedEarly
                        ? 'Stopped'
                        : 'Finished'
                      : progress.currentTask || 'Working…'}
                  </span>
                  <span className="text-[rgb(var(--color-text-muted))]">
                    {progress.completed + progress.failed} of {progress.total}
                  </span>
                </div>
                <div
                  className="h-2 rounded-full bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 overflow-hidden"
                  role="progressbar"
                  aria-valuenow={progress.completed + progress.failed}
                  aria-valuemin={0}
                  aria-valuemax={progress.total}
                >
                  <div
                    className="h-full bg-[rgb(var(--color-primary))] transition-all"
                    style={{
                      width: `${((progress.completed + progress.failed) / Math.max(progress.total, 1)) * 100}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-[rgb(var(--color-text-muted))]">
                  {progress.completed} written
                  {progress.failed > 0 ? `, ${progress.failed} failed` : ''}
                </p>
              </div>

              {progress.fatalError && (
                <div className="rounded-lg bg-red-900/20 light:bg-red-50 border border-red-500/25 light:border-red-200 p-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 light:text-red-700 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-200 light:text-red-800">
                    <p className="font-semibold">{progress.fatalError.userMessage}</p>
                    <p className="mt-0.5">{progress.fatalError.suggestion}</p>
                  </div>
                </div>
              )}

              {progress.logs.length > 0 && (
                <div className="rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-surface-inset border border-slate-300 dark:border-white/15 p-3 max-h-48 overflow-y-auto">
                  <ul className="space-y-1 font-mono text-xs text-[rgb(var(--color-text-muted))]">
                    {progress.logs.slice(0, 30).map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={CREATOR_FOOTER}>
          {!progress && (
            <>
              <button type="button" onClick={handleClose} className={CREATOR_SECONDARY_BUTTON}>
                Not now
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={targets.length === 0}
                className={CREATOR_PRIMARY_BUTTON}
              >
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                Write {targets.length} question{targets.length === 1 ? '' : 's'}
              </button>
            </>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={stop}
              className="min-h-11 sm:min-h-0 py-2.5 px-5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition"
            >
              Stop
            </button>
          )}
          {/* Offered for any run that has ended, not only one that reached the
              last task. A stopped or halted run leaves questions written and a
              person who needs to leave the modal. */}
          {ended && (
            <button type="button" onClick={handleFinish} className={CREATOR_PRIMARY_BUTTON}>
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StarterQuestionsModal;
