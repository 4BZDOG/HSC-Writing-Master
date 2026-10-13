import React, { useCallback, useEffect, useId, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, FileText, Settings2, X } from 'lucide-react';
import { useFocusTrap } from '../hooks/useFocusTrap';
import { MAX_COPIES, PdfExportPreferences } from '../utils/pdfExportPreferences';

/**
 * The export options a teacher actually has opinions about.
 *
 * The exporter has supported all of these since it was written; none of them
 * were reachable, so every report came out A4, one copy, always with the
 * student's response and never with room to write on. This is the panel that
 * hands them over — and because it sits behind a chevron rather than in the
 * toolbar, a one-click export is still one click.
 */

/**
 * A checkbox row. The native input is kept, visually hidden, for the keyboard and
 * the screen reader; the box drawn beside it takes the focus ring, because the
 * hidden input has no outline of its own and a keyboard user would otherwise
 * tab through a list with no sign of where they are.
 */
const Row: React.FC<{
  label: string;
  hint: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}> = ({ label, hint, checked, onChange }) => {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className="flex items-start gap-3 px-3 py-2.5 min-h-11 rounded-xl hover:bg-slate-100 dark:hover:bg-white/5 cursor-pointer transition-colors"
    >
      <input
        id={id}
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={`mt-0.5 w-4 h-4 shrink-0 rounded-lg border flex items-center justify-center transition-all peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-500 ${
          checked
            ? 'bg-indigo-600 border-indigo-600 text-white'
            : 'border-slate-500 dark:border-white/30'
        }`}
        aria-hidden="true"
      >
        {checked && <Check className="w-3 h-3" strokeWidth={3} />}
      </span>
      <span className="min-w-0">
        <span className="block text-xs font-bold text-slate-800 dark:text-slate-100">{label}</span>
        <span className="block text-xs leading-snug text-slate-600 dark:text-slate-400 mt-0.5">
          {hint}
        </span>
      </span>
    </label>
  );
};

/** Panel width (rem → px at the root 16px) used to keep it on screen. */
const PANEL_WIDTH = 304;
/** Only used for the first frame, before the panel can be measured. */
const ESTIMATED_PANEL_HEIGHT = 420;

interface PdfExportOptionsProps {
  open: boolean;
  onClose: () => void;
  value: PdfExportPreferences;
  onChange: (next: PdfExportPreferences) => void;
  /** The control the panel hangs from. */
  anchorRef: React.RefObject<HTMLElement | null>;
}

