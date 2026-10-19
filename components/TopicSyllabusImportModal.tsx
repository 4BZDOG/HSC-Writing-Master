import React, { useState, useEffect, useMemo } from 'react';
import { parseSyllabusStructure, fetchSyllabusPage } from '../services/geminiService';
import { hasNesaStatements, nesaPageToPreviewNode } from '../utils/nesaSyllabus';
import LoadingIndicator from './LoadingIndicator';
import AiBusyOverlay from './AiBusyOverlay';
import {
  X,
  Sparkles,
  Globe,
  UploadCloud,
  ChevronRight,
  Trash2,
  GitMerge,
  FolderTree,
} from 'lucide-react';
import UrlFetchField, { NESA_HOST_HINT, NESA_URL_PLACEHOLDER } from './UrlFetchField';
import DiscardConfirmBar from './DiscardConfirmBar';
import DraftRestoreBanner from './DraftRestoreBanner';
import { useDiscardGuard } from '../hooks/useDiscardGuard';
import { useImportDraft } from '../hooks/useImportDraft';
import type { SyllabusYear } from '../types';
import { yearShortLabel } from '../utils/syllabusYear';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { useFocusTrap } from '../hooks/useFocusTrap';
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
  // Set when NESA's focus area is from another year than this modal's. The year
  // is not changed; the warning says where the topic will actually land.
  const [yearWarning, setYearWarning] = useState<string | null>(null);

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
    setYearWarning(null);
    onClose();
  };

  // Pasted or fetched syllabus text, a parsed structure, or a typed topic
  // name — anything that would be gone for good if the modal closed.
  const hasWork =
    syllabusText.trim().length > 0 || previewSubTopics.length > 0 || newTopicName.trim().length > 0;

  const guard = useDiscardGuard(isOpen, hasWork, handleClose);

  // Kept across a reload, including the analysed structure — losing that costs
  // the AI call as well as the typing.
  const draft = useImportDraft(
    'topic-syllabus',
    isOpen,
    { newTopicName, syllabusText, previewSubTopics, detectedName, step },
    hasWork
  );

  const restoreDraft = () => {
    const saved = draft.offered?.value;
    if (!saved) return;
    setNewTopicName(saved.newTopicName);
    setSyllabusText(saved.syllabusText);
    setPreviewSubTopics(saved.previewSubTopics);
    setDetectedName(saved.detectedName);
    setStep(saved.step);
    setExpandedIdx(new Set(saved.previewSubTopics.map((_, i) => i)));
    draft.accept();
  };

  // Escape asks before discarding, and never interrupts a running parse.
  useEscapeKey(isOpen && !isBusy, guard.requestClose);
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);
  useScrollLock(isOpen);

  const handleFetchFromUrl = async (normalisedUrl: string) => {
    setIsFetchingUrl(true);
    setUrlError(null);
    try {
      const page = await fetchSyllabusPage(normalisedUrl);
      /**
       * NESA's own structure is used as it stands, so the dot points keep NESA's
       * wording and sub-points. An AI would only paraphrase them, for a paid call.
       */
      if (page.nesa && hasNesaStatements(page.nesa)) {
        const node = nesaPageToPreviewNode(page.nesa);
        setDetectedName(node.name || 'Untitled Topic');
        setPreviewSubTopics(node.subTopics);
        setExpandedIdx(new Set(node.subTopics.map((_, i) => i)));
        setNotice('Read from NESA — exact wording, no AI.');
        setYearWarning(
          node.year && node.year !== year
            ? `This focus area is ${yearShortLabel(node.year)} content; it will be added to ${yearShortLabel(year)} because that is where you are.`
            : null
        );
        setError(null);
        setUrlInput('');
        setStep('preview');
        return;
      }
      const content = page.text.trim();
      if (content.length < 80) {
        throw new Error(
          "Couldn't read any syllabus content from that URL — some pages block automated readers. Open the page yourself and paste the topic text instead."
        );
      }
      // Append rather than replace, so URL content can supplement pasted text.
      setSyllabusText((prev) => (prev.trim() ? `${prev.trim()}\n\n${content}` : content));
      setUrlInput('');
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Could not read that page. Try again.');
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
    setYearWarning(null);
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
      setError(err instanceof Error ? err.message : 'Could not analyse the syllabus. Try again.');
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
    draft.complete();
    onImport({
      targetTopicId: targetTopic?.id ?? null,
      topicName: effectiveTopicName.trim(),
      subTopics: previewSubTopics,
    });
    handleClose();
  };

  if (!isOpen) return null;

  return (
    <div className={CREATOR_BACKDROP} onClick={guard.requestCloseFromBackdrop}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-syllabus-title"
        className={`${CREATOR_SHELL} max-w-4xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={CREATOR_ICON_TILE}>
            <FolderTree className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>
              Into {yearShortLabel(year)} of "{courseName}"
            </p>
            <h2 id="topic-syllabus-title" className={CREATOR_TITLE}>
              Add a topic
            </h2>
          </div>
          <button
            type="button"
            onClick={guard.requestClose}
            aria-label="Close"
            className={CREATOR_CLOSE}
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className={CREATOR_BODY}>
          {draft.offered && (
            <div className="mb-5">
              <DraftRestoreBanner
                savedAt={draft.offered.savedAt}
                summary={
                  draft.offered.value.previewSubTopics.length > 0
                    ? `${draft.offered.value.previewSubTopics.length} analysed sub-topics`
                    : 'syllabus text for a topic'
                }
                onRestore={restoreDraft}
                onDismiss={draft.dismiss}
              />
            </div>
          )}
          {step === 'input' && (
            <div className="space-y-5 animate-fade-in">
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                Paste NESA syllabus text, or fetch it from a URL, then analyse it.
              </p>

              {/* Destination Section */}
              <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))]/40 border-b border-slate-200 dark:border-white/10">
                  <span className="t-label text-[rgb(var(--color-text-muted))]">Destination</span>
                </div>
                <div
                  className={`p-4 grid grid-cols-1 ${!targetTopic ? 'md:grid-cols-2' : ''} gap-4`}
                >
                  <div>
                    <label htmlFor="topic-import-target" className={CREATOR_FIELD_LABEL}>
                      Import into
                    </label>
                    <select
                      id="topic-import-target"
                      value={targetTopicId}
                      onChange={(e) => setTargetTopicId(e.target.value)}
                      className={CREATOR_INPUT}
                    >
                      <option value="__new__">New topic…</option>
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
                      <label htmlFor="topic-import-name" className={CREATOR_FIELD_LABEL}>
                        Topic name
                      </label>
                      <input
                        id="topic-import-name"
                        type="text"
                        value={newTopicName}
                        onChange={(e) => setNewTopicName(e.target.value)}
                        placeholder="Leave blank to detect from the text"
                        className={CREATOR_INPUT}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* URL Fetch Section */}
              <div className="rounded-xl border border-slate-200 dark:border-white/10 overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))]/40 border-b border-slate-200 dark:border-white/10 flex flex-wrap items-center gap-2">
                  <Globe
                    className="w-3.5 h-3.5 text-[rgb(var(--color-accent))]"
                    aria-hidden="true"
                  />
                  <span className="t-label text-[rgb(var(--color-text-muted))]">
                    Fetch from URL
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
                    placeholder={NESA_URL_PLACEHOLDER}
                  />
                  <p className="text-[10px] text-[rgb(var(--color-text-muted))]">
                    {NESA_HOST_HINT}
                  </p>
                </div>
              </div>

              {/* Syllabus Content Textarea */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="topic-syllabus-text"
                    className="text-sm font-semibold text-[rgb(var(--color-text-primary))]"
                  >
                    Syllabus content
                  </label>
                  {syllabusText.trim() && (
                    <span className="text-[10px] font-medium text-[rgb(var(--color-text-muted))]">
                      {syllabusText.trim().split('\n').length} lines
                    </span>
                  )}
                </div>
                <textarea
                  id="topic-syllabus-text"
                  value={syllabusText}
                  onChange={(e) => setSyllabusText(e.target.value)}
                  rows={10}
                  placeholder={`Paste the topic's sub-topics and dot points here…\n\ne.g.:\nInquiry Question 1: How do we describe motion?\n• describes uniform straight-line motion…\n• analyses the relative motion of objects…\n\nInquiry Question 2: How is motion measured?\n• measures displacement, velocity and acceleration…`}
                  className={`${CREATOR_INPUT} font-mono leading-relaxed min-h-[180px] resize-y`}
                />
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-5 animate-fade-in">
              <p className="text-sm text-[rgb(var(--color-text-secondary))]">
                Review the extracted structure before importing it.
              </p>

              {!targetTopic && (
                <div>
                  <label htmlFor="topic-confirm-name" className={CREATOR_FIELD_LABEL}>
                    Topic name
                  </label>
                  <input
                    id="topic-confirm-name"
                    type="text"
                    value={newTopicName || detectedName}
                    onChange={(e) => setNewTopicName(e.target.value)}
                    className={`${CREATOR_INPUT} font-semibold`}
                  />
                  {nameCollision && (
                    <p className="mt-2 text-xs text-[rgb(var(--color-text-muted))] flex items-center gap-1.5">
                      <GitMerge
                        className="w-3.5 h-3.5 text-[rgb(var(--color-accent))] flex-shrink-0"
                        aria-hidden="true"
                      />
                      "{nameCollision.name}" already exists — the content will be merged into it.
                    </p>
                  )}
                </div>
              )}

              <div className="bg-slate-50/50 dark:bg-[rgb(var(--color-bg-surface-inset))]/30 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                <div className="t-label px-4 py-2.5 bg-slate-100 dark:bg-[rgb(var(--color-bg-surface-elevated))] border-b border-slate-200 dark:border-white/10 text-[rgb(var(--color-text-muted))] flex flex-wrap justify-between items-center gap-x-3 gap-y-1">
                  <span>
                    {targetTopic ? `Add into "${targetTopic.name}"` : `New topic structure`}
                  </span>
                  <span className="bg-[rgb(var(--color-bg-surface-inset))] px-2 py-0.5 rounded-full normal-case font-semibold">
                    {stats.subTopics} {stats.subTopics === 1 ? 'sub-topic' : 'sub-topics'} ·{' '}
                    {stats.dotPoints} {stats.dotPoints === 1 ? 'dot point' : 'dot points'}
                  </span>
                </div>
                {previewSubTopics.length === 0 ? (
                  <div className="p-8 text-center text-sm text-[rgb(var(--color-text-muted))]">
                    Nothing left to import. Go back to adjust the content and analyse it again.
                  </div>
                ) : (
                  <div className="p-2 max-h-[45vh] overflow-y-auto custom-scrollbar">
                    {previewSubTopics.map((st, stIdx) => {
                      const isExpanded = expandedIdx.has(stIdx);
                      return (
                        <div key={stIdx} className="mb-1 last:mb-0">
                          <div className="group flex items-center gap-1 rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))] light:hover:bg-slate-100 transition">
                            <button
                              type="button"
                              onClick={() => toggleExpand(stIdx)}
                              aria-expanded={isExpanded}
                              className="flex-1 min-w-0 flex items-center gap-2 p-2 min-h-11 sm:min-h-0 text-left"
                            >
                              <ChevronRight
                                className={`w-4 h-4 text-[rgb(var(--color-text-muted))] transition-transform flex-shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                                aria-hidden="true"
                              />
                              <span className="font-semibold text-sm text-[rgb(var(--color-text-primary))] truncate">
                                {st.name}
                              </span>
                              <span className="ml-auto flex-shrink-0 text-xs text-[rgb(var(--color-text-muted))] bg-[rgb(var(--color-bg-surface-inset))] px-2 py-0.5 rounded-full">
                                {st.dotPoints.length}{' '}
                                {st.dotPoints.length === 1 ? 'dot point' : 'dot points'}
                              </span>
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSubTopic(stIdx)}
                              className="p-1.5 mr-1 min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 flex items-center justify-center rounded-lg text-[rgb(var(--color-text-muted))] sm:text-transparent sm:group-hover:text-red-400 hover:bg-red-500/20 hover:text-red-400 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                              title="Remove sub-topic"
                              aria-label={`Remove sub-topic ${st.name}`}
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                          {isExpanded && st.dotPoints.length > 0 && (
                            <div className="ml-7 pl-2 border-l border-slate-200 dark:border-white/10 mt-1 space-y-0.5">
                              {st.dotPoints.map((dp, dpIdx) => (
                                <div
                                  key={dpIdx}
                                  className="group/dp flex items-start gap-2 px-2 py-0.5 text-xs text-[rgb(var(--color-text-dim))] rounded-lg hover:bg-[rgb(var(--color-bg-surface-light))]/40 light:hover:bg-slate-100"
                                >
                                  <span
                                    className="mt-2 w-1 h-1 rounded-full bg-gray-600 light:bg-slate-400 flex-shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="flex-1 min-w-0 leading-relaxed">{dp}</span>
                                  <button
                                    type="button"
                                    onClick={() => removeDotPoint(stIdx, dpIdx)}
                                    className="min-w-11 min-h-11 sm:min-w-0 sm:min-h-0 flex items-center justify-center p-0.5 rounded-lg text-[rgb(var(--color-text-muted))] sm:text-transparent sm:group-hover/dp:text-red-400 hover:bg-red-500/20 hover:text-red-400 transition-colors flex-shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400"
                                    title="Remove dot point"
                                    aria-label="Remove dot point"
                                  >
                                    <X className="w-3 h-3" aria-hidden="true" />
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
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 text-xs text-blue-700 dark:text-blue-200 flex items-start gap-2">
                  <Sparkles
                    className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500 dark:text-blue-400"
                    aria-hidden="true"
                  />
                  <p>{notice}</p>
                </div>
              )}

              {yearWarning && (
                <div
                  role="status"
                  className="p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 text-xs text-amber-800 dark:text-amber-200"
                >
                  <p>{yearWarning}</p>
                </div>
              )}

              <p className="text-xs text-[rgb(var(--color-text-muted))]">
                Every name and dot point here is editable. Fix them now, because this text is what
                question generation reads. If content is missing, go back and clean up the raw text
                before analysing again.
              </p>
            </div>
          )}

          {error && (
            <p
              role="alert"
              className="mt-4 text-red-600 dark:text-red-400 text-sm bg-red-50 dark:bg-red-900/30 p-3 rounded-lg border border-red-200 dark:border-red-500/20 animate-fade-in"
            >
              {error}
            </p>
          )}
        </div>

        {/* Footer */}
        {guard.isConfirming ? (
          <DiscardConfirmBar
            summary={
              previewSubTopics.length > 0
                ? `this import — ${stats.subTopics} ${stats.subTopics === 1 ? 'sub-topic' : 'sub-topics'}, ${stats.dotPoints} ${stats.dotPoints === 1 ? 'dot point' : 'dot points'}`
                : 'the syllabus content you have entered'
            }
            onKeep={guard.cancelDiscard}
            onDiscard={guard.confirmDiscard}
          />
        ) : (
          <div className={CREATOR_FOOTER}>
            {step === 'input' ? (
              <>
                <button
                  type="button"
                  onClick={guard.requestClose}
                  className={CREATOR_SECONDARY_BUTTON}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleAnalyse}
                  disabled={isBusy}
                  className={CREATOR_PRIMARY_BUTTON}
                >
                  <Sparkles className="w-4 h-4" aria-hidden="true" />
                  {isAnalysing ? 'Analysing…' : 'Analyse syllabus'}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setStep('input')}
                  className={CREATOR_SECONDARY_BUTTON}
                >
                  Back to edit
                </button>
                <button
                  type="button"
                  onClick={handleConfirmImport}
                  disabled={previewSubTopics.length === 0 || !effectiveTopicName.trim()}
                  className={CREATOR_PRIMARY_BUTTON}
                >
                  {targetTopic || nameCollision ? (
                    <GitMerge className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <UploadCloud className="w-4 h-4" aria-hidden="true" />
                  )}
                  {targetTopic
                    ? `Add to ${targetTopic.name}`
                    : nameCollision
                      ? `Merge into ${nameCollision.name}`
                      : 'Create topic'}
                </button>
              </>
            )}
          </div>
        )}

        <AiBusyOverlay show={isBusy}>
          <LoadingIndicator
            task="enrichment"
            message={isFetchingUrl ? 'Reading the syllabus page' : 'Analysing the syllabus'}
            messages={
              isFetchingUrl
                ? ['Fetching the page', 'Checking it has enough syllabus text']
                : ['Reading the syllabus text', 'Sorting it into sub-topics and dot points']
            }
          />
        </AiBusyOverlay>
      </div>
    </div>
  );
};

export default TopicSyllabusImportModal;
