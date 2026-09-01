import React, { useCallback } from 'react';
import { Sigma } from 'lucide-react';

interface MathSymbolToolbarProps {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  value: string;
  onChange: (next: string) => void;
}

/**
 * Lightweight insert-symbol helper for curator-facing textareas — NOT a
 * WYSIWYG editor. A curator who doesn't know the `\alpha`/`\frac{}{}`
 * shorthand can still get symbols by clicking a button; a curator who does
 * know it can just type it (`utils/mathNotation.ts` + `renderUtils.ts` /
 * `pdf/text.ts` already support it with no UI needed).
 *
 * Pure textarea DOM manipulation, no new dependency — matches the existing
 * paste-handling pattern in `ScenarioImageUploader.tsx`.
 */

/** Direct-insert literal symbols, spliced verbatim at the cursor. */
const SYMBOLS = [
  'π',
  '×',
  '÷',
  '±',
  '≤',
  '≥',
  '≠',
  '≈',
  '→',
  '⇌',
  '°',
  '√',
  'Δ',
  'Ω',
  'μ',
  '∑',
  '∫',
  '∠',
];

interface WrapDef {
  id: string;
  label: string;
  ariaLabel: string;
  /** Text inserted before the (possibly empty) selection. */
  prefix: string;
  /** Text inserted after the (possibly empty) selection. */
  suffix: string;
}

/** Four "wrap selection" buttons: `^{ }`, `_{ }`, `\frac{ }{ }`, `\vec{ }`. */
const WRAP_DEFS: WrapDef[] = [
  { id: 'sup', label: 'x²', ariaLabel: 'Wrap as superscript', prefix: '^{', suffix: '}' },
  { id: 'sub', label: 'x₂', ariaLabel: 'Wrap as subscript', prefix: '_{', suffix: '}' },
  { id: 'frac', label: 'a⁄b', ariaLabel: 'Wrap as fraction', prefix: '\\frac{', suffix: '}{}' },
  { id: 'vec', label: 'v⃗', ariaLabel: 'Wrap as vector', prefix: '\\vec{', suffix: '}' },
];

const PILL_CLASS =
  'flex-shrink-0 hover:scale-105 active:scale-[0.98] transition-transform text-xs rounded-lg bg-[rgb(var(--color-bg-surface-inset))] px-2 py-1 text-[rgb(var(--color-text-primary))] light:text-slate-800 border border-white/10 light:border-slate-300';

const WRAP_PILL_CLASS =
  'flex-shrink-0 hover:scale-105 active:scale-[0.98] transition-transform text-xs font-bold rounded-lg bg-[rgb(var(--color-accent))]/15 text-[rgb(var(--color-accent))] border border-[rgb(var(--color-accent))]/30 px-2 py-1';

const MathSymbolToolbar: React.FC<MathSymbolToolbarProps> = ({ textareaRef, value, onChange }) => {
  /** Focus the textarea and place the caret/selection after React commits the
   *  new value — the DOM textarea only reflects `value` on the next render,
   *  so setting selection synchronously would land on the stale string. */
  const restoreSelection = useCallback(
    (selStart: number, selEnd: number) => {
      requestAnimationFrame(() => {
        const ta = textareaRef.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(selStart, selEnd);
      });
    },
    [textareaRef]
  );

  const insertSymbol = useCallback(
    (symbol: string) => {
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? value.length;
      const end = ta?.selectionEnd ?? value.length;
      const next = value.slice(0, start) + symbol + value.slice(end);
      onChange(next);
      const cursor = start + symbol.length;
      restoreSelection(cursor, cursor);
    },
    [textareaRef, value, onChange, restoreSelection]
  );

  const wrapSelection = useCallback(
    (def: WrapDef) => {
      const ta = textareaRef.current;
      const start = ta?.selectionStart ?? value.length;
      const end = ta?.selectionEnd ?? value.length;
      const hasSelection = end > start;
      const selected = hasSelection ? value.slice(start, end) : '';
      const inserted = `${def.prefix}${selected}${def.suffix}`;
      const next = value.slice(0, start) + inserted + value.slice(end);
      onChange(next);

      if (hasSelection) {
        // Fraction's suffix ("}{}") has a second, empty bracket pair after
        // the wrapped numerator — land the caret inside it so the curator
        // can type the denominator next; every other wrap places the caret
        // right after the closing brace.
        const caret = def.id === 'frac' ? start + inserted.length - 1 : start + inserted.length;
        restoreSelection(caret, caret);
      } else {
        // No selection: insert the empty placeholder and land the caret
        // inside it (right after the prefix), so typing lands between the
        // braces rather than after the whole snippet.
        const caret = start + def.prefix.length;
        restoreSelection(caret, caret);
      }
    },
    [textareaRef, value, onChange, restoreSelection]
  );

  return (
    <div className="flex items-center gap-1.5 mb-2">
      <div
        className="flex items-center gap-1.5 overflow-x-auto pb-0.5 flex-1 min-w-0"
        role="toolbar"
        aria-label="Insert maths and science symbols"
      >
        <Sigma className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" aria-hidden="true" />
        {SYMBOLS.map((symbol) => (
          <button
            key={symbol}
            type="button"
            onClick={() => insertSymbol(symbol)}
            className={PILL_CLASS}
            title={`Insert ${symbol}`}
            aria-label={`Insert ${symbol}`}
          >
            {symbol}
          </button>
        ))}
        <span className="w-px h-4 bg-white/10 light:bg-slate-300 flex-shrink-0 mx-0.5" />
        {WRAP_DEFS.map((def) => (
          <button
            key={def.id}
            type="button"
            onClick={() => wrapSelection(def)}
            className={WRAP_PILL_CLASS}
            title={def.ariaLabel}
            aria-label={def.ariaLabel}
          >
            {def.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MathSymbolToolbar;
