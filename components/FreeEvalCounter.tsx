import React, { useSyncExternalStore } from 'react';
import { Lock } from 'lucide-react';
import { freeEvalLimit, freeEvalsRemaining, subscribeEvalCount } from '../services/entitlements';

/**
 * "3/5 left" — the free tier's remaining daily markings, stated where the
 * student can actually see it.
 *
 * This used to live in the Evaluate button's `title` attribute. A tooltip is
 * not a limit anyone can plan around: a phone has no hover at all, and most
 * students are on one, so the majority of the people the limit applies to only
 * discovered it as a refusal — after writing an answer and waiting out the
 * marking call. A paywall you can see coming is a feature; one that ambushes
 * you at the end of a draft is a bug.
 *
 * Renders NOTHING for anyone not metered (paid plans, staff, admins, and any
 * deployment with monetisation switched off), because `freeEvalsRemaining`
 * answers Infinity for them — there is no number to state and no limit to warn
 * about.
 *
 * The count lives in localStorage, which React cannot observe, so it is read
 * through `subscribeEvalCount`: it moves after a marking run, after the server
 * corrects the mirror on a refusal, and after the sign-in reconciliation, none
 * of which this component would otherwise hear about.
 */
const FreeEvalCounter: React.FC<{ className?: string }> = ({ className = '' }) => {
  const remaining = useSyncExternalStore(subscribeEvalCount, freeEvalsRemaining, () =>
    freeEvalsRemaining()
  );

  if (remaining === Infinity) return null;

  const limit = freeEvalLimit();
  // Colour is the fast signal, but never the ONLY one: the number (or "0 left
  // today") is always spelled out, so the state survives a colour-blind reader
  // and a greyscale print alike.
  const tone =
    remaining === 0
      ? 'bg-red-500/10 border-red-500/30 text-red-400 light:text-red-600'
      : remaining <= 1
        ? 'bg-amber-400/15 border-amber-400/40 text-amber-500 light:text-amber-600'
        : 'bg-white/5 light:bg-slate-100 border-white/10 light:border-slate-300 text-[rgb(var(--color-text-muted))] light:text-slate-600';

  return (
    <span
      data-testid="free-eval-counter"
      title={
        remaining === 0
          ? `You have used all ${limit} free evaluations for today. The allowance resets at midnight UTC.`
          : `Free plan: ${remaining} of ${limit} daily evaluations left. Resets at midnight UTC.`
      }
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border flex-shrink-0 tabular-nums ${tone} ${className}`}
    >
      {remaining === 0 ? (
        <>
          <Lock className="w-2.5 h-2.5" aria-hidden="true" /> 0 left today
        </>
      ) : (
        <>
          {remaining}/{limit} left
        </>
      )}
    </span>
  );
};

export default FreeEvalCounter;
