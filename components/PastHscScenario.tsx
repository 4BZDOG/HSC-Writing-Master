import React from 'react';
import { CheckCircle2, Info, Loader2, Quote } from 'lucide-react';
import type { PromptVerb, ScenarioImageRef } from '../types';
import type { PastHscScenarioParts } from '../utils/pastHscScenario';
import { renderFormattedText } from '../utils/renderUtils';
import { useScenarioImage } from '../hooks/useScenarioImage';

/**
 * A past HSC question's scenario, drawn as the paper sets it out: instructions
 * as plain lines, the extract or stimulus as a quotation with its line breaks,
 * and NESA's criteria as the short list they are. See `splitPastHscScenario`.
 *
 * A stimulus the paper prints as a table, chart or slideshow comes with its
 * screenshot (`image`): the screenshot is drawn where the stimulus is, and the
 * text it was held as (which is what the marker reads) folds away under "Read
 * as text".
 */
const PastHscScenario: React.FC<{
  parts: PastHscScenarioParts;
  image?: ScenarioImageRef;
  keywords?: string[];
  verb?: PromptVerb;
  fontSize: number;
}> = ({ parts, image, keywords, verb, fontSize }) => {
  const { url, loading } = useScenarioImage(image);
  const stimulusText = parts.stimulus ? (
    <blockquote
      className="font-serif leading-relaxed text-[rgb(var(--color-text-primary))] light:text-slate-800 border-l-2 border-white/20 light:border-slate-300 pl-4 break-words"
      style={{ fontSize: `${fontSize}px` }}
    >
      {/* One line of the paper per block: the renderer draws each newline as one. */}
      {renderFormattedText(parts.stimulus.lines.join('\n'), keywords, verb)}
    </blockquote>
  ) : null;

  return (
    <div data-testid="past-hsc-scenario" className="space-y-5">
      {parts.instructions.length > 0 && (
        <div className="space-y-1.5">
          {parts.instructions.map((line) => (
            <p
              key={line}
              className="flex items-start gap-2 text-sm font-medium text-slate-200 light:text-slate-800"
            >
              <Info
                className="w-4 h-4 mt-0.5 shrink-0 text-slate-400 light:text-slate-500"
                aria-hidden="true"
              />
              <span>{line}</span>
            </p>
          ))}
        </div>
      )}

      {parts.context && (
        <div className="relative">
          <Quote
            className="absolute -top-3 -left-2 w-6 h-6 text-slate-500/20 light:text-slate-500/30 transform rotate-180 max-sm:hidden"
            aria-hidden="true"
          />
          <p
            className="text-[rgb(var(--color-text-primary))] light:text-slate-800 leading-relaxed font-serif italic pl-6 pr-2 break-words max-sm:pl-2.5"
            style={{ fontSize: `${fontSize}px` }}
          >
            {renderFormattedText(parts.context, keywords, verb)}
          </p>
        </div>
      )}

      {image ? (
        <figure data-testid="past-hsc-figure" className="space-y-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-6 text-muted">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              <span className="t-label">Loading stimulus…</span>
            </div>
          ) : url ? (
            <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
              <img
                src={url}
                alt={image.alt || 'Stimulus from the paper'}
                className="max-w-full h-auto rounded-lg border border-white/10 light:border-slate-300 bg-white"
              />
            </a>
          ) : (
            <p className="text-xs text-muted py-2">Image unavailable.</p>
          )}
          {stimulusText && (
            <details className="text-sm">
              <summary className="cursor-pointer t-label text-slate-400 light:text-slate-600">
                Read as text
              </summary>
              <div className="mt-2">{stimulusText}</div>
            </details>
          )}
        </figure>
      ) : (
        parts.stimulus && (
          <figure>
            <figcaption className="t-label text-slate-400 light:text-slate-600 mb-2">
              {parts.stimulus.label}
            </figcaption>
            {stimulusText}
          </figure>
        )
      )}

      {parts.sampleNote && (
        <p className="text-xs leading-relaxed text-slate-400 light:text-slate-600">
          <span className="font-semibold">About the sample answers:</span>{' '}
          {parts.sampleNote.replace(/^The sample answers below /, 'they ')}
        </p>
      )}

      {parts.assessedOn.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-slate-400 light:text-slate-600">
            Your answer will be assessed on how well you:
          </p>
          <ul className="mt-2 space-y-1.5">
            {parts.assessedOn.map((item) => (
              <li
                key={item}
                className="flex items-start gap-2 text-sm leading-snug text-slate-200 light:text-slate-800"
              >
                <CheckCircle2
                  className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400/80 light:text-emerald-600"
                  aria-hidden="true"
                />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default PastHscScenario;
