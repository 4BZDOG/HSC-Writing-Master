import React from 'react';
import AuthBandPreview from './AuthBandPreview';

/**
 * The three things the product does, in the order a student meets them. Each
 * line is true of the app as it stands: past papers and syllabus-matched
 * questions, the writing screen with its live readiness and exam mode, and a
 * mark with a band and reasoning. Nothing here is a statistic.
 *
 * On a phone it sits under the card, so the form is the first thing on screen.
 */
const STEPS: { title: string; body: string }[] = [
  {
    title: 'Pick a question',
    body: 'Real past HSC papers, and questions matched to the syllabus dot points.',
  },
  {
    title: 'Write with a coach beside you',
    body: 'Live readiness and draft checks while you write. Or switch to exam mode for a countdown and no live feedback.',
  },
  {
    title: 'See it marked against the NESA band descriptors',
    body: 'A mark, a band and the reasoning behind both, with what to change to reach the next band.',
  },
];

const AuthHowItWorks: React.FC<{ className?: string }> = ({ className }) => (
  <section aria-labelledby="how-it-works-title" className={className}>
    <h2
      id="how-it-works-title"
      className="text-sm font-bold text-slate-300 light:text-slate-800 mb-5 text-center lg:text-left"
    >
      How it works
    </h2>
    <ol className="space-y-5 max-w-md mx-auto lg:mx-0">
      {STEPS.map((step, index) => (
        <li key={step.title} className="flex gap-4">
          <span
            aria-hidden="true"
            className="shrink-0 w-8 h-8 rounded-xl border-2 border-white/15 light:border-slate-500 flex items-center justify-center font-mono text-xs font-bold text-slate-300 light:text-slate-800 tabular-nums"
          >
            {index + 1}
          </span>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white light:text-slate-900 leading-snug">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-slate-400 light:text-slate-600 mt-1">
              {step.body}
            </p>
            {index === 2 && (
              <>
                <AuthBandPreview band={4} />
                <p className="text-[11px] text-slate-500 light:text-slate-600 mt-2">
                  Illustrative: a Band 4 answer, with the next band up dashed.
                </p>
              </>
            )}
          </div>
        </li>
      ))}
    </ol>
  </section>
);

export default AuthHowItWorks;
