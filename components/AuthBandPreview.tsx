import React from 'react';
import { getBandConfig } from '../utils/renderUtils';

/**
 * A decorative sketch of a marked answer on the band scale: the rungs up to
 * the answer's band are filled in the app's band colours, and the next rung up
 * is drawn dashed, the step the "what to change" advice points at.
 *
 * It is an illustration, not a result, so it is hidden from assistive
 * technology and the caption beside it says so.
 */
const RUNGS = [1, 2, 3, 4, 5, 6];

const AuthBandPreview: React.FC<{ band?: number }> = ({ band = 4 }) => (
  <div aria-hidden="true" className="mt-4 flex items-end gap-2 max-w-[15rem]">
    {RUNGS.map((rung) => {
      const cfg = getBandConfig(rung);
      const reached = rung <= band;
      const next = rung === band + 1;
      const isMarked = rung === band;
      return (
        <div key={rung} className="flex-1 flex flex-col items-center gap-1.5">
          {/* The caret sits over the answer's own band. */}
          <span
            className={`block w-2 h-2 rotate-45 bg-current transition-opacity ${
              isMarked ? 'text-white light:text-slate-900 opacity-100' : 'opacity-0'
            }`}
          />
          <span
            className={`block w-full rounded-lg ${
              reached
                ? cfg.solidBg
                : next
                  ? `border-2 border-dashed ${cfg.border} bg-transparent`
                  : 'bg-[rgb(var(--color-bg-surface-light))] light:bg-slate-300'
            }`}
            style={{ height: `${10 + rung * 5}px` }}
          />
          <span className="font-mono text-[11px] text-slate-500 light:text-slate-600 tabular-nums">
            {rung}
          </span>
        </div>
      );
    })}
  </div>
);

export default AuthBandPreview;
