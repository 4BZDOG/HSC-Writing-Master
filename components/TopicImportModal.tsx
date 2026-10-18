import React, { useState, useMemo } from 'react';
import { Course, Topic, DataValidationResult } from '../types';
import {
  analyzeAndSanitizeImportData,
  generateValidationReport,
  previewTopicMergePlan,
  normalizeText,
} from '../utils/dataManagerUtils';
import { parseJsonWithRepair } from '../utils/jsonRepair';
import FileDropzone from './dataManager/FileDropzone';
import {
  X,
  Award,
  ChevronRight,
  Trash2,
  GitMerge,
  Sparkles,
  FolderTree,
  Layers,
  Hash,
  FileText,
  AlertTriangle,
  Wrench,
  Loader2,
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
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
} from '../utils/creatorChrome';

interface TopicImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (topic: Topic) => void;
  courseName: string;
  /**
   * Topics already in the destination course. Used only to preview whether
   * the import will merge into one of them or create a new topic — the
   * actual merge decision is made later, by the same id-then-name rule, when
   * `onImport` is applied. Optional so existing callers that haven't wired it
   * through yet still render (preview just reports "no match" and offers to
   * create a new topic).
   */
  existingTopics?: Topic[];
}

/** "1 new sub-topic" / "3 new sub-topics" */
const pluralize = (n: number, noun: string) => `${n} ${noun}${n === 1 ? '' : 's'}`;

const describeMergePlan = (
  importedTopicName: string,
  plan: ReturnType<typeof previewTopicMergePlan>
): string => {
  if (!plan.matchedTopic) {
    return `Will create a new topic "${importedTopicName}".`;
  }

  const parts: string[] = [];
  if (plan.newSubTopics > 0 || plan.matchedSubTopics === 0) {
    parts.push(pluralize(plan.newSubTopics, 'new sub-topic'));
  }
  if (plan.matchedSubTopics > 0) {
    parts.push(
      `${pluralize(plan.matchedSubTopics, 'sub-topic')} matched (${pluralize(plan.newDotPoints, 'new dot point')} inside)`
    );
  }
  if (plan.matchedPrompts > 0) {
    parts.push(`${pluralize(plan.matchedPrompts, 'question')} matched and updated`);
  }
  if (plan.newPrompts > 0) {
    parts.push(`${pluralize(plan.newPrompts, 'new question')} added`);
  }

  return `Will merge into "${plan.matchedTopic.name}" — ${parts.join(', ')}.`;
};

