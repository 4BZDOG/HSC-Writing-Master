import React, { useId } from 'react';
import { getBandHex } from '../utils/renderUtils';
import { HSC_BAND_SHARES, HSC_RESULTS_CHART, HSC_RESULTS_YEAR } from '../data/hscResultsFacts';

/**
 * A quiet card showing how the published 2025 HSC results fell across the six
 * bands: one horizontal strip, Band 1 on the left to Band 6 on the right, each
 * segment as wide as its pooled share of results.
 *
 * It is shown only on reading waits (LoadingIndicator decides), and it says
 * what it is. Every number is ALL students' results pooled across courses. It
 * is not the reader's mark, and it does not predict one, so the card never
 * sits where it could be taken for a band the reader is about to get.
 *
 * The strip is decoration to a screen reader: the same six figures are read
 * from a visually-hidden list, and the visible legend is hidden because it says
 * the same thing. Colour is never the only channel: each segment is named in
 * the legend beside it, and the band numbers run in order.
 */
const HscResultsCard: React.FC = () => {
  const titleId = useId();

  return (
    <figure
      aria-labelledby={titleId}
      className="rounded-xl bg-surface-inset px-4 py-3.5 animate-fade-in"
    >
      <p id={titleId} className="t-label text-slate-800 dark:text-slate-200">
        How {HSC_RESULTS_YEAR} HSC results fell
      </p>

      <div aria-hidden="true" className="mt-3 flex h-3 gap-0.5 overflow-hidden rounded-full">
        {HSC_BAND_SHARES.map(({ band, share }, i) => (
          <span
            key={band}
            data-band={band}
            title={`Band ${band}: ${share}% of results`}
            className="h-full origin-left"
            style={{
              flexGrow: share,
              flexBasis: 0,
              backgroundColor: getBandHex(band),
              animation: `hsc-strip-grow 700ms ${i * 60}ms cubic-bezier(0.16, 1, 0.3, 1) both`,
            }}
          />
        ))}
      </div>

      <ul aria-hidden="true" className="mt-3 grid grid-cols-2 gap-x-5 gap-y-1.5 text-xs">
        {HSC_BAND_SHARES.map(({ band, share }) => (
          <li key={band} className="flex items-center gap-2 whitespace-nowrap">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: getBandHex(band) }}
            />
            <span className="text-slate-700 dark:text-slate-300">Band {band}</span>
            <span className="ml-auto tabular-nums font-medium text-slate-900 dark:text-slate-100">
              {share}%
            </span>
          </li>
        ))}
      </ul>

      <ul className="sr-only">
        {HSC_BAND_SHARES.map(({ band, share }) => (
          <li key={band}>
            Band {band}: {share}% of results
          </li>
        ))}
      </ul>

      <p className="mt-3 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        {HSC_RESULTS_CHART.caption}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600 dark:text-slate-400">
        Source:{' '}
        {HSC_RESULTS_CHART.sources.map((source) => (
          <a
            key={source.label}
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2 hover:text-slate-900 dark:hover:text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {source.label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        ))}
        . {HSC_RESULTS_CHART.pooling}
      </p>
    </figure>
  );
};

export default HscResultsCard;
