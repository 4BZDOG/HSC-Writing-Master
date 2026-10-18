import React, { useEffect, useState } from 'react';
import BandLadderMark from './BandLadderMark';

/**
 * How long the page stays empty before the mark appears. A saved session
 * usually restores in well under this, and a mark that flashes up and away is
 * worse than a blank beat, so a fast restore never shows it at all.
 */
const MARK_DELAY_MS = 400;

/**
 * What the reader sees while a saved session is being restored: the app's mark
 * on the same background as every other screen, its rungs dipping in turn as a
 * quiet wait cue.
 *
 * It used to be `null`, which left a blank page for as long as the restore
 * took. The background is not rendered here: App.tsx draws the shared
 * `AnimatedBackground` beside this, because that component lives in App and
 * importing it back would make a cycle.
 *
 * The status line is for a screen reader only and comes with the mark, so an
 * empty page announces nothing.
 */
const BootSplash: React.FC = () => {
  const [showMark, setShowMark] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowMark(true), MARK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center">
      {showMark && (
        <div className="flex flex-col items-center gap-6">
          <BandLadderMark size="hero" animated />
          <p role="status" className="sr-only">
            Opening Band 6…
          </p>
        </div>
      )}
    </div>
  );
};

export default BootSplash;
