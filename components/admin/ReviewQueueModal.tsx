import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  ShieldCheck,
  Check,
  Ban,
  RefreshCw,
  Inbox,
  FileQuestion,
  FileText,
  Layers,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  fetchModerationQueue,
  approvePrompt,
  rejectPrompt,
  approveSampleAnswer,
  rejectSampleAnswer,
  moderateStructure,
  type ModerationItem,
  type StructureKind,
} from '../../services/contributionService';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useFocusTrap } from '../../hooks/useFocusTrap';
import { useScrollLock } from '../../hooks/useScrollLock';
import ConfirmationModal from '../ConfirmationModal';
import LoadingIndicator from '../LoadingIndicator';

type KindFilter = 'all' | 'prompt' | 'sample_answer' | 'structure';

const STRUCTURE_KINDS: StructureKind[] = ['topic', 'sub_topic', 'dot_point'];
const isStructureKind = (k: ModerationItem['kind']): k is StructureKind =>
  (STRUCTURE_KINDS as string[]).includes(k);

/** Human label for an item's kind (badge + empty-state copy). */
const KIND_LABEL: Record<ModerationItem['kind'], string> = {
  prompt: 'Question',
  sample_answer: 'Sample Answer',
  topic: 'Topic',
  sub_topic: 'Sub-topic',
  dot_point: 'Dot point',
};

/** Dispatch approve/reject to the right server-side RPC for the item's kind. */
const decideItem = (item: ModerationItem, decision: 'approve' | 'reject'): Promise<void> => {
  if (item.kind === 'prompt')
    return decision === 'approve' ? approvePrompt(item.id) : rejectPrompt(item.id);
  if (item.kind === 'sample_answer')
    return decision === 'approve' ? approveSampleAnswer(item.id) : rejectSampleAnswer(item.id);
  return moderateStructure(item.kind, item.id, decision === 'approve' ? 'approved' : 'rejected');
};

interface ReviewQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

/** AI pre-screen score badge; colour-coded so reviewers can triage at a glance. */
const QualityBadge: React.FC<{ score: number | null }> = ({ score }) => {
  if (score == null) return null;
  const tone =
    score >= 75
      ? 'bg-emerald-500/15 text-emerald-500 border-emerald-500/30'
      : score >= 50
        ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
        : 'bg-red-500/15 text-red-400 border-red-500/30';
  return (
    <span
      className={`px-1.5 py-0.5 rounded-md border text-[10px] font-bold ${tone}`}
      title="AI quality pre-screen score (client-reported — advisory only, review the content itself)"
    >
      AI {score}/100
    </span>
  );
};

/**
 * Admin/teacher review queue for the shared-library contribution loop. Lists
 * `pending` prompts and sample answers (RLS returns these only to reviewers and
 * the author) and approves/rejects them through the server-side RPCs. The
 * server re-checks the caller in every RPC, so this UI is a convenience, not
 * the security boundary.
 */
