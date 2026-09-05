import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { ToastType } from '../hooks/useToast';
import type { Course, Prompt } from '../types';
import { generateNewPrompt } from '../services/geminiService';
import { isFeatureLocked, requestUpgrade } from '../services/entitlements';
import { runBatchOperations, type BatchProgress, type BatchTask } from '../utils/batchProcessor';
import {
  findStarterTargets,
  planStarterQuestion,
  starterOutcomes,
  type StarterTarget,
} from '../utils/starterQuestions';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { Sparkles, X, CheckCircle2, AlertTriangle, Wand2 } from 'lucide-react';

interface StarterQuestionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  course: Course | undefined;
  /** Narrow the offer to one topic — e.g. the one just imported. */
  initialTopicId?: string;
  updateCourses: (updater: (draft: any) => void) => void;
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
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const isRunning = !!progress && !progress.isComplete;

  useEffect(() => {
    if (isOpen) {
      setTopicId(initialTopicId ?? '__all__');
      setProgress(null);
    }
  }, [isOpen, initialTopicId]);

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

    const controller = new AbortController();
    abortRef.current = controller;

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
        updateCourses((draft: any) => {
          const dotPoint = draft
            .find((c: any) => c.id === target.path.courseId)
            ?.topics.find((t: any) => t.id === target.path.topicId)
            ?.subTopics.find((st: any) => st.id === target.path.subTopicId)
            ?.dotPoints.find((dp: any) => dp.id === target.path.dotPointId);
          if (!dotPoint) return;
          if (!dotPoint.prompts) dotPoint.prompts = [];
          // Re-checked inside the write: a run started twice, or one overlapping
          // a question written by hand, must not stack two questions on a dot
          // point this pass was only ever meant to give a first one.
          if (dotPoint.prompts.length === 0) dotPoint.prompts.push(prompt);
        });
      },
    }));

    await runBatchOperations<void>(tasks, 2, setProgress, controller.signal);
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleFinish = () => {
    const written = progress?.completed ?? 0;
    if (written > 0) {
      showToast(`Wrote ${written} starter question${written === 1 ? '' : 's'}.`, 'success');
    }
    onClose();
  };

  if (!isOpen || !course) return null;

  const done = progress?.isComplete;

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Generate starter questions"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-modal p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-lg w-full max-w-2xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <Wand2 className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Starter Questions
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  {course.name} — one question for each empty syllabus point.
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              disabled={isRunning}
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-5 overflow-y-auto flex-grow">
          {!progress && (
            <>
              <div>
                <label
                  htmlFor="starter-scope"
                  className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2"
                >
                  Cover
                </label>
                <select
                  id="starter-scope"
                  value={topicId}
                  onChange={(e) => setTopicId(e.target.value)}
                  className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-xl py-2.5 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))]"
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

              <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 p-4 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50">
                {targets.length === 0 ? (
                  <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-600 flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 light:text-green-600" />
                    Every syllabus point here already has a question.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800 font-semibold">
                      {targets.length} syllabus point{targets.length === 1 ? '' : 's'} with no
                      question yet.
                    </p>
                    <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-1.5">
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
                    {done ? 'Finished' : progress.currentTask || 'Working…'}
                  </span>
                  <span className="text-[rgb(var(--color-text-muted))] light:text-slate-500">
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
                    className="h-full bg-gradient-to-r from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] transition-all"
                    style={{
                      width: `${((progress.completed + progress.failed) / Math.max(progress.total, 1)) * 100}%`,
                    }}
                  />
                </div>
                <p className="mt-2 text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  {progress.completed} written
                  {progress.failed > 0 ? `, ${progress.failed} failed` : ''}
                </p>
              </div>

              {progress.fatalError && (
                <div className="rounded-lg bg-red-900/20 light:bg-red-50 border border-red-500/25 light:border-red-200 p-3 flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 light:text-red-600 flex-shrink-0 mt-0.5" />
                  <div className="text-xs text-red-200 light:text-red-800">
                    <p className="font-semibold">{progress.fatalError.userMessage}</p>
                    <p className="mt-0.5">{progress.fatalError.suggestion}</p>
                  </div>
                </div>
              )}

              {progress.logs.length > 0 && (
                <div className="rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 p-3 max-h-48 overflow-y-auto">
                  <ul className="space-y-1 font-mono text-[11px] text-[rgb(var(--color-text-muted))] light:text-slate-600">
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
        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3 flex-shrink-0">
          {!progress && (
            <>
              <button
                type="button"
                onClick={handleClose}
                className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
              >
                Not now
              </button>
              <button
                type="button"
                onClick={handleStart}
                disabled={targets.length === 0}
                className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Sparkles className="w-4 h-4" />
                Write {targets.length} question{targets.length === 1 ? '' : 's'}
              </button>
            </>
          )}
          {progress && !done && (
            <button
              type="button"
              onClick={handleStop}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-500 transition"
            >
              Stop
            </button>
          )}
          {done && (
            <button
              type="button"
              onClick={handleFinish}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-green-600 to-green-500 hover:shadow-lg transition"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default StarterQuestionsModal;
