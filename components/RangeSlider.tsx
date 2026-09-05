import React, { useCallback, useId } from 'react';
import type { Range } from '../utils/questionFilter';

interface RangeSliderProps {
  min: number;
  max: number;
  step?: number;
  value: Range;
  onChange: (next: Range) => void;
  /** Names the axis — "Difficulty", "Length". Shown, and read to both thumbs. */
  label: string;
  /** How one stop reads to a person: "Analyse", "6 marks". */
  format: (value: number) => string;
  /**
   * Tailwind text-colour class. The thumbs and the selected span of the track
   * are painted from `currentColor`, so one class tints the whole control.
   */
  accent?: string;
  disabled?: boolean;
}

/**
 * A two-handled range over a small, discrete axis — the cognitive tiers, or the
 * mark values a dot point actually uses.
 *
 * Built from two native `input[type=range]`s rather than pointer maths on a
 * div: arrow keys, Home/End, page keys and the screen-reader announcement all
 * come from the platform and stay correct. The paint is ours so the control can
 * match the picker it sits in, in both themes (see `.dual-range` in index.css).
 *
 * The handles are prevented from crossing, so the pair always reads as a valid
 * "from → to". With both stacked at one end only the top handle is draggable;
 * moving it frees the other, and keyboard focus reaches either one regardless.
 */
const RangeSlider: React.FC<RangeSliderProps> = ({
  min,
  max,
  step = 1,
  value,
  onChange,
  label,
  format,
  accent = 'text-indigo-400',
  disabled = false,
}) => {
  const labelId = useId();
  // A zero-width axis has nothing to choose between; guard the division rather
  // than let the fill become NaN% and disappear.
  const span = max - min || 1;
  const [low, high] = value;
  const leftPct = ((low - min) / span) * 100;
  const rightPct = ((high - min) / span) * 100;

  const setLow = useCallback(
    (raw: number) => onChange([Math.min(raw, high), high]),
    [high, onChange]
  );
  const setHigh = useCallback(
    (raw: number) => onChange([low, Math.max(raw, low)]),
    [low, onChange]
  );

  return (
    <div className={disabled ? 'opacity-50 pointer-events-none' : ''}>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span
          id={labelId}
          className="t-label text-[rgb(var(--color-text-muted))] light:text-slate-500"
        >
          {label}
        </span>
        <span className={`text-[11px] font-bold tabular-nums ${accent}`} aria-hidden="true">
          {low === high ? format(low) : `${format(low)} – ${format(high)}`}
        </span>
      </div>

      <div className={`dual-range relative h-5 ${accent}`}>
        {/* Track, and the selected span painted over it. */}
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-white/10 light:bg-slate-200" />
        <div
          className="absolute top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-current opacity-80"
          style={{ left: `${leftPct}%`, width: `${Math.max(rightPct - leftPct, 0)}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={low}
          disabled={disabled}
          onChange={(e) => setLow(Number(e.target.value))}
          aria-label={`${label}, lowest`}
          aria-valuetext={format(low)}
          style={{ zIndex: 3 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={high}
          disabled={disabled}
          onChange={(e) => setHigh(Number(e.target.value))}
          aria-label={`${label}, highest`}
          aria-valuetext={format(high)}
          style={{ zIndex: 4 }}
        />
      </div>
    </div>
  );
};

export default RangeSlider;
