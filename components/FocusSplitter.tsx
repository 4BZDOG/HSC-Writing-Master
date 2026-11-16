import React, { useRef } from 'react';
import { FOCUS_SIDE_PERCENT_STEP, FOCUS_SPLIT_STEP } from '../utils/focusLayout';

interface FocusSplitterProps {
  /**
   * `horizontal` (the default) sits between the stacked cards and sets the
   * question card's height in px. `vertical` stands between the two columns of
   * the side-by-side arrangement and sets the question column's share in percent.
   */
  orientation?: 'horizontal' | 'vertical';
  /** The question card's height in px, or its column's share in percent. */
  valueNow: number;
  min: number;
  max: number;
  /** The id of the region the splitter sizes, for `aria-controls`. */
  controlsId: string;
  /** Sets the question card's height (px) or its column's share (percent). */
  onResize: (value: number) => void;
  /** Returns the question card to its default size. */
  onReset: () => void;
  /** Vertical only: the row the two columns share, to turn a drag into a percentage. */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Horizontal only: the width classes of the column it sits in. */
  className?: string;
}

/**
 * The splitter between the question and the writing card in Focus Mode.
 * Dragging it sets how much room the question takes; the writing card takes the
 * rest. Hidden below `sm`, where the page simply scrolls.
 *
 * Pointer events with capture, not mouse events, so a touch drag on a tablet
 * works the same as a mouse drag. `touch-none` stops the browser scrolling the
 * page while the handle is being dragged.
 */
const FocusSplitter: React.FC<FocusSplitterProps> = ({
  orientation = 'horizontal',
  valueNow,
  min,
  max,
  controlsId,
  onResize,
  onReset,
  containerRef,
  className = 'max-w-5xl mx-auto w-full',
}) => {
  const vertical = orientation === 'vertical';
  const drag = useRef<{ pointerId: number; start: number; startValue: number } | null>(null);
  const clamp = (value: number) => Math.round(Math.min(Math.max(value, min), max));
  const step = vertical ? FOCUS_SIDE_PERCENT_STEP : FOCUS_SPLIT_STEP;

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current?.pointerId !== e.pointerId) return;
    drag.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  return (
    <div
      role="separator"
      // The orientation of the LINE, per ARIA: a bar between two columns is vertical.
      aria-orientation={orientation}
      aria-label="Resize question and writing area"
      aria-valuenow={Math.round(valueNow)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuetext={vertical ? `Question ${Math.round(valueNow)}% of the width` : undefined}
      aria-controls={controlsId}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = {
          pointerId: e.pointerId,
          start: vertical ? e.clientX : e.clientY,
          startValue: valueNow,
        };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        if (!vertical) {
          onResize(clamp(d.startValue + (e.clientY - d.start)));
          return;
        }
        const width = containerRef?.current?.getBoundingClientRect().width ?? 0;
        if (width <= 0) return;
        onResize(clamp(d.startValue + ((e.clientX - d.start) / width) * 100));
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        let next: number | null = null;
        if (e.key === (vertical ? 'ArrowLeft' : 'ArrowUp')) next = valueNow - step;
        else if (e.key === (vertical ? 'ArrowRight' : 'ArrowDown')) next = valueNow + step;
        else if (e.key === 'Home') next = min;
        else if (e.key === 'End') next = max;
        if (next === null) return;
        e.preventDefault();
        onResize(clamp(next));
      }}
      className={`group relative shrink-0 touch-none select-none items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))] ${
        vertical
          ? 'flex w-6 self-stretch cursor-col-resize sticky top-4'
          : `hidden sm:flex h-6 cursor-row-resize ${className}`
      }`}
    >
      {/* The hairline is the seam the eye reads; the grip is the handle. */}
      <span
        aria-hidden="true"
        className={`absolute bg-[rgb(var(--color-border-secondary))]/30 light:bg-slate-400 transition-colors group-hover:bg-[rgb(var(--color-border-secondary))]/60 group-focus-visible:bg-[rgb(var(--color-accent))] ${
          vertical
            ? 'inset-y-6 left-1/2 w-px -translate-x-1/2'
            : 'inset-x-0 top-1/2 h-px -translate-y-1/2'
        }`}
      />
      <span
        aria-hidden="true"
        className={`relative flex rounded-full border border-[rgb(var(--color-border-secondary))]/60 light:border-slate-500 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${
          // The column grip stays faintly visible: a bar between two cards is not
          // an obvious handle the way the seam under a card is.
          vertical ? 'h-14 w-1.5 opacity-60' : 'h-1.5 w-14 opacity-0'
        }`}
      />
    </div>
  );
};

export default FocusSplitter;
