import React, { useState, useMemo } from 'react';
import { Course, Topic, DataValidationResult } from '../types';
import {
  analyzeAndSanitizeImportData,
  generateValidationReport,
  previewTopicMergePlan,
} from '../utils/dataManagerUtils';
import { parseJsonWithRepair } from '../utils/jsonRepair';
import FileDropzone from './dataManager/FileDropzone';
import {
  UploadCloud,
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
} from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';

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
  const [expandedSubTopics, setExpandedSubTopics] = useState<Set<number>>(new Set());

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
    setExpandedSubTopics(new Set());
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

  const handleFileDrop = (file: File) => {
    setError(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const parsed = parseJsonWithRepair(text);

      if (parsed.data === null) {
        setError(parsed.error || 'Failed to parse JSON file.');
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
        setError(analysis.error || 'The imported file is not a valid single topic object.');
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
        setError(`The file has structural errors: ${report.errors.join(', ')}`);
        setFileName(null);
        return;
      }

      setImportedTopic(validatedTopic);
      setValidationReport(report);
      setJsonRepaired(parsed.repaired);
      setExpandedSubTopics(new Set(validatedTopic.subTopics.map((_, i) => i)));
      setStep('preview');
    };
    reader.onerror = () => setError('Error reading file.');
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

  const removeSubTopic = (idx: number) =>
    setImportedTopic((prev) =>
      prev ? { ...prev, subTopics: prev.subTopics.filter((_, i) => i !== idx) } : prev
    );

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

  const mergePlan = useMemo(
    () => (importedTopic ? previewTopicMergePlan(existingTopics, importedTopic) : null),
    [importedTopic, existingTopics]
  );

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
    if (importedTopic) {
      let finalTopic = importedTopic;

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
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Import a topic file"
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={handleClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-primary))] to-[rgb(var(--color-accent))] flex items-center justify-center shadow-lg">
                <UploadCloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Import Topic
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  into "{courseName}"
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        <div className="flex-grow p-6 flex flex-col overflow-hidden bg-[rgb(var(--color-bg-surface))] light:bg-white">
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                Select a single topic JSON file to add to the current course.
              </p>
              <FileDropzone onFileDrop={handleFileDrop} />
              {fileName && (
                <p className="text-center text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-2">
                  Selected file: {fileName}
                </p>
              )}
              {error && (
                <p className="text-center text-sm text-red-400 light:text-red-600 mt-2 bg-red-900/20 light:bg-red-50 p-3 rounded-lg border border-red-500/20 light:border-red-200">
                  {error}
                </p>
              )}
            </div>
          )}

          {step === 'preview' && importedTopic && mergePlan && (
            <div className="space-y-4 h-full flex flex-col overflow-hidden">
              <p className="text-sm text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                Review the contents of{' '}
                <span className="font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
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
                    <p className="text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-relaxed">
                      {describeMergePlan(importedTopic.name, mergePlan)}
                    </p>
                    {mergePlan.matchedTopic &&
                      (mergePlan.newPrompts > 0 ||
                        mergePlan.newDotPoints > 0 ||
                        mergePlan.newSubTopics > 0) && (
                        <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 mt-1">
                          Existing content is preserved; only new items are added.
                        </p>
                      )}
                  </div>
                </div>

                {/* Stats row */}
                <div className="flex gap-4 mt-3 pt-3 border-t border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200/60">
                  <div className="flex items-center gap-1.5 text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    <Layers className="w-3 h-3" />
                    <span className="font-bold text-[rgb(var(--color-text-primary))] light:text-slate-700">
                      {treeStats.subTopics}
                    </span>{' '}
                    sub-topics
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    <Hash className="w-3 h-3" />
                    <span className="font-bold text-[rgb(var(--color-text-primary))] light:text-slate-700">
                      {treeStats.dotPoints}
                    </span>{' '}
                    dot points
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    <FileText className="w-3 h-3" />
                    <span className="font-bold text-[rgb(var(--color-text-primary))] light:text-slate-700">
                      {treeStats.prompts}
                    </span>{' '}
                    questions
                  </div>
                </div>
              </div>

              {jsonRepaired && (
                <div className="rounded-xl border border-sky-500/30 light:border-sky-200 bg-sky-500/5 light:bg-sky-50/50 p-3 flex items-start gap-2">
                  <Wrench className="w-3.5 h-3.5 text-sky-400 light:text-sky-500 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-sky-300 light:text-sky-700 leading-relaxed">
                    The JSON had formatting issues (missing commas, unquoted keys, etc.) that were
                    automatically repaired. Review the preview below to make sure everything looks
                    right.
                  </p>
                </div>
              )}

              {validationReport && validationReport.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 light:border-amber-200 bg-amber-500/5 light:bg-amber-50/50 p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400 light:text-amber-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-amber-400 light:text-amber-600">
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
                    : 'border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50'
                }`}
              >
                <label className="flex items-center justify-between cursor-pointer p-4">
                  <div className="flex items-center gap-2.5 text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800">
                    <Award className="w-4 h-4 text-amber-400 light:text-amber-500" />
                    <span>Mark as Past HSC Questions</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={markAsPastHSC}
                    onChange={(e) => setMarkAsPastHSC(e.target.checked)}
                    className="w-4 h-4 rounded bg-gray-700 light:bg-white border-gray-600 light:border-slate-300 text-[rgb(var(--color-accent))] focus:ring-[rgb(var(--color-accent))]/50"
                  />
                </label>
                {markAsPastHSC && (
                  <div className="px-4 pb-4 pt-0 flex items-center gap-3 animate-fade-in">
                    <div className="ml-7 pl-3 border-l-2 border-amber-500/30 light:border-amber-200 flex items-center gap-2">
                      <span className="text-xs font-medium text-[rgb(var(--color-text-muted))] light:text-slate-500">
                        Year:
                      </span>
                      <input
                        type="number"
                        value={bulkYear}
                        onChange={(e) => setBulkYear(e.target.value)}
                        placeholder="e.g. 2023"
                        className="w-24 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-lg px-3 py-1.5 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Editable structure preview — remove anything the source file
                  got wrong before it lands in the course. */}
              <div className="flex-grow overflow-hidden flex flex-col bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 rounded-xl">
                <div className="px-4 py-2.5 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-slate-100 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-between items-center flex-shrink-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <FolderTree className="w-3.5 h-3.5 text-[rgb(var(--color-text-muted))] light:text-slate-400 flex-shrink-0" />
                    <span className="text-xs font-bold text-[rgb(var(--color-text-primary))] light:text-slate-700 truncate">
                      {importedTopic.name}
                    </span>
                  </div>
                  <span className="text-[10px] text-[rgb(var(--color-text-muted))] light:text-slate-500 flex-shrink-0 ml-2">
                    Remove items you don't want to import
                  </span>
                </div>
                {importedTopic.subTopics.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    Nothing left to import. Go back and pick a different file, or cancel.
                  </div>
                ) : (
                  <div className="p-2 overflow-y-auto custom-scrollbar">
                    {importedTopic.subTopics.map((st, stIdx) => {
                      const isExpanded = expandedSubTopics.has(stIdx);
                      return (
                        <div key={st.id ?? stIdx} className="mb-0.5 last:mb-0">
                          <div className="group flex items-center gap-1 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-100 transition">
                            <button
                              onClick={() => toggleSubTopicExpanded(stIdx)}
                              className="flex-1 flex items-center gap-2 p-2 text-left min-w-0"
                            >
                              <ChevronRight
                                className={`w-3.5 h-3.5 text-[rgb(var(--color-text-muted))] light:text-slate-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                              />
                              <Layers className="w-3.5 h-3.5 text-purple-400 light:text-purple-500 flex-shrink-0" />
                              <span className="font-semibold text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800 truncate">
                                {st.name}
                              </span>
                              <span className="ml-auto flex-shrink-0 text-[10px] font-medium text-[rgb(var(--color-text-muted))] light:text-slate-500 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 px-2 py-0.5 rounded-full">
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
                              className="p-1.5 mr-1 rounded-md opacity-0 group-hover:opacity-100 text-red-400 light:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-all flex-shrink-0"
                              title="Remove this sub-topic from import"
                              aria-label={`Remove sub-topic ${st.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {isExpanded && st.dotPoints.length > 0 && (
                            <div className="ml-8 pl-3 border-l-2 border-[rgb(var(--color-border-secondary))]/20 light:border-slate-200 mt-0.5 space-y-px">
                              {st.dotPoints.map((dp, dpIdx) => (
                                <div
                                  key={dp.id ?? dpIdx}
                                  className="group/dp flex items-start gap-2 px-2 py-1.5 text-xs text-[rgb(var(--color-text-dim))] light:text-slate-600 rounded-md hover:bg-[rgb(var(--color-bg-surface-light))]/40 light:hover:bg-slate-100 transition-colors"
                                >
                                  <Hash className="w-3 h-3 mt-0.5 text-slate-600 light:text-slate-400 flex-shrink-0" />
                                  <span className="flex-1 leading-relaxed">
                                    {dp.description}
                                    {dp.prompts.length > 0 && (
                                      <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-medium text-[rgb(var(--color-text-muted))] light:text-slate-400">
                                        <FileText className="w-2.5 h-2.5" />
                                        {dp.prompts.length}
                                      </span>
                                    )}
                                  </span>
                                  <button
                                    onClick={() => removeDotPoint(stIdx, dpIdx)}
                                    className="p-0.5 rounded opacity-0 group-hover/dp:opacity-100 text-red-400 light:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-all flex-shrink-0"
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
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3 flex-shrink-0">
          {step === 'preview' ? (
            <>
              <button
                onClick={resetState}
                className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
              >
                Back
              </button>
              <button
                onClick={handleConfirmImport}
                disabled={!importedTopic || importedTopic.subTopics.length === 0}
                className="py-2.5 px-5 rounded-lg text-sm text-white font-semibold bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {mergePlan?.matchedTopic ? (
                  <GitMerge className="w-4 h-4" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {mergePlan?.matchedTopic
                  ? `Merge into "${mergePlan.matchedTopic.name}"`
                  : `Import "${importedTopic?.name}"`}
              </button>
            </>
          ) : (
            <button
              onClick={handleClose}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default TopicImportModal;
