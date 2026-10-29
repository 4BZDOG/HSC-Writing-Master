import React from 'react';

interface AlternativesListProps {
  /** Alternatives, each a list of points (see `criterionParts`). */
  parts: string[][];
  /** Draws one point; plain text when left out. */
  renderPoint?: (point: string) => React.ReactNode;
}

/**
 * Two or more ways to reach the same mark, set the way NESA prints them: each
 * point a bullet, and "OR" on a rule of its own between the alternatives.
 *
 * Written on one line ("Three clear points OR two points + one relevant example
 * OR a simple cause-effect link") the alternatives run on as one sentence, and a
 * student reads them as one requirement. Shared by the marking guide's rows and
 * the full-mark expectation in the outcome brief and the verb guide.
 */
const AlternativesList: React.FC<AlternativesListProps> = ({
  parts,
  renderPoint = (point) => point,
}) => (
  <div className="space-y-1.5">
    {parts.map((points, a) => (
      <React.Fragment key={a}>
        {a > 0 && (
          <p className="flex items-center gap-2 t-label text-slate-600 dark:text-slate-400">
            <span>OR</span>
            <span aria-hidden="true" className="h-px flex-1 bg-current opacity-25" />
          </p>
        )}
        <ul className="space-y-1">
          {points.map((point, i) => (
            <li key={i} className="flex gap-2">
              <span
                aria-hidden="true"
                className="mt-[0.7em] size-1 shrink-0 rounded-full bg-current opacity-60"
              />
              <span className="min-w-0">{renderPoint(point)}</span>
            </li>
          ))}
        </ul>
      </React.Fragment>
    ))}
  </div>
);

export default AlternativesList;
