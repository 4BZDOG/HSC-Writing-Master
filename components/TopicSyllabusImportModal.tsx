import React, { useState, useEffect, useMemo } from 'react';
import { parseSyllabusStructure, fetchSyllabusContentFromUrl } from '../services/geminiService';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import { X, Sparkles, Globe, UploadCloud, ChevronRight, Trash2, GitMerge } from 'lucide-react';
import UrlFetchField, { NESA_HOST_HINT } from './UrlFetchField';
import DiscardConfirmBar from './DiscardConfirmBar';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import type { SyllabusYear } from '../types';
import { yearShortLabel } from '../utils/syllabusYear';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';

/** One parsed sub-topic ready for preview/pruning before import. */
export interface TopicImportSubTopicNode {
  name: string;
  dotPoints: string[];
}

export interface TopicSyllabusImportPayload {
  /** Existing topic to add into, or null to create a new topic. */
  targetTopicId: string | null;
  /** Name for a new topic (typed or detected from the syllabus text). */
  topicName: string;
  subTopics: TopicImportSubTopicNode[];
}

interface TopicSyllabusImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  courseName: string;
  /**
   * The year the import will land in — the navigator's. Named on screen
   * because nothing else here says it: the topic list is already filtered to
   * this year, so an admin filling Year 11 sees an empty "add into" list and no
   * clue that it is empty because of where they are standing.
   */
  year: SyllabusYear;
  topics: { id: string; name: string }[];
  /** Preselects the destination when launched from an already-selected topic. */
  initialTopicId: string | null;
  onImport: (payload: TopicSyllabusImportPayload) => void;
}