const TopicImportModal: React.FC<TopicImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  courseName,
  existingTopics = [],
}) => {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [importedTopic, setImportedTopic] = useState<Topic | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [validationReport, setValidationReport] = useState<DataValidationResult | null>(null);
  const [jsonRepaired, setJsonRepaired] = useState(false);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [expandedSubTopics, setExpandedSubTopics] = useState<Set<number>>(new Set());

  // Merge target overrides — let the user redirect the import into an
  // existing topic (and, within it, existing sub-topics) when the file's own
  // names don't happen to match the destination exactly. 'auto' keeps the
  // default id-then-name matching; anything else is an existing topic id.
  const [topicTargetId, setTopicTargetId] = useState<string>('auto');
  const [subTopicTargets, setSubTopicTargets] = useState<Record<number, string>>({});

  // Bulk Settings
  const [markAsPastHSC, setMarkAsPastHSC] = useState(false);
  const [bulkYear, setBulkYear] = useState('');

  const resetState = () => {
    setStep('upload');
    setImportedTopic(null);
    setError(null);
    setFileName(null);
    setValidationReport(null);
    setJsonRepaired(false);
    setIsAnalysing(false);
    setExpandedSubTopics(new Set());
    setTopicTargetId('auto');
    setSubTopicTargets({});
    setMarkAsPastHSC(false);
    setBulkYear('');
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  // Escape closes this modal like every other modal surface — through the
  // same reset path as the X/Cancel buttons.
  useEscapeKey(isOpen, handleClose);
  useScrollLock(isOpen);

  // The parse → sanitise → validate chain is synchronous and can block the
  // main thread for a large file. Setting `isAnalysing` before the async file
  // read lets the spinner paint, and deferring the heavy work a tick (below)
  // hands the browser a frame to draw it before the thread is tied up.
  const processFileText = (text: string) => {
    try {
      const parsed = parseJsonWithRepair(text);

      if (parsed.data === null) {
        setError(parsed.error || 'This file is not valid JSON. Choose a topic file and try again.');
        setFileName(null);
        return;
      }

      const analysis = analyzeAndSanitizeImportData(parsed.data);

      let validatedTopic: Topic | null = null;
      if (analysis.type === 'topic' && !analysis.error) {
        validatedTopic = analysis.data as Topic;
      } else if (analysis.type === 'courses' && !analysis.error) {
        const asCourses = analysis.data as Course[];
        if (asCourses.length === 1 && asCourses[0].topics.length === 1) {
          validatedTopic = asCourses[0].topics[0];
        }
      }

      if (!validatedTopic) {
        setError(
          analysis.error ||
            'This file does not contain exactly one topic. Choose a file with one topic in it.'
        );
        setFileName(null);
        return;
      }
      const tempCourseWrapper = {
        id: 'temp-course',
        name: 'Import Preview',
        outcomes: [],
        topics: [validatedTopic],
      };
      const report = generateValidationReport([tempCourseWrapper]);

      if (!report.isValid) {
        setError(
          `The file has structural errors: ${report.errors.join(', ')}. Fix them in the file, then choose it again.`
        );
        setFileName(null);
        return;
      }

      setImportedTopic(validatedTopic);
      setValidationReport(report);
      setJsonRepaired(parsed.repaired);
      setExpandedSubTopics(new Set(validatedTopic.subTopics.map((_, i) => i)));
      setStep('preview');
    } finally {
      setIsAnalysing(false);
    }
  };

  const handleFileDrop = (file: File) => {
    setError(null);
    setFileName(file.name);
    setIsAnalysing(true);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      // Yield a frame so the "Analysing…" spinner is painted before the
      // synchronous parse/validate chain seizes the main thread.
      setTimeout(() => processFileText(text), 0);
    };
    reader.onerror = () => {
      setIsAnalysing(false);
      setError('Could not read the file. It may be locked or corrupted — try re-exporting it.');
      setFileName(null);
    };
    reader.readAsText(file);
  };

  // --- Editable preview: prune anything the external tool got wrong before
  // it lands in the course, matching the review UX TopicSyllabusImportModal
  // already offers for AI-parsed imports. ---
  const toggleSubTopicExpanded = (idx: number) => {
    setExpandedSubTopics((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const removeSubTopic = (idx: number) => {
    setImportedTopic((prev) =>
      prev ? { ...prev, subTopics: prev.subTopics.filter((_, i) => i !== idx) } : prev
    );
    // subTopicTargets and expandedSubTopics are keyed by array index, so removing
    // a sub-topic shifts every later index down one. Re-key both — drop the
    // removed entry and slide higher indices down — or a merge-target override
    // silently lands on the wrong sub-topic and the wrong rows read as expanded.
    setSubTopicTargets((prev) => {
      const next: Record<number, string> = {};
      for (const [k, v] of Object.entries(prev)) {
        const i = Number(k);
        if (i === idx) continue;
        next[i > idx ? i - 1 : i] = v;
      }
      return next;
    });
    setExpandedSubTopics((prev) => {
      const next = new Set<number>();
      prev.forEach((i) => {
        if (i === idx) return;
        next.add(i > idx ? i - 1 : i);
      });
      return next;
    });
  };

  const removeDotPoint = (stIdx: number, dpIdx: number) =>
    setImportedTopic((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        subTopics: prev.subTopics.map((st, i) =>
          i === stIdx ? { ...st, dotPoints: st.dotPoints.filter((_, j) => j !== dpIdx) } : st
        ),
      };
    });

  // The topic this import will land in: whichever existing topic the user
  // manually picked, or — left on 'auto' — the same id-then-name match the
  // real merge (reconcileImportedTopicIds) uses. Sub-topic overrides below
  // are only meaningful relative to this topic's own sub-topics.
  const resolvedTargetTopic = useMemo(() => {
    if (!importedTopic) return null;
    if (topicTargetId !== 'auto') {
      return existingTopics.find((t) => t.id === topicTargetId) ?? null;
    }
    return (
      existingTopics.find((t) => t.id === importedTopic.id) ??
      existingTopics.find((t) => normalizeText(t.name) === normalizeText(importedTopic.name)) ??
      null
    );
  }, [importedTopic, topicTargetId, existingTopics]);

  // The topic actually handed to onImport / the merge plan: the edited
  // preview with any manual topic/sub-topic target overrides applied. An
  // override rewrites the id and name to the chosen existing node's, so the
  // id-then-name matching downstream (previewTopicMergePlan here,
  // reconcileImportedTopicIds on confirm) resolves to it deterministically —
  // no dependence on the file's own naming matching the destination.
  const effectiveTopic = useMemo(() => {
    if (!importedTopic) return null;
    const subTopics = importedTopic.subTopics.map((st, idx) => {
      const overrideId = subTopicTargets[idx];
      const target = overrideId
        ? resolvedTargetTopic?.subTopics.find((s) => s.id === overrideId)
        : undefined;
      return target ? { ...st, id: target.id, name: target.name } : st;
    });
    let topic: Topic = { ...importedTopic, subTopics };
    if (topicTargetId !== 'auto' && resolvedTargetTopic) {
      topic = { ...topic, id: resolvedTargetTopic.id, name: resolvedTargetTopic.name };
    }
    return topic;
  }, [importedTopic, topicTargetId, subTopicTargets, resolvedTargetTopic]);

  const mergePlan = useMemo(
    () => (effectiveTopic ? previewTopicMergePlan(existingTopics, effectiveTopic) : null),
    [effectiveTopic, existingTopics]
  );

  const handleTopicTargetChange = (value: string) => {
    setTopicTargetId(value);
    // Sub-topic overrides reference ids under the PREVIOUS target topic —
    // meaningless (and potentially wrong) once the target topic changes.
    setSubTopicTargets({});
  };

  const setSubTopicTarget = (idx: number, value: string) => {
    setSubTopicTargets((prev) => {
      if (!value) {
        const { [idx]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [idx]: value };
    });
  };

  const treeStats = useMemo(() => {
    if (!importedTopic) return { subTopics: 0, dotPoints: 0, prompts: 0 };
    let dotPoints = 0;
    let prompts = 0;
    importedTopic.subTopics.forEach((st) => {
      dotPoints += st.dotPoints.length;
      st.dotPoints.forEach((dp) => (prompts += dp.prompts.length));
    });
    return { subTopics: importedTopic.subTopics.length, dotPoints, prompts };
  }, [importedTopic]);

  const handleConfirmImport = () => {
    if (effectiveTopic) {
      let finalTopic = effectiveTopic;

      if (markAsPastHSC) {
        const year = bulkYear ? parseInt(bulkYear) : undefined;
        finalTopic = {
          ...finalTopic,
          subTopics: finalTopic.subTopics.map((st) => ({
            ...st,
            dotPoints: st.dotPoints.map((dp) => ({
              ...dp,
              prompts: dp.prompts.map((p) => ({
                ...p,
                isPastHSC: true,
                hscYear: year || p.hscYear,
              })),
            })),
          })),
        };
      }

      onImport(finalTopic);
      handleClose();
    }
  };
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  return (
    <div className={CREATOR_BACKDROP} onClick={handleClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-import-title"
        className={`${CREATOR_SHELL} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <FolderTree className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>Into "{courseName}"</p>
            <h2 id="topic-import-title" className={CREATOR_TITLE}>
              Import a topic
            </h2>
          </div>
          <button type="button" onClick={handleClose} aria-label="Close" className={CREATOR_CLOSE}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className={`${CREATOR_BODY} space-y-4`}>
          {step === 'upload' && (
            <>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                Choose one topic JSON file to add to this course.
              </p>
              <FileDropzone onFileDrop={handleFileDrop} />
              {isAnalysing ? (
                <p
                  role="status"
                  className="flex items-center justify-center gap-2 text-sm text-muted mt-2"
                >
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analysing {fileName ?? 'file'}…
                </p>
              ) : (
                fileName && (
                  <p className="text-center text-sm text-muted mt-2">Selected file: {fileName}</p>
                )
              )}
              {error && (
                <p className="text-center text-sm text-red-400 light:text-red-700 mt-2 bg-red-900/20 light:bg-red-50 p-3 rounded-lg border border-red-500/20 light:border-red-200">
                  {error}
                </p>
              )}
            </>
          )}

          {step === 'preview' && importedTopic && mergePlan && (
            <>
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                Review the contents of{' '}
                <span className="font-semibold text-[rgb(var(--color-text-primary))]">
                  "{fileName}"
                </span>{' '}
                before importing.
              </p>

              {/* Merge-vs-create summary — what this import will actually do */}
              <div
                className={`rounded-xl border p-4 ${
                  mergePlan.matchedTopic
                    ? 'border-[rgb(var(--color-accent))]/30 bg-[rgb(var(--color-accent))]/5'
                    : 'border-emerald-500/30 light:border-emerald-200 bg-emerald-500/5 light:bg-emerald-50/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  {mergePlan.matchedTopic ? (
                    <div className="w-8 h-8 rounded-lg bg-[rgb(var(--color-accent))]/10 flex items-center justify-center flex-shrink-0">
                      <GitMerge className="w-4 h-4 text-[rgb(var(--color-accent))]" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="w-4 h-4 text-emerald-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[rgb(var(--color-text-primary))] leading-relaxed">
                      {describeMergePlan(importedTopic.name, mergePlan)}
                    </p>
                    {mergePlan.matchedTopic &&
                      (mergePlan.newPrompts > 0 ||
                        mergePlan.newDotPoints > 0 ||
                        mergePlan.newSubTopics > 0) && (
                        <p className="text-xs text-muted mt-1">
                          {mergePlan.matchedPrompts > 0
                            ? 'New items are added; questions that match an existing one are updated in place.'
                            : 'Existing content is preserved; only new items are added.'}
                        </p>
                      )}
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 pt-3 border-t border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Layers className="w-3 h-3" />
                    <span className="font-bold text-[rgb(var(--color-text-primary))]">
                      {treeStats.subTopics}
                    </span>{' '}
                    sub-topics
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <Hash className="w-3 h-3" />
                    <span className="font-bold text-[rgb(var(--color-text-primary))]">
                      {treeStats.dotPoints}
                    </span>{' '}
                    dot points
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted">
                    <FileText className="w-3 h-3" />
                    <span className="font-bold text-[rgb(var(--color-text-primary))]">
                      {treeStats.prompts}
                    </span>{' '}
                    questions
                  </div>
                </div>
              </div>

              {existingTopics.length > 0 && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))]/30 px-4 py-3">
                  <label
                    htmlFor="topic-merge-target"
                    className="text-xs font-semibold text-[rgb(var(--color-text-secondary))] flex-shrink-0"
                  >
                    Merge into
                  </label>
                  <select
                    id="topic-merge-target"
                    value={topicTargetId}
                    onChange={(e) => handleTopicTargetChange(e.target.value)}
                    className="flex-1 min-w-0 min-h-11 sm:min-h-0 bg-white dark:bg-[rgb(var(--color-bg-surface-light))] border border-slate-300 dark:border-white/15 rounded-lg px-3 py-1.5 text-sm text-[rgb(var(--color-text-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                  >
                    <option value="auto">Auto-detect by name (default)</option>
                    {existingTopics.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {jsonRepaired && (
                <div className="rounded-xl border border-sky-500/30 light:border-sky-200 bg-sky-500/5 light:bg-sky-50/50 p-3 flex items-start gap-2">
                  <Wrench className="w-3.5 h-3.5 text-sky-400 light:text-sky-700 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-sky-300 light:text-sky-700 leading-relaxed">
                    The JSON had formatting issues (missing commas, unquoted keys and similar) that
                    were repaired automatically. Review the preview below to make sure everything
                    looks right.
                  </p>
                </div>
              )}

              {validationReport && validationReport.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 light:border-amber-200 bg-amber-500/5 light:bg-amber-50/50 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 light:text-amber-700 flex-shrink-0" />
                    <span className="text-xs font-semibold text-amber-400 light:text-amber-700">
                      {validationReport.warnings.length} validation{' '}
                      {validationReport.warnings.length === 1 ? 'warning' : 'warnings'}
                    </span>
                  </div>
                  <ul className="space-y-0.5 ml-5.5">
                    {validationReport.warnings.map((w, i) => (
                      <li
                        key={i}
                        className="text-xs text-amber-300/80 light:text-amber-700 leading-relaxed"
                      >
                        {w}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Bulk Settings */}
              <div
                className={`rounded-xl border transition-colors ${
                  markAsPastHSC
                    ? 'border-amber-500/30 light:border-amber-200 bg-amber-500/5 light:bg-amber-50/50'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))]/30'
                }`}
              >
                <label className="flex items-center justify-between cursor-pointer p-4 min-h-11">
                  <div className="flex items-center gap-2.5 text-sm font-semibold text-[rgb(var(--color-text-primary))]">
                    <Award className="w-4 h-4 text-amber-400 light:text-amber-700" />
                    <span>Mark as past HSC questions</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={markAsPastHSC}
                    onChange={(e) => setMarkAsPastHSC(e.target.checked)}
                    className="w-4 h-4 rounded-lg bg-gray-700 light:bg-white border-gray-600 light:border-slate-300 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]/50"
                  />
                </label>
                {markAsPastHSC && (
                  <div className="px-4 pb-4 pt-0 flex items-center gap-3 animate-fade-in">
                    <div className="ml-7 pl-3 border-l-2 border-amber-500/30 light:border-amber-200 flex items-center gap-2">
                      <label htmlFor="topic-bulk-year" className="text-xs font-medium text-muted">
                        Year
                      </label>
                      <input
                        id="topic-bulk-year"
                        type="number"
                        value={bulkYear}
                        onChange={(e) => setBulkYear(e.target.value)}
                        placeholder="e.g. 2023"
                        className="w-24 min-h-11 sm:min-h-0 bg-white dark:bg-[rgb(var(--color-bg-surface-light))] border border-slate-300 dark:border-white/15 rounded-lg px-3 py-1.5 text-sm text-[rgb(var(--color-text-primary))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Editable structure preview — remove anything the source file
                  got wrong before it lands in the course. */}
              <div className="flex flex-col overflow-hidden bg-slate-50/50 dark:bg-[rgb(var(--color-bg-surface-inset))]/30 border border-slate-200 dark:border-white/10 rounded-xl">
                <div className="px-4 py-2.5 bg-slate-100 dark:bg-[rgb(var(--color-bg-surface-elevated))] border-b border-slate-200 dark:border-white/10 flex flex-wrap justify-between items-center gap-x-3 gap-y-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderTree className="w-3.5 h-3.5 text-[rgb(var(--color-text-muted))] flex-shrink-0" />
                    <span className="text-xs font-bold text-[rgb(var(--color-text-primary))] truncate">
                      {importedTopic.name}
                    </span>
                  </div>
                  <span className="text-xs text-muted flex-shrink-0">
                    Remove anything you do not want to import
                  </span>
                </div>
                {importedTopic.subTopics.length === 0 ? (
                  <div className="p-8 text-center text-sm text-muted">
                    Nothing left to import. Go back and choose a different file, or cancel.
                  </div>
                ) : (
                  <div className="p-2 max-h-[45vh] sm:max-h-[50vh] overflow-y-auto custom-scrollbar">
                    {importedTopic.subTopics.map((st, stIdx) => {
                      const isExpanded = expandedSubTopics.has(stIdx);
                      return (
                        <div key={st.id ?? stIdx} className="mb-0.5 last:mb-0">
                          <div className="group flex items-center gap-1 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-100 transition">
                            <button
                              onClick={() => toggleSubTopicExpanded(stIdx)}
                              className="flex-1 flex items-center gap-2 p-2 min-h-11 sm:min-h-0 text-left min-w-0"
                            >
                              <ChevronRight
                                className={`w-3.5 h-3.5 text-[rgb(var(--color-text-muted))] transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                              />
                              <Layers className="w-3.5 h-3.5 text-purple-400 light:text-purple-700 flex-shrink-0" />
                              <span className="font-semibold text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800 truncate">
                                {st.name}
                              </span>
                              <span className="ml-auto flex-shrink-0 text-xs font-medium text-muted bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 px-2 py-0.5 rounded-full">
                                {st.dotPoints.length} dp
                                {st.dotPoints.reduce((s, dp) => s + dp.prompts.length, 0) > 0 && (
                                  <>
                                    {' '}
                                    · {st.dotPoints.reduce((s, dp) => s + dp.prompts.length, 0)} q
                                  </>
                                )}
                              </span>
                            </button>
                            <button
                              onClick={() => removeSubTopic(stIdx)}
                              className="p-1.5 mr-1 min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg opacity-100 sm:opacity-0 sm:group-hover:opacity-100 text-red-400 light:text-red-700 hover:bg-red-500/20 light:hover:bg-red-50 transition-all flex-shrink-0"
                              title="Remove this sub-topic from import"
                              aria-label={`Remove sub-topic ${st.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {resolvedTargetTopic && resolvedTargetTopic.subTopics.length > 0 && (
                            <div className="ml-8 mr-1 mb-1 flex items-center gap-2">
                              <span className="text-xs text-muted flex-shrink-0">Merge into</span>
                              <select
                                aria-label={`Merge sub-topic "${st.name}" into`}
                                value={subTopicTargets[stIdx] ?? ''}
                                onChange={(e) => setSubTopicTarget(stIdx, e.target.value)}
                                className="flex-1 min-w-0 min-h-11 sm:min-h-0 bg-white dark:bg-[rgb(var(--color-bg-surface-light))] border border-slate-300 dark:border-white/15 rounded-lg px-2 py-1 text-xs text-[rgb(var(--color-text-primary))] focus:outline-none focus:ring-1 focus:ring-[rgb(var(--color-accent))]"
                              >
                                <option value="">New sub-topic (auto)</option>
                                {resolvedTargetTopic.subTopics.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                          {isExpanded && st.dotPoints.length > 0 && (
                            <div className="ml-8 pl-3 border-l-2 border-slate-200 dark:border-white/10 mt-0.5 space-y-px">
                              {st.dotPoints.map((dp, dpIdx) => (
                                <div
                                  key={dp.id ?? dpIdx}
                                  className="group/dp flex items-start gap-2 px-2 py-1.5 text-xs text-[rgb(var(--color-text-dim))] light:text-slate-600 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))]/40 light:hover:bg-slate-100 transition-colors"
                                >
                                  <Hash className="w-3 h-3 mt-0.5 text-[rgb(var(--color-text-muted))] flex-shrink-0" />
                                  <span className="flex-1 leading-relaxed">
                                    {dp.description}
                                    {dp.prompts.length > 0 && (
                                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs font-medium text-[rgb(var(--color-text-muted))]">
                                        <FileText className="w-2.5 h-2.5" />
                                        {dp.prompts.length}
                                      </span>
                                    )}
                                  </span>
                                  <button
                                    onClick={() => removeDotPoint(stIdx, dpIdx)}
                                    className="p-0.5 rounded-lg opacity-100 sm:opacity-0 sm:group-hover/dp:opacity-100 text-red-400 light:text-red-700 hover:bg-red-500/20 light:hover:bg-red-50 transition-all flex-shrink-0"
                                    title="Remove this dot point from import"
                                    aria-label={`Remove dot point ${dp.description}`}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className={CREATOR_FOOTER}>
          {step === 'preview' ? (
            <>
              <button type="button" onClick={resetState} className={CREATOR_SECONDARY_BUTTON}>
                Back
              </button>
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={!importedTopic || importedTopic.subTopics.length === 0}
                className={CREATOR_PRIMARY_BUTTON}
              >
                {mergePlan?.matchedTopic ? (
                  <GitMerge className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                )}
                {mergePlan?.matchedTopic
                  ? `Merge into "${mergePlan.matchedTopic.name}"`
                  : 'Import topic'}
              </button>
            </>
          ) : (
            <button type="button" onClick={handleClose} className={CREATOR_SECONDARY_BUTTON}>
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopicImportModal;
