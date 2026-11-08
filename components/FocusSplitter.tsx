import React, { useRef } from 'react';
import { FOCUS_SPLIT_STEP } from '../utils/focusLayout';

interface FocusSplitterProps {
  /** The question card's rendered height in px. */
  valueNow: number;
  min: number;
  max: number;
  /** The id of the region the splitter sizes, for `aria-controls`. */
  controlsId: string;
  /** Sets the question card's height in px. */
  onResize: (px: number) => void;
  /** Returns the question card to fitting its own content. */
  onReset: () => void;
}

/**
 * The horizontal splitter between the question and the writing card in Focus
 * Mode. Dragging it sets how tall the question may be; the writing card takes the
 * rest. Hidden below `sm`, where the page simply scrolls.
 *
 * Pointer events with capture, not mouse events, so a touch drag on a tablet
 * works the same as a mouse drag. `touch-none` stops the browser scrolling the
 * page while the handle is being dragged.
 */
const FocusSplitter: React.FC<FocusSplitterProps> = ({
  valueNow,
  min,
  max,
  controlsId,
  onResize,
  onReset,
}) => {
  const drag = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(null);
  const clamp = (px: number) => Math.round(Math.min(Math.max(px, min), max));

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
      aria-orientation="horizontal"
      aria-label="Resize question and writing area"
      aria-valuenow={Math.round(valueNow)}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-controls={controlsId}
      tabIndex={0}
      title="Drag to resize. Double-click to reset."
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { pointerId: e.pointerId, startY: e.clientY, startHeight: valueNow };
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.pointerId !== e.pointerId) return;
        onResize(clamp(d.startHeight + (e.clientY - d.startY)));
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={onReset}
      onKeyDown={(e) => {
        let next: number | null = null;
        if (e.key === 'ArrowUp') next = valueNow - FOCUS_SPLIT_STEP;
        else if (e.key === 'ArrowDown') next = valueNow + FOCUS_SPLIT_STEP;
        else if (e.key === 'Home') next = min;
        else if (e.key === 'End') next = max;
        if (next === null) return;
        e.preventDefault();
        onResize(clamp(next));
      }}
      className="group relative hidden sm:flex h-6 w-full max-w-5xl mx-auto shrink-0 cursor-row-resize touch-none select-none items-center justify-center rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--color-accent))]"
    >
      {/* The hairline is the seam the eye reads; the grip is the handle. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-[rgb(var(--color-border-secondary))]/30 light:bg-slate-400 transition-colors group-hover:bg-[rgb(var(--color-border-secondary))]/60 group-focus-visible:bg-[rgb(var(--color-accent))]"
      />
      <span
        aria-hidden="true"
        className="relative flex h-1.5 w-14 rounded-full border border-[rgb(var(--color-border-secondary))]/60 light:border-slate-500 bg-[rgb(var(--color-bg-surface-elevated))] light:bg-white opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </div>
  );
};

export default FocusSplitter;