const TopicSyllabusImportModal: React.FC<TopicSyllabusImportModalProps> = ({
  isOpen,
  onClose,
  courseName,
  year,
  topics,
  initialTopicId,
  onImport,
}) => {
  // '__new__' → create a new topic; otherwise add into this existing topic.
  const [targetTopicId, setTargetTopicId] = useState<string>('__new__');
  const [newTopicName, setNewTopicName] = useState('');
  const [detectedName, setDetectedName] = useState('');
  const [syllabusText, setSyllabusText] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);
  // Kept apart from the modal's main error, which renders at the bottom of a
  // scrolling body — a failure from the URL box at the top belongs beside it.
  const [urlError, setUrlError] = useState<string | null>(null);
  const [isAnalysing, setIsAnalysing] = useState(false);
  const [step, setStep] = useState<'input' | 'preview'>('input');
  const [previewSubTopics, setPreviewSubTopics] = useState<TopicImportSubTopicNode[]>([]);
  const [expandedIdx, setExpandedIdx] = useState<Set<number>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const isBusy = isFetchingUrl || isAnalysing;
  const targetTopic = topics.find((t) => t.id === targetTopicId);
  // The name the import will actually use: the chosen existing topic's, the
  // typed one, or the one the AI detected from the text.
  const effectiveTopicName = targetTopic?.name || newTopicName.trim() || detectedName;
  // Creating a "new" topic whose name matches an existing one merges instead.
  const nameCollision =
    !targetTopic &&
    topics.find((t) => t.name.trim().toLowerCase() === effectiveTopicName.trim().toLowerCase());

  // Each open starts from the launching context (selected topic or "new").
  useEffect(() => {
    if (isOpen) setTargetTopicId(initialTopicId ?? '__new__');
  }, [isOpen, initialTopicId]);

  const handleClose = () => {
    if (isBusy) return;
    setNewTopicName('');
    setDetectedName('');
    setSyllabusText('');
    setUrlInput('');
    setUrlError(null);
    setPreviewSubTopics([]);
    setStep('input');
    setError(null);
    setNotice(null);
    onClose();
  };

  // Pasted or fetched syllabus text, a parsed structure, or a typed topic
  // name — anything that would be gone for good if the modal closed.
  const hasWork =
    syllabusText.trim().length > 0 || previewSubTopics.length > 0 || newTopicName.trim().length > 0;

  const guard = useDiscardGuard(isOpen, hasWork, handleClose);

  // Escape asks before discarding, and never interrupts a running parse.
  useEscapeKey(isOpen && !isBusy, guard.requestClose);
  useScrollLock(isOpen);

  const handleFetchFromUrl = async (normalisedUrl: string) => {
    setIsFetchingUrl(true);
    setUrlError(null);
    try {
      const content = (await fetchSyllabusContentFromUrl(normalisedUrl)).trim();
      if (content.length < 80) {
        throw new Error(
          "Couldn't read any syllabus content from that URL — some pages block automated readers. Open the page yourself and paste the topic text instead."
        );
      }
      // Append rather than replace, so URL content can supplement pasted text.
      setSyllabusText((prev) => (prev.trim() ? `${prev.trim()}\n\n${content}` : content));
      setUrlInput('');
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Failed to read that page.');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  const handleAnalyse = async () => {
    if (!syllabusText.trim()) {
      setError('Paste syllabus content (or fetch it from a URL) first.');
      return;
    }
    setIsAnalysing(true);
    setError(null);
    setNotice(null);
    try {
      const typedName = targetTopic?.name || newTopicName.trim();
      const content = typedName ? `Topic Name: ${typedName}\n\n${syllabusText}` : syllabusText;
      const nodes = await parseSyllabusStructure(content);
      const subTopics = nodes.flatMap((n) => n.subTopics);
      if (subTopics.length === 0) {
        throw new Error(
          'No sub-topics could be extracted. Try cleaner text with clear headings and dot points.'
        );
      }
      if (!typedName) setDetectedName(nodes[0]?.name || 'Untitled Topic');
      if (nodes.length > 1) {
        setNotice(
          `${nodes.length} topics were detected in the text — they will be combined into one. ` +
            'To import them as separate topics, use Import Syllabus in the Course row instead.'
        );
      }
      setPreviewSubTopics(subTopics);
      setExpandedIdx(new Set(subTopics.map((_, i) => i)));
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyse syllabus structure.');
    } finally {
      setIsAnalysing(false);
    }
  };

  // --- Editable preview: prune AI mistakes before importing ---
  const removeSubTopic = (idx: number) =>
    setPreviewSubTopics((prev) => prev.filter((_, i) => i !== idx));

  const removeDotPoint = (stIdx: number, dpIdx: number) =>
    setPreviewSubTopics((prev) =>
      prev.map((st, i) =>
        i === stIdx ? { ...st, dotPoints: st.dotPoints.filter((_, j) => j !== dpIdx) } : st
      )
    );

  const toggleExpand = (idx: number) => {
    setExpandedIdx((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const stats = useMemo(
    () => ({
      subTopics: previewSubTopics.length,
      dotPoints: previewSubTopics.reduce((a, st) => a + st.dotPoints.length, 0),
    }),
    [previewSubTopics]
  );

  const handleConfirmImport = () => {
    if (previewSubTopics.length === 0 || !effectiveTopicName.trim()) return;
    onImport({
      targetTopicId: targetTopic?.id ?? null,
      topicName: effectiveTopicName.trim(),
      subTopics: previewSubTopics,
    });
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
      onClick={guard.requestCloseFromBackdrop}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 clip-stable animate-fade-in-up overflow-hidden relative flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div
            className="absolute inset-0 opacity-[0.08] light:opacity-[0.04] pointer-events-none mix-blend-overlay"
            style={{
              backgroundImage: `url("data:image/svg+xml,%3Csvg width='20' height='20' viewBox='0 0 20 20' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 0v20M0 1h20' stroke='%23ffffff' stroke-width='2' fill='none' opacity='0.2'/%3E%3C/svg%3E")`,
            }}
          />
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[rgb(var(--color-accent))] to-[rgb(var(--color-primary))] flex items-center justify-center shadow-lg">
                <UploadCloud className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Add Topic from Syllabus
                </h2>
                <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  {step === 'input'
                    ? `Paste NESA syllabus text or fetch from a URL — into ${yearShortLabel(year)} of "${courseName}".`
                    : `Review the extracted structure before importing into ${yearShortLabel(year)}.`}
                </p>
              </div>
            </div>
            <button
              onClick={guard.requestClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all duration-200 flex items-center justify-center group"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 group-hover:text-[rgb(var(--color-text-primary))] light:group-hover:text-slate-900 transition-colors" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col overflow-y-auto">
          {step === 'input' && (
            <div className="p-6 space-y-5 animate-fade-in">
              {/* Destination Section */}
              <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200">
                  <span className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    Destination
                  </span>
                </div>
                <div
                  className={`p-4 grid grid-cols-1 ${!targetTopic ? 'md:grid-cols-2' : ''} gap-4`}
                >
                  <div>
                    <label
                      htmlFor="topic-import-target"
                      className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2"
                    >
                      Import Into
                    </label>
                    <select
                      id="topic-import-target"
                      value={targetTopicId}
                      onChange={(e) => setTargetTopicId(e.target.value)}
                      className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-xl py-2.5 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                    >
                      <option value="__new__">➕ New topic…</option>
                      {topics.length > 0 && (
                        <optgroup label="Add into existing topic">
                          {topics.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                            </option>
                          ))}
                        </optgroup>
                      )}
                    </select>
                  </div>
                  {!targetTopic && (
                    <div>
                      <label
                        htmlFor="topic-import-name"
                        className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2"
                      >
                        Topic Name
                      </label>
                      <input
                        id="topic-import-name"
                        type="text"
                        value={newTopicName}
                        onChange={(e) => setNewTopicName(e.target.value)}
                        placeholder="Leave blank to detect from the text"
                        className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-xl py-2.5 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* URL Fetch Section */}
              <div className="rounded-xl border border-[rgb(var(--color-border-secondary))] light:border-slate-200 overflow-hidden">
                <div className="px-4 py-2.5 bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-50 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-[rgb(var(--color-accent))]" />
                  <span className="text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    Fetch from URL
                  </span>
                  <span className="text-[10px] font-medium text-[rgb(var(--color-text-muted))] light:text-slate-500 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 px-1.5 py-0.5 rounded-full">
                    experimental
                  </span>
                </div>
                <div className="p-4 space-y-2">
                  <UrlFetchField
                    value={urlInput}
                    onChange={setUrlInput}
                    onFetch={handleFetchFromUrl}
                    onInvalid={setUrlError}
                    error={urlError}
                    isFetching={isFetchingUrl}
                    disabled={isBusy}
                    label="Syllabus page URL"
                    placeholder="https://educationstandards.nsw.edu.au/..."
                  />
                  <p className="text-[10px] text-[rgb(var(--color-text-muted))]/80 light:text-slate-400">
                    {NESA_HOST_HINT}
                  </p>
                </div>
              </div>

              {/* Syllabus Content Textarea */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="topic-syllabus-text"
                    className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800"
                  >
                    Syllabus Content
                  </label>
                  {syllabusText.trim() && (
                    <span className="text-[10px] font-medium text-[rgb(var(--color-text-muted))] light:text-slate-500">
                      {syllabusText.trim().split('\n').length} lines
                    </span>
                  )}
                </div>
                <textarea
                  id="topic-syllabus-text"
                  value={syllabusText}
                  onChange={(e) => setSyllabusText(e.target.value)}
                  rows={10}
                  placeholder={`Paste the topic's sub-topics and dot points here...\n\ne.g.:\nInquiry Question 1: How do we describe motion?\n• describes uniform straight-line motion...\n• analyses the relative motion of objects...\n\nInquiry Question 2: How is motion measured?\n• measures displacement, velocity and acceleration...`}
                  className="w-full bg-[rgb(var(--color-bg-surface-inset))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-xl p-4 text-sm font-mono text-[rgb(var(--color-text-primary))] light:text-slate-900 placeholder:text-[rgb(var(--color-text-muted))]/60 light:placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))] resize-y leading-relaxed min-h-[180px]"
                />
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="p-6 animate-fade-in">
              {!targetTopic && (
                <div className="mb-5">
                  <label
                    htmlFor="topic-confirm-name"
                    className="block text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-800 mb-2"
                  >
                    Topic Name
                  </label>
                  <input
                    id="topic-confirm-name"
                    type="text"
                    value={newTopicName || detectedName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    className="w-full bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-[rgb(var(--color-border-secondary))] light:border-slate-300 rounded-xl py-2.5 px-4 text-sm font-semibold text-[rgb(var(--color-text-primary))] light:text-slate-900 focus:outline-none focus:ring-2 focus:ring-[rgb(var(--color-accent))] focus:border-[rgb(var(--color-accent))]"
                  />
                  {nameCollision && (
                    <p className="mt-2 text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 flex items-center gap-1.5">
                      <GitMerge className="w-3.5 h-3.5 text-[rgb(var(--color-accent))]" />"
                      {nameCollision.name}" already exists — the content will be merged into it.
                    </p>
                  )}
                </div>
              )}

              <div className="bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50/50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-slate-100 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-500 flex justify-between items-center">
                  <span>
                    {targetTopic ? `Add into "${targetTopic.name}"` : `New topic structure`}
                  </span>
                  <span className="bg-[rgb(var(--color-bg-surface-inset))] light:bg-white px-2 py-0.5 rounded-full normal-case font-semibold">
                    {stats.subTopics} sub-topics · {stats.dotPoints} dot points
                  </span>
                </div>
                {previewSubTopics.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                    Nothing left to import. Go back to adjust the content and re-analyse.
                  </div>
                ) : (
                  <div className="p-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
                    {previewSubTopics.map((st, stIdx) => {
                      const isExpanded = expandedIdx.has(stIdx);
                      return (
                        <div key={stIdx} className="mb-1 last:mb-0">
                          <div className="group flex items-center gap-1 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-100 transition">
                            <button
                              onClick={() => toggleExpand(stIdx)}
                              className="flex-1 flex items-center gap-2 p-2 text-left min-w-0"
                            >
                              <ChevronRight
                                className={`w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                              />
                              <span className="font-semibold text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800 truncate">
                                {st.name}
                              </span>
                              <span className="ml-auto flex-shrink-0 text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 bg-[rgb(var(--color-bg-surface-inset))] light:bg-slate-200 px-2 py-0.5 rounded-full">
                                {st.dotPoints.length} dot points
                              </span>
                            </button>
                            <button
                              onClick={() => removeSubTopic(stIdx)}
                              className="p-1.5 mr-1 rounded text-transparent group-hover:text-red-400 light:group-hover:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-colors flex-shrink-0"
                              title="Remove sub-topic"
                              aria-label={`Remove sub-topic ${st.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                          {isExpanded && st.dotPoints.length > 0 && (
                            <div className="ml-7 pl-2 border-l border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 mt-1 space-y-0.5">
                              {st.dotPoints.map((dp, dpIdx) => (
                                <div
                                  key={dpIdx}
                                  className="group/dp flex items-start gap-2 px-2 py-0.5 text-xs text-[rgb(var(--color-text-dim))] light:text-slate-600 rounded hover:bg-[rgb(var(--color-bg-surface-light))]/40 light:hover:bg-slate-100"
                                >
                                  <span className="mt-1.5 w-1 h-1 rounded-full bg-gray-600 light:bg-slate-400 flex-shrink-0"></span>
                                  <span className="flex-1">{dp}</span>
                                  <button
                                    onClick={() => removeDotPoint(stIdx, dpIdx)}
                                    className="p-0.5 rounded text-transparent group-hover/dp:text-red-400 light:group-hover/dp:text-red-500 hover:bg-red-500/20 light:hover:bg-red-50 transition-colors flex-shrink-0"
                                    title="Remove dot point"
                                    aria-label="Remove dot point"
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

              {notice && (
                <div className="mt-4 p-3 rounded-lg bg-blue-500/10 light:bg-blue-50 border border-blue-500/20 light:border-blue-200 text-xs text-blue-200 light:text-blue-700 flex items-start gap-2">
                  <Sparkles className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-400 light:text-blue-500" />
                  <p>{notice}</p>
                </div>
              )}
            </div>
          )}

          {error && (
            <p className="mx-6 mb-4 text-red-400 light:text-red-600 text-sm bg-red-900/30 light:bg-red-50 p-3 rounded-lg border border-red-500/20 light:border-red-200 animate-fade-in">
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        {guard.isConfirming ? (
          <DiscardConfirmBar
            summary={
              previewSubTopics.length > 0
                ? `this import — ${stats.subTopics} sub-topics, ${stats.dotPoints} dot points`
                : 'the syllabus content you have entered'
            }
            onKeep={guard.cancelDiscard}
            onDiscard={guard.confirmDiscard}
          />
        ) : (
          <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))] light:border-slate-200 flex justify-end gap-3 flex-shrink-0">
            {step === 'input' ? (
              <>
                <button
                  onClick={guard.requestClose}
                  className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAnalyse}
                  disabled={isBusy}
                  className="py-2.5 px-5 rounded-lg text-sm text-white font-semibold bg-gradient-to-r from-[rgb(var(--color-accent-dark))] to-[rgb(var(--color-accent))] hover:shadow-lg active:scale-[0.98] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  {isAnalysing ? 'Analysing...' : 'Analyse Syllabus'}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setStep('input')}
                  className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))] light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-100 transition"
                >
                  Back to Edit
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={previewSubTopics.length === 0 || !effectiveTopicName.trim()}
                  className="py-2.5 px-5 rounded-lg text-sm text-white font-semibold bg-gradient-to-r from-green-600 to-green-500 hover:shadow-lg active:scale-[0.98] transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {targetTopic || nameCollision ? (
                    <GitMerge className="w-4 h-4" />
                  ) : (
                    <UploadCloud className="w-4 h-4" />
                  )}
                  {targetTopic
                    ? `Add to ${targetTopic.name}`
                    : nameCollision
                      ? `Merge into ${nameCollision.name}`
                      : 'Create Topic'}
                </button>
              </>
            )}
          </div>
        )}

        <AiBusyOverlay show={isBusy}>
          <LoadingIndicator
            task="enrichment"
            message={
              isFetchingUrl ? 'Visiting URL & extracting content...' : 'Analysing syllabus...'
            }
          />
        </AiBusyOverlay>
      </div>
    </div>
  );
};

export default TopicSyllabusImportModal;
