import React, { useId } from 'react';
import { ReadinessResult, getReadinessChroma } from '../utils/draftReadiness';

interface ReadinessMeterProps {
  readiness: ReadinessResult;
  /** Drop the word label and show just the bar + percentage, for tight rows. */
  compact?: boolean;
  className?: string;
}

/**
 * A slim, live "draft readiness" meter: a track that fills as the draft becomes
 * more complete, climbing the app's six-step band COLOUR palette purely as a
 * familiar visual language.
 *
 * It is deliberately NOT a band or a predicted mark — the colour only ever
 * signals mechanical completeness (see utils/draftReadiness.ts) and it is never
 * shown alone: the numeric `%` and a completeness WORD ("Getting there") always
 * travel with the hue, and the whole control is a `role="progressbar"`. An empty
 * draft sits at a calm slate (level 0, "Start writing"), never band-1 red.
 *
 * Colour comes exclusively from `getReadinessChroma`, which delegates to the
 * canonical `getBandConfig` — so light/dark/print variants and AA contrast come
 * for free and no band colour is hard-coded here. The hue is confined to the
 * fill and the track; the text sits on the panel background using theme tokens,
 * so body-text contrast is never affected.
 */
const ReadinessMeter: React.FC<ReadinessMeterProps> = React.memo(
  ({ readiness, compact = false, className = '' }) => {
    // Colour from chromaLevel (capped at the question's target band); the % and
    // label come from score/label (the uncapped completeness progression).
    const { score, label, chromaLevel } = readiness;
    const chroma = getReadinessChroma(chromaLevel);
    const barId = useId();

    return (
      <div
        className={`flex items-center gap-2.5 print:hidden ${className}`}
        // print:hidden — a live pre-submission signal has no place on paper.
      >
        {!compact && (
          <span className="text-[10px] font-bold uppercase tracking-wider text-[rgb(var(--color-text-muted))] light:text-slate-600 whitespace-nowrap">
            {label}
          </span>
        )}
        <div
          id={barId}
          role="progressbar"
          aria-valuenow={score}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Draft readiness: ${label}, ${score}%`}
          className="relative h-1.5 w-16 sm:w-20 rounded-full overflow-hidden bg-slate-200/80 dark:bg-white/10 shrink-0"
        >
          {/* Fill: the band-config gradient for levels 1–6, slate for level 0.
              A short transition keeps the climb smooth; reduced-motion turns it
              off so nothing animates for a student who has asked for stillness. */}
          <div
            className={`absolute inset-y-0 left-0 rounded-full bg-gradient-to-r ${chroma.config.gradient} transition-all duration-500 ease-out motion-reduce:transition-none`}
            style={{ width: `${score}%` }}
          />
        </div>
        <span className="text-[10px] font-bold font-mono tabular-nums text-[rgb(var(--color-text-muted))] light:text-slate-600 shrink-0">
          {score}%
        </span>
      </div>
    );
  }
);

ReadinessMeter.displayName = 'ReadinessMeter';
export default ReadinessMeter;
