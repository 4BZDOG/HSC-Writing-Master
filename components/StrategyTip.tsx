import React, { useMemo } from 'react';
import { parseStrategyTip } from '../utils/strategyTip';

interface StrategyTipProps {
  tip?: string | null;
  /** Tailwind text-colour class for the bullet markers and term chips. */
  accentClass?: string;
  className?: string;
}

/**
 * A command term's writing tip, rendered as an indented bullet list with its
 * examples set apart. Shared by the editor's strategy panel and the command
 * verb guide so the same tip never reads two different ways.
 */
const StrategyTip: React.FC<StrategyTipProps> = ({
  tip,
  accentClass = 'text-amber-400/80',
  className = '',
}) => {
  const segments = useMemo(() => parseStrategyTip(tip), [tip]);
  if (segments.length === 0) return null;

  return (
    <ul className={`space-y-2 ${className}`} role="list">
      {segments.map((segment, i) => {
        // Examples and term lists belong to the point above them, so they are
        // indented past the bullet column rather than given a bullet of their own.
        if (segment.kind === 'example') {
          return (
            <li key={i} className="ml-5 list-none">
              <span className="block border-l-2 border-current/25 pl-3 py-0.5 text-xs italic text-[rgb(var(--color-text-secondary))] light:text-slate-600">
                {segment.text}
              </span>
            </li>
          );
        }

        if (segment.kind === 'terms') {
          return (
            <li key={i} className="ml-5 list-none">
              <span className="flex flex-wrap gap-1.5">
                {segment.items.map((item) => (
                  <span
                    key={item}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold tracking-wide bg-white/[0.06] light:bg-slate-100 border border-white/10 light:border-slate-200 ${accentClass}`}
                  >
                    {item}
                  </span>
                ))}
              </span>
            </li>
          );
        }

        return (
          <li key={i} className="flex items-start gap-2.5">
            <span
              aria-hidden="true"
              className={`mt-[0.45rem] w-1 h-1 rounded-full flex-shrink-0 bg-current ${accentClass}`}
            />
            {/* The muted token, with nothing overriding it. `light:text-slate-500`
                used to sit here and made the light theme LIGHTER than the theme
                asked for: `--color-text-muted` already resolves to slate-600
                under `[data-theme="light"]`. On white that override cost a
                little margin; on the verb ribbon's tier wash, where this tip is
                also rendered, it measured 4.15:1 against a 4.5 floor, and the
                token reads 6.35:1 in the same place. */}
            <span className="text-xs leading-relaxed text-[rgb(var(--color-text-muted))]">
              {segment.text}
            </span>
          </li>
        );
      })}
    </ul>
  );
};

export default StrategyTip;