const PdfExportOptions: React.FC<PdfExportOptionsProps> = ({
  open,
  onClose,
  value,
  onChange,
  anchorRef,
}) => {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null);
  /**
   * The panel is a focus trap of its own while it is open.
   *
   * It is portalled to `<body>`, which is outside the evaluation modal, and that
   * modal holds focus inside itself. Left alone, Tab could never reach the
   * checkboxes: a keyboard user got a visible focus ring on nothing they could
   * focus. As an overlay on the stack it is the topmost trap, so it takes focus
   * on open, keeps Tab inside, and hands focus back to the settings button when
   * it closes — the same arrangement the modals beneath it already use.
   */
  const panelRef = useFocusTrap<HTMLDivElement>(open && anchor !== null);
  const set = <K extends keyof PdfExportPreferences>(key: K, next: PdfExportPreferences[K]) =>
    onChange({ ...value, [key]: next });

  /**
   * The copy count is typed as text and committed when the field is left.
   *
   * An empty field stays empty while it has focus, so a new number can be typed
   * over the old one. Leaving the field clamps the value to the range the
   * exporter will render.
   */
  const [copiesText, setCopiesText] = useState(String(value.copies));
  useEffect(() => {
    setCopiesText(String(value.copies));
  }, [value.copies]);
  const commitCopies = () => {
    const n = Math.floor(Number(copiesText));
    const clamped =
      copiesText.trim() !== '' && Number.isFinite(n) ? Math.max(1, Math.min(MAX_COPIES, n)) : 1;
    setCopiesText(String(clamped));
    if (clamped !== value.copies) set('copies', clamped);
  };

  /**
   * Anchored with a fixed-position portal rather than positioned inside the
   * button's own box.
   *
   * The panel opens inside the evaluation modal, whose body scrolls and clips
   * its overflow — an absolutely positioned panel was sliced off at the top of
   * the scroll region, which is how this was found. Out in `document.body` it
   * is above all of that, and clamped so a button near the right edge still
   * shows the whole panel. (The outcome chips on the question card solve the
   * same problem the same way.)
   */
  const place = useCallback(() => {
    const rect = anchorRef.current?.getBoundingClientRect();
    if (!rect) return;
    const left = Math.max(
      12,
      Math.min(rect.right - PANEL_WIDTH, window.innerWidth - PANEL_WIDTH - 12)
    );
    // Below the button by default; above it when the bottom of the screen is
    // closer than the panel is tall. The measured height is used once the panel
    // exists, and an estimate for the first frame.
    const height = panelRef.current?.offsetHeight ?? ESTIMATED_PANEL_HEIGHT;
    const below = rect.bottom + 8;
    const top =
      below + height > window.innerHeight - 12 ? Math.max(12, rect.top - height - 8) : below;
    setAnchor({ left, top });
  }, [anchorRef]);

  // A passive effect, deliberately, not a layout one: React attaches refs
  // child-first, so a layout effect here runs BEFORE the parent that owns the
  // anchor ref has one — the panel would measure nothing and render nothing.
  // Passive effects run after the whole tree is committed, when the anchor is
  // there to measure.
  useEffect(() => {
    if (!open) {
      setAnchor(null);
      return;
    }
    place();
    // Once more with the panel itself measured, so a flip decided from the
    // estimated height settles on the real one before it is seen.
    const frame = requestAnimationFrame(place);
    return () => cancelAnimationFrame(frame);
  }, [open, place]);

  // The trigger travels with the modal's scroll; the fixed panel does not, so
  // it follows rather than floating away from the button that opened it.
  useEffect(() => {
    if (!open) return;
    const update = () => place();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, place]);

  /**
   * Escape closes THIS panel and nothing else.
   *
   * The panel opens inside the evaluation modal, and that modal listens for
   * Escape on `window` like every dismissible surface in the app. Registering
   * another bubble-phase listener alongside it means one press fires both — the
   * panel closes and the whole report closes behind it, which is how this was
   * found. A capture-phase listener runs on the way DOWN, before any of them,
   * so stopping propagation there leaves the modal's listener untouched: the
   * press it never sees is a press it cannot act on.
   */
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  // Click-away. `mousedown` rather than `click` so the panel closes on the
  // press, before the click lands on whatever is underneath it.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // The trigger is excluded: it toggles the panel itself, and closing here
      // first would make the chevron a button that never opens anything.
      if (panelRef.current?.contains(target) || anchorRef.current?.contains(target)) return;
      onClose();
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open, onClose, anchorRef]);

  if (!open || !anchor || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-label="PDF export options"
      style={{ left: anchor.left, top: anchor.top, width: PANEL_WIDTH }}
      className="fixed z-popover max-w-[calc(100vw-2rem)] p-2 rounded-2xl bg-surface-elevated border border-slate-200 dark:border-white/10 shadow-lg animate-fade-in text-left"
    >
      <div className="flex items-center gap-2 px-3 py-2">
        <Settings2 className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400" aria-hidden="true" />
        <span className="t-label text-slate-600 dark:text-slate-400">Export options</span>
        <button
          onClick={onClose}
          aria-label="Close export options"
          className="ml-auto inline-flex items-center justify-center min-h-11 min-w-11 sm:min-h-0 sm:min-w-0 sm:p-1 rounded-lg text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-3 py-2">
        <span className="t-label block text-slate-600 dark:text-slate-400 mb-1.5">Paper</span>
        <div
          role="group"
          aria-label="Page size"
          className="flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-black/30"
        >
          {(
            [
              ['a4', 'A4', '210 × 297 mm'],
              ['letter', 'Letter', '8.5 × 11 in'],
            ] as const
          ).map(([size, label, dims]) => (
            <button
              key={size}
              type="button"
              onClick={() => set('pageSize', size)}
              aria-pressed={value.pageSize === size}
              title={dims}
              className={`flex-1 min-h-11 sm:min-h-0 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                value.pageSize === size
                  ? 'bg-white dark:bg-white/15 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <Row
        label="Student's response"
        hint="Prints the submitted answer with the feedback, so the report stands on its own."
        checked={value.includeResponse}
        onChange={(v) => set('includeResponse', v)}
      />
      <Row
        label="Marker's notes"
        hint="Ruled space at the end for handwritten comments."
        checked={value.markerNotes}
        onChange={(v) => set('markerNotes', v)}
      />
      <Row
        label="Name / class / date lines"
        hint="Fill-in fields in the top corner of the first page."
        checked={value.showFields}
        onChange={(v) => set('showFields', v)}
      />

      <div className="flex items-center gap-3 px-3 py-2.5 border-t border-slate-200 dark:border-white/10 mt-1">
        <FileText
          className="w-3.5 h-3.5 text-slate-600 dark:text-slate-400 shrink-0"
          aria-hidden="true"
        />
        <label
          htmlFor="pdf-copies"
          className="text-xs font-bold text-slate-800 dark:text-slate-100"
        >
          Copies
        </label>
        <span className="text-xs text-slate-600 dark:text-slate-400">for a class set</span>
        <input
          id="pdf-copies"
          type="number"
          inputMode="numeric"
          min={1}
          max={MAX_COPIES}
          value={copiesText}
          onChange={(e) => setCopiesText(e.target.value)}
          onBlur={commitCopies}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          className="ml-auto w-16 min-h-11 sm:min-h-0 px-2 py-1 rounded-lg text-base sm:text-xs font-bold text-right tabular-nums bg-slate-100 dark:bg-black/30 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
        />
      </div>
    </div>,
    document.body
  );
};

export default PdfExportOptions;