const ReviewQueueModal: React.FC<ReviewQueueModalProps> = ({ isOpen, onClose, showToast }) => {
  const [items, setItems] = useState<ModerationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<KindFilter>('all');
  const [rejectTarget, setRejectTarget] = useState<ModerationItem | null>(null);
  const [approveAllOpen, setApproveAllOpen] = useState(false);
  const [isBulkApproving, setIsBulkApproving] = useState(false);

  useEscapeKey(isOpen && !busyId && !rejectTarget && !approveAllOpen && !isBulkApproving, onClose);
  useScrollLock(isOpen);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setItems(await fetchModerationQueue());
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Failed to load the review queue.', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    if (isOpen) load();
  }, [isOpen, load]);

  const counts = {
    all: items.length,
    prompt: items.filter((i) => i.kind === 'prompt').length,
    sample_answer: items.filter((i) => i.kind === 'sample_answer').length,
    structure: items.filter((i) => isStructureKind(i.kind)).length,
  };
  const visibleItems =
    kindFilter === 'all'
      ? items
      : kindFilter === 'structure'
        ? items.filter((i) => isStructureKind(i.kind))
        : items.filter((i) => i.kind === kindFilter);

  /**
   * Approve everything currently visible (i.e. respecting the kind filter) —
   * built for clearing a batch of audit-studio repairs you have already
   * checked. Sequential so one failure doesn't abort the rest; failures stay
   * in the queue.
   */
  const handleApproveAllVisible = async () => {
    setIsBulkApproving(true);
    let done = 0;
    let failed = 0;
    for (const item of visibleItems) {
      try {
        await decideItem(item, 'approve');
        done++;
        setItems((prev) => prev.filter((i) => i.id !== item.id));
      } catch {
        failed++;
      }
    }
    setIsBulkApproving(false);
    showToast(
      failed > 0
        ? `Approved ${done}; ${failed} failed and remain in the queue.`
        : `Published ${done} item${done === 1 ? '' : 's'} to the shared library.`,
      failed > 0 ? 'error' : 'success'
    );
  };

  const handleDecision = async (item: ModerationItem, decision: 'approve' | 'reject') => {
    setBusyId(item.id);
    try {
      await decideItem(item, decision);
      // Drop the resolved item locally so the list stays responsive.
      setItems((prev) => prev.filter((i) => i.id !== item.id));
      setExpandedId((prev) => (prev === item.id ? null : prev));
      showToast(
        decision === 'approve' ? 'Published to the shared library.' : 'Contribution rejected.',
        decision === 'approve' ? 'success' : 'info'
      );
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Action failed.', 'error');
    } finally {
      setBusyId(null);
    }
  };
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label="Review queue"
      className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-3xl border border-[rgb(var(--color-border-secondary))] light:border-slate-300 clip-stable animate-fade-in-up overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 shadow-lg flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900 flex items-center gap-2">
                Review Queue
                {!isLoading && counts.all > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 text-xs font-bold">
                    {counts.all} pending
                  </span>
                )}
              </h2>
              <p className="text-sm text-[rgb(var(--color-text-muted))] light:text-slate-500">
                Approve or reject contributions to the shared library
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={load}
              disabled={isLoading}
              aria-label="Refresh"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center"
            >
              <RefreshCw
                className={`w-4 h-4 text-[rgb(var(--color-text-muted))] ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))] light:hover:bg-slate-300 transition-all flex items-center justify-center"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))]" />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 custom-scrollbar">
          {!isLoading && counts.all > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(
                [
                  { id: 'all', label: `All (${counts.all})` },
                  { id: 'prompt', label: `Questions (${counts.prompt})` },
                  { id: 'sample_answer', label: `Sample Answers (${counts.sample_answer})` },
                  { id: 'structure', label: `Structure (${counts.structure})` },
                ] as { id: KindFilter; label: string }[]
              ).map((f) => (
                <button
                  key={f.id}
                  onClick={() => setKindFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${
                    kindFilter === f.id
                      ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-500'
                      : 'bg-[rgb(var(--color-bg-surface-inset))]/40 light:bg-slate-100 border-[rgb(var(--color-border-secondary))] light:border-slate-200 text-[rgb(var(--color-text-muted))] hover:text-[rgb(var(--color-text-primary))]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
              <div className="flex-1" />
              <button
                onClick={() => setApproveAllOpen(true)}
                disabled={isBulkApproving || visibleItems.length === 0}
                title="Approve everything currently visible (respects the kind filter)"
                className="px-3 py-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-50"
              >
                <Check className="w-3.5 h-3.5" />
                {isBulkApproving ? 'Approving…' : `Approve All (${visibleItems.length})`}
              </button>
            </div>
          )}

          {isLoading ? (
            <div className="h-40 flex items-center justify-center">
              <LoadingIndicator messages={['Loading review queue…']} duration={2} />
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="text-center py-16">
              <Inbox className="w-12 h-12 text-[rgb(var(--color-text-muted))] light:text-slate-300 mx-auto mb-3" />
              <p className="text-[rgb(var(--color-text-secondary))] light:text-slate-600 font-medium">
                {counts.all === 0 ? 'Nothing awaiting review.' : 'Nothing of this kind is pending.'}
              </p>
              <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                {counts.all === 0
                  ? 'Submitted questions, sample answers and structure will appear here.'
                  : 'Switch the filter above to see the rest of the queue.'}
              </p>
            </div>
          ) : (
            <ul className="space-y-3">
              {visibleItems.map((item) => (
                <li
                  key={`${item.kind}:${item.id}`}
                  className="flex items-start gap-4 p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/30 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))] light:border-slate-200"
                >
                  <div className="mt-0.5 text-[rgb(var(--color-text-muted))]">
                    {item.kind === 'prompt' ? (
                      <FileQuestion className="w-5 h-5" />
                    ) : isStructureKind(item.kind) ? (
                      <Layers className="w-5 h-5" />
                    ) : (
                      <FileText className="w-5 h-5" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))]">
                        {KIND_LABEL[item.kind]}
                      </span>
                      <QualityBadge score={item.qualityScore} />
                    </div>
                    {item.context && (
                      <p
                        className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 italic truncate"
                        title={item.context}
                      >
                        For: {item.context}
                      </p>
                    )}
                    <p className="text-sm text-[rgb(var(--color-text-primary))] light:text-slate-800 break-words whitespace-pre-wrap">
                      {expandedId === item.id ? item.fullText : item.title}
                    </p>
                    {item.fullText.length > item.title.length && (
                      <button
                        onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                        className="mt-1 flex items-center gap-1 text-[11px] font-bold text-[rgb(var(--color-accent))] hover:underline"
                      >
                        {expandedId === item.id ? (
                          <>
                            <ChevronUp className="w-3 h-3" /> Show less
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3 h-3" /> Show full content
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleDecision(item, 'approve')}
                      disabled={busyId === item.id || isBulkApproving}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-500 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all text-xs font-bold disabled:opacity-50"
                    >
                      <Check className="w-3.5 h-3.5" /> Approve
                    </button>
                    <button
                      onClick={() => setRejectTarget(item)}
                      disabled={busyId === item.id || isBulkApproving}
                      className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-all text-xs font-bold disabled:opacity-50"
                    >
                      <Ban className="w-3.5 h-3.5" /> Reject
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmationModal
        isOpen={approveAllOpen}
        onClose={() => setApproveAllOpen(false)}
        onConfirm={handleApproveAllVisible}
        title={`Approve all ${visibleItems.length} visible item${visibleItems.length === 1 ? '' : 's'}?`}
        message="Everything currently listed will be published to the shared library and become visible to all users. Items that fail stay in the queue."
        confirmButtonText="Approve & Publish"
      />

      <ConfirmationModal
        isOpen={rejectTarget !== null}
        onClose={() => setRejectTarget(null)}
        onConfirm={() => {
          if (rejectTarget) handleDecision(rejectTarget, 'reject');
        }}
        title={`Reject this ${rejectTarget?.kind === 'prompt' ? 'question' : 'sample answer'}?`}
        message={`"${rejectTarget?.title ?? ''}" will be removed from the review queue. This cannot be undone from here.`}
        confirmButtonText="Reject"
        isDestructive
      />
    </div>,
    document.body
  );
};

export default ReviewQueueModal;
