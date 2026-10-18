import React, { useEffect, useState } from 'react';
import BandLadderMark from './BandLadderMark';

/**
 * How long a read may run before anything shows. A local read that finishes
 * inside this window shows nothing at all, so a fast fetch does not flash a
 * mark on and off.
 */
const SHOW_DELAY_MS = 250;

interface DataLoadingProps {
  /** What is being read, in the reader's words: "Loading usage". */
  label: string;
  className?: string;
}

/**
 * The wait for a local data read: a dataset from IndexedDB, the usage counters,
 * a backup listing. It is not an AI wait, so it does not use LoadingIndicator's
 * steps, clock and notes. AI waits use LoadingIndicator; a local read is not
 * one, and gets the app's mark and a single line instead. The mark is the same
 * ladder the boot screen shows while a saved session is restored (BootSplash),
 * so the admin's data wait looks like the rest of the app opening.
 *
 * The placeholder keeps its height from the first frame, so the panel does not
 * jump when the status appears or when the data does. Nothing is rendered in
 * the first 250ms, so a read that is already done never shows the mark.
 */
const DataLoading: React.FC<DataLoadingProps> = ({ label, className }) => {
  const [showStatus, setShowStatus] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowStatus(true), SHOW_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // The live region is there from the first frame and only its contents wait.
  // A region inserted already holding its text is often not announced at all,
  // which would leave a screen reader as silent as the delay leaves the eye.
  return (
    <div role="status" aria-live="polite" className="min-h-[8rem]">
      {showStatus && (
        <div
          className={`flex flex-col items-center justify-center gap-3 py-10 text-center ${className ?? ''}`}
        >
          <BandLadderMark size="compact" animated />
          <p className="text-sm text-slate-600 dark:text-slate-300">{label}</p>
        </div>
      )}
    </div>
  );
};

export default DataLoading;
