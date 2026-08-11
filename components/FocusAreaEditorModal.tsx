import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Target, X, Plus, Trash2, RotateCcw, Info, GripVertical } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useScrollLock } from '../hooks/useScrollLock';
import { parseSubItemsFromDescription } from '../utils/dataManagerUtils';

interface FocusAreaEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** The dot point's verbatim syllabus text — the source the parser reads. */
  description: string;
  /** Current focus areas as the app resolves them (`getFocusAreas`). */
  focusAreas: string[];
  /** True when the current list is the teacher's, not the parser's. */
  isOverridden: boolean;
  /** Save a hand-set list. An empty array is a valid answer: "there are none". */
  onSave: (focusAreas: string[]) => void;
  /** Drop the override and go back to whatever the parser finds. */
  onReset: () => void;
}

/**
 * Hand-editing for a dot point's focus areas.
 *
 * `parseSubItemsFromDescription` is a heuristic over prose no syllabus author
 * wrote for a parser: it splits on "and" inside a single named concept, keeps
 * a trailing clause that was never a list item, and misses lists written in a
 * shape it does not know. Those are the cases this fixes — and, because the
 * list is what the question generator narrows a question to, a bad parse is
 * not cosmetic.
 */
const FocusAreaEditorModal: React.FC<FocusAreaEditorModalProps> = ({
  isOpen,
  onClose,
  description,
  focusAreas,
  isOverridden,
  onSave,
  onReset,
}) => {
  const [items, setItems] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEscapeKey(isOpen, onClose);
  useScrollLock(isOpen);

  useEffect(() => {
    if (isOpen) {
      setItems(focusAreas);
      setDraft('');
    }
  }, [isOpen, focusAreas]);

  // What the parser would say, shown as a reference and as the target of
  // "Reset". Recomputed rather than passed in so the comparison is honest even
  // while an override is active.
  const parsed = useMemo(() => parseSubItemsFromDescription(description), [description]);
  const differsFromParsed = useMemo(
    () => items.length !== parsed.length || items.some((item, i) => item !== parsed[i]),
    [items, parsed]
  );

  if (!isOpen) return null;

  const addDraft = () => {
    const value = draft.trim();
    if (!value) return;
    // Silently ignoring a duplicate reads as a broken button; clearing the
    // field and leaving the existing entry in place is the honest outcome.
    if (!items.some((i) => i.toLowerCase() === value.toLowerCase())) {
      setItems((prev) => [...prev, value]);
    }
    setDraft('');
  };

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    setItems((prev) => {
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const handleSave = () => {
    onSave(items.map((i) => i.trim()).filter(Boolean));
    onClose();
  };

  const handleReset = () => {
    onReset();
    onClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[2100] p-4"
      onClick={onClose}
    >
      <div
        className="clip-stable bg-[rgb(var(--color-bg-surface))] light:bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-emerald-500/30 light:border-emerald-600/30 animate-fade-in-up overflow-hidden flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="relative px-6 py-5 border-b border-[rgb(var(--color-border-secondary))] light:border-slate-200 bg-[rgb(var(--color-bg-surface))] light:bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center justify-between relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg">
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-[rgb(var(--color-text-primary))] light:text-slate-900">
                  Edit Focus Areas
                </h2>
                <p className="text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500">
                  {isOverridden
                    ? 'Set by hand — the automatic reading is ignored'
                    : 'Read automatically from the syllabus wording'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-lg bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-200 hover:bg-[rgb(var(--color-border-secondary))]/40 light:hover:bg-slate-300 transition-all flex items-center justify-center"
            >
              <X className="w-4 h-4 text-[rgb(var(--color-text-muted))] light:text-slate-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-5 bg-[rgb(var(--color-bg-surface))] light:bg-white">
          <div className="p-4 rounded-xl bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200">
            <p className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--color-text-muted))] light:text-slate-500 mb-2">
              Syllabus dot point
            </p>
            <p className="text-sm leading-relaxed text-[rgb(var(--color-text-secondary))] light:text-slate-700 font-serif">
              {description}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <label
                htmlFor="focus-area-input"
                className="text-[10px] font-black uppercase tracking-widest text-[rgb(var(--color-text-muted))] light:text-slate-500"
              >
                Focus areas ({items.length})
              </label>
              {differsFromParsed && parsed.length > 0 && (
                <button
                  onClick={() => setItems(parsed)}
                  className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg text-[rgb(var(--color-text-muted))] light:text-slate-500 hover:text-emerald-500 transition-colors flex items-center gap-1.5"
                  title={`Automatic reading: ${parsed.join(', ')}`}
                >
                  <RotateCcw className="w-3 h-3" /> Use the automatic reading
                </button>
              )}
            </div>

            <div className="space-y-2">
              {items.map((item, index) => (
                <div
                  key={`${item}-${index}`}
                  className="flex items-center gap-2 p-2 rounded-xl bg-emerald-500/[0.07] border border-emerald-500/20"
                >
                  <div className="flex flex-col shrink-0">
                    <button
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move "${item}" up`}
                      className="px-1 text-[9px] leading-none text-[rgb(var(--color-text-muted))] hover:text-emerald-500 disabled:opacity-25 transition-colors"
                    >
                      ▲
                    </button>
                    <button
                      onClick={() => move(index, 1)}
                      disabled={index === items.length - 1}
                      aria-label={`Move "${item}" down`}
                      className="px-1 text-[9px] leading-none text-[rgb(var(--color-text-muted))] hover:text-emerald-500 disabled:opacity-25 transition-colors"
                    >
                      ▼
                    </button>
                  </div>
                  <GripVertical className="w-3.5 h-3.5 text-emerald-500/40 shrink-0" />
                  <input
                    value={item}
                    aria-label={`Focus area ${index + 1}`}
                    onChange={(e) =>
                      setItems((prev) => prev.map((v, i) => (i === index ? e.target.value : v)))
                    }
                    className="flex-1 min-w-0 bg-transparent text-sm font-medium text-[rgb(var(--color-text-primary))] light:text-slate-900 outline-none focus:outline-none"
                  />
                  <button
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`Remove "${item}"`}
                    className="p-1.5 rounded-lg text-[rgb(var(--color-text-muted))] hover:text-red-500 hover:bg-red-500/10 transition-all shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {items.length === 0 && (
                <p className="py-6 text-center text-xs text-[rgb(var(--color-text-muted))] light:text-slate-500 border-2 border-dashed border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 rounded-xl">
                  No focus areas. Questions will be written against the whole dot point.
                </p>
              )}
            </div>

            <div className="flex gap-2 mt-3">
              <input
                id="focus-area-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDraft();
                  }
                }}
                placeholder="Add a focus area…"
                className="flex-1 min-w-0 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-white border border-[rgb(var(--color-border-secondary))]/30 light:border-slate-300 rounded-xl py-2.5 px-4 text-sm text-[rgb(var(--color-text-primary))] light:text-slate-900 outline-none focus:border-emerald-500 transition-colors"
              />
              <button
                onClick={addDraft}
                disabled={!draft.trim()}
                className="px-4 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all disabled:opacity-40 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-[11px] leading-relaxed text-[rgb(var(--color-text-muted))] light:text-slate-500">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              These narrow what a generated question is about, and they ground the syllabus terms
              the AI expects in an answer. Saving an empty list is a valid answer — it tells the app
              this dot point has no sub-parts and silences a bad automatic reading.
            </p>
          </div>
        </div>

        <div className="px-6 py-4 bg-[rgb(var(--color-bg-surface-inset))]/50 light:bg-slate-50 border-t border-[rgb(var(--color-border-secondary))]/30 light:border-slate-200 flex flex-wrap justify-between items-center gap-3">
          <button
            onClick={handleReset}
            disabled={!isOverridden}
            title={
              isOverridden
                ? 'Discard the hand-set list and read the syllabus wording again'
                : 'This dot point is already using the automatic reading'
            }
            className="py-2.5 px-4 rounded-lg text-xs font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-600 hover:text-red-500 transition disabled:opacity-40 disabled:hover:text-[rgb(var(--color-text-muted))] flex items-center gap-2"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to automatic
          </button>
          <div className="flex gap-3 ml-auto">
            <button
              onClick={onClose}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-[rgb(var(--color-text-muted))] light:text-slate-600 bg-[rgb(var(--color-bg-surface-light))]/40 light:bg-white border border-transparent light:border-slate-300 hover:bg-[rgb(var(--color-border-secondary))]/20 light:hover:bg-slate-100 transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="py-2.5 px-5 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-emerald-600 to-teal-500 hover:shadow-lg active:scale-[0.98] transition"
            >
              Save Focus Areas
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FocusAreaEditorModal;
