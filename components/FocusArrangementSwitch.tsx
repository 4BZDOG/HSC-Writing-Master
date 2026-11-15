import React, { useEffect, useState } from 'react';
import { Columns2, MoveHorizontal, Rows2 } from 'lucide-react';
import { useFocusArrangement } from '../hooks/useFocusArrangement';
import { type FocusArrangement, FOCUS_SIDE_MIN_WIDTH } from '../utils/focusLayout';

const OPTIONS: {
  value: FocusArrangement;
  label: string;
  hint: string;
  Icon: typeof Rows2;
  /** Only offered from this Tailwind breakpoint up. */
  from?: string;
}[] = [
  {
    value: 'stacked',
    label: 'Stacked',
    hint: 'Question above your answer, at reading width',
    Icon: Rows2,
  },
  {
    value: 'wide',
    label: 'Wide',
    hint: 'Question above your answer, across the whole window',
    Icon: MoveHorizontal,
  },
  {
    value: 'side',
    label: 'Side by side',
    hint: 'Question on the left, your answer on the right',
    Icon: Columns2,
    // Matches FOCUS_SIDE_MIN_WIDTH: below it the workspace falls back to the stack.
    from: 'min-[1100px]:flex',
  },
];

/**
 * Focus Mode's layout choice, beside the exit pill. Desktop only: on a phone
 * there is one column and nothing to choose.
 *
 * A radio group, because exactly one arrangement is in force. Roving tabindex
 * with the arrow keys, as the pattern expects.
 */
const FocusArrangementSwitch: React.FC = () => {
  const [arrangement, setArrangement] = useFocusArrangement();
  // `side` chosen on a window now too narrow for it is drawn as the stack, so
  // that is the option shown as on.
  const [tooNarrowForSide, setTooNarrowForSide] = useState(
    () => typeof window !== 'undefined' && window.innerWidth < FOCUS_SIDE_MIN_WIDTH
  );
  useEffect(() => {
    const update = () => setTooNarrowForSide(window.innerWidth < FOCUS_SIDE_MIN_WIDTH);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  const shown: FocusArrangement =
    arrangement === 'side' && tooNarrowForSide ? 'stacked' : arrangement;

  const move = (delta: number) => {
    const available = OPTIONS.filter((o) => o.value !== 'side' || !tooNarrowForSide);
    const index = available.findIndex((o) => o.value === shown);
    const next = available[(index + delta + available.length) % available.length];
    setArrangement(next.value);
    document.getElementById(`focus-arrangement-${next.value}`)?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label="Focus layout"
      className="hidden lg:flex items-center gap-0.5 p-1 rounded-full bg-black/40 light:bg-white/70 backdrop-blur-xl border border-white/15 light:border-slate-500 shadow-lg animate-fade-in"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          e.preventDefault();
          move(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          e.preventDefault();
          move(-1);
        }
      }}
    >
      {OPTIONS.map(({ value, label, hint, Icon, from }) => {
        const on = shown === value;
        return (
          <button
            key={value}
            id={`focus-arrangement-${value}`}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            title={hint}
            onClick={() => setArrangement(value)}
            className={`${from ? `hidden ${from}` : 'flex'} items-center gap-1.5 h-8 px-3 rounded-full t-label whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))] ${
              on
                ? 'bg-white text-slate-900 light:bg-slate-800 light:text-white shadow-sm'
                : 'text-white/80 hover:text-white hover:bg-white/10 light:text-slate-700 light:hover:text-slate-900 light:hover:bg-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5" aria-hidden="true" />
            {label}
          </button>
        );
      })}
    </div>
  );
};

export default FocusArrangementSwitch;
