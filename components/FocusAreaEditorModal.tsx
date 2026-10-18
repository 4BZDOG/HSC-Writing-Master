import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Target, X, Plus, Trash2, RotateCcw, Info, GripVertical } from 'lucide-react';
import { useEscapeKey } from '../hooks/useEscapeKey';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { useScrollLock } from '../hooks/useScrollLock';
import { parseSubItemsFromDescription } from '../utils/dataManagerUtils';
import {
  creatorBackdrop,
  CREATOR_SHELL,
  CREATOR_HEADER,
  CREATOR_KICKER,
  CREATOR_TITLE,
  CREATOR_CLOSE,
  CREATOR_BODY,
  CREATOR_FOOTER,
  CREATOR_SECONDARY_BUTTON,
  CREATOR_PRIMARY_BUTTON,
  CREATOR_INPUT,
} from '../utils/creatorChrome';

/**
 * The header tile in the focus-area colour.
 *
 * Focus areas are emerald across the picker (the sub-item tiles, the edit
 * trigger and its chips), so this keeps CREATOR_ICON_TILE's shape in emerald
 * rather than the indigo default. The primary action stays the shared one.
 */
const FOCUS_ICON_TILE =
  'w-10 h-10 rounded-tile flex items-center justify-center shrink-0 bg-emerald-100 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30';

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
  const dialogRef = useFocusTrap<HTMLDivElement>(isOpen);

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
    <div className={creatorBackdrop('z-focus-editor')} onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="focus-area-editor-title"
        className={`${CREATOR_SHELL} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className={CREATOR_HEADER}>
          <div aria-hidden="true" className={FOCUS_ICON_TILE}>
            <Target className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className={CREATOR_KICKER}>
              {isOverridden ? 'Set by hand' : 'Read from the syllabus wording'}
            </p>
            <h2 id="focus-area-editor-title" className={CREATOR_TITLE}>
              Edit focus areas
            </h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className={CREATOR_CLOSE}>
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>

        <div className={`${CREATOR_BODY} space-y-5`}>
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-[rgb(var(--color-bg-surface-inset))]/50 border border-slate-200 dark:border-white/10">
            <p className="t-label text-[rgb(var(--color-text-muted))] mb-2">Syllabus dot point</p>
            <p className="text-sm leading-relaxed text-[rgb(var(--color-text-secondary))] font-serif">
              {description}
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <label
                htmlFor="focus-area-input"
                className="t-label text-[rgb(var(--color-text-muted))]"
              >
                Focus areas ({items.length})
              </label>
              {differsFromParsed && parsed.length > 0 && (
                <button
                  type="button"
                  onClick={() => setItems(parsed)}
                  className="t-label min-h-11 sm:min-h-0 px-2.5 py-1 rounded-lg text-[rgb(var(--color-text-muted))] hover:text-emerald-500 transition-colors flex items-center gap-1.5"
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
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move "${item}" up`}
                      className="px-1 text-[9px] leading-none text-[rgb(var(--color-text-muted))] hover:text-emerald-500 disabled:opacity-25 transition-colors"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
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
                    className="flex-1 min-w-0 bg-transparent text-base sm:text-sm font-medium text-[rgb(var(--color-text-primary))] outline-none focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    aria-label={`Remove "${item}"`}
                    className="p-1.5 min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 inline-flex items-center justify-center rounded-lg text-[rgb(var(--color-text-muted))] hover:text-red-500 hover:bg-red-500/10 transition-all shrink-0"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}

              {items.length === 0 && (
                <p className="py-6 text-center text-xs text-[rgb(var(--color-text-muted))] border-2 border-dashed border-slate-300 dark:border-white/15 rounded-xl">
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
                className={`${CREATOR_INPUT} min-w-0 flex-1 py-2.5`}
              />
              <button
                type="button"
                onClick={addDraft}
                disabled={!draft.trim()}
                className="t-label px-4 min-h-11 sm:min-h-0 rounded-xl bg-emerald-500/15 text-emerald-800 dark:text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all disabled:opacity-40 flex items-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>

          <div className="flex items-start gap-2.5 text-[11px] leading-relaxed text-[rgb(var(--color-text-muted))]">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <p>
              These narrow what a generated question is about, and they ground the syllabus terms
              the AI expects in an answer. Saving an empty list is a valid answer — it tells the app
              this dot point has no sub-parts and silences a bad automatic reading.
            </p>
          </div>
        </div>

        <div className={CREATOR_FOOTER}>
          <button
            type="button"
            onClick={handleReset}
            disabled={!isOverridden}
            title={
              isOverridden
                ? 'Discard the hand-set list and read the syllabus wording again'
                : 'This dot point is already using the automatic reading'
            }
            className="t-label min-h-11 sm:min-h-0 py-2.5 px-4 rounded-lg text-[rgb(var(--color-text-muted))] hover:text-red-500 transition disabled:opacity-40 disabled:hover:text-[rgb(var(--color-text-muted))] flex items-center justify-center gap-2 sm:mr-auto"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset to automatic
          </button>
          <button type="button" onClick={onClose} className={CREATOR_SECONDARY_BUTTON}>
            Cancel
          </button>
          <button type="button" onClick={handleSave} className={CREATOR_PRIMARY_BUTTON}>
            Save focus areas
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default FocusAreaEditorModal;
