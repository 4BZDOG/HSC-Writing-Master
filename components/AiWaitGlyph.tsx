import React, { useEffect, useMemo, useState } from 'react';
import { getBandHex } from '../utils/renderUtils';
import type { AiTaskType } from './LoadingIndicator';

/**
 * The picture at the top of an AI wait — a small drawing of the work being
 * done, rather than a generic spinner.
 *
 * It replaced three concentric rings (a ping, a dashed orbit and a spinning
 * arc) that were the same for marking a response, writing a question and
 * parsing a syllabus, and that said nothing about any of them. Each task now
 * has its own:
 *
 *  - marking  — the band ladder (the app's own mark) with a marker's caret
 *               hopping between bands, weighing where the response sits;
 *  - writing  — lines of handwriting drawing themselves across ruled paper;
 *  - reading  — lines of text with a highlighter picking out words;
 *  - anything else — the ladder lighting up band by band.
 *
 * The marking and writing glyphs are generated, not canned: the caret takes a
 * random walk and each page of handwriting is a new scribble, so a long wait
 * does not loop the same two seconds. Randomness only chooses shapes; the
 * motion itself is CSS (index.css, `glyph-*`), transform and dash-offset only.
 *
 * Under `prefers-reduced-motion` nothing ticks: each glyph renders its finished
 * picture once (the keyframes end on it — see the note in index.css).
 */

const BANDS = [1, 2, 3, 4, 5, 6] as const;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined' &&
  !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A counter that advances after a delay chosen afresh each time — a steady
 * metronome is exactly the mechanical beat these glyphs exist to avoid.
 * Stops entirely under reduced motion.
 */
const useIrregularTick = (minMs: number, maxMs: number): number => {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      timer = setTimeout(
        () => {
          setTick((t) => t + 1);
          schedule();
        },
        minMs + Math.random() * (maxMs - minMs)
      );
    };
    schedule();
    return () => clearTimeout(timer);
  }, [minMs, maxMs]);
  return tick;
};

/* ------------------------------------------------------------------ marking */

/**
 * Next rung for the marker's caret: one or two bands either way, leaning back
 * towards the middle of the ladder so it hovers where most responses land and
 * visits the ends now and then — the look of someone weighing, not scanning.
 */
const nextBand = (from: number): number => {
  const pull = from > 4 ? -1 : from < 3 ? 1 : 0;
  const step = (Math.random() < 0.7 ? 1 : 2) * (Math.random() < 0.5 - pull * 0.2 ? -1 : 1);
  const to = Math.max(1, Math.min(6, from + step));
  return to === from ? Math.max(1, Math.min(6, from - step)) : to;
};

const WeighingLadder: React.FC = () => {
  const tick = useIrregularTick(520, 980);
  const [band, setBand] = useState(4);
  useEffect(() => {
    if (tick > 0) setBand((b) => nextBand(b));
  }, [tick]);
  const still = tick === 0 && prefersReducedMotion();

  return (
    <div className="relative w-[168px] pt-7">
      {/* The caret rides above the ladder to the rung under consideration.
          Keyed on the tick so each move replays its little hop. */}
      <div
        className="absolute top-0 left-0 w-[28px] flex justify-center transition-transform duration-500 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
        style={{ transform: `translateX(${(band - 1) * 28}px)` }}
      >
        <svg
          key={tick}
          width="14"
          height="16"
          viewBox="0 0 14 16"
          className="text-slate-700 dark:text-slate-200"
          style={{ animation: still ? undefined : 'glyph-hop 420ms ease-out' }}
        >
          <path d="M7 16 L1 5 A6 6 0 1 1 13 5 Z" fill="currentColor" />
          <circle cx="7" cy="5.5" r="2.2" fill={getBandHex(band)} />
        </svg>
      </div>
      <div className="flex gap-1">
        {BANDS.map((b) => {
          const lit = still || b === band;
          return (
            <span
              key={b}
              className="h-3 flex-1 origin-bottom transition-[transform,opacity] duration-500"
              style={{
                backgroundColor: getBandHex(b),
                opacity: lit ? 1 : 0.28,
                transform: lit && !still ? 'scaleY(1.9)' : 'scaleY(1)',
              }}
            />
          );
        })}
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ writing */

const RULES = [22, 46, 70];
const PAGE_WIDTH = 168;

/** Milliseconds of pen travel per pixel of handwriting. */
const INK_MS_PER_PX = 7;

interface Word {
  d: string;
  /** Where the word starts, as ms from the top of the page. */
  delay: number;
  duration: number;
}

const f = (n: number): string => n.toFixed(1);

/**
 * One letter-ish stroke, `w` wide, starting and ending on the baseline. A mix
 * of shapes — humps, loops, tall strokes, the odd descender — because a line
 * of identical arches reads as "mmmm" rather than as writing.
 */
const letter = (w: number): string => {
  const roll = Math.random();
  if (roll < 0.42) {
    const h = 3 + Math.random() * 3; // n, m, u
    return `q ${f(w / 2)} ${f(-h * 2)} ${f(w)} 0`;
  }
  if (roll < 0.66) {
    const h = 3 + Math.random() * 2; // e, a, o: a loop back over itself
    return `c ${f(w * 1.1)} ${f(-h * 1.9)} ${f(-w * 0.5)} ${f(-h * 1.9)} ${f(w)} 0`;
  }
  if (roll < 0.8) {
    const h = 9 + Math.random() * 4; // l, h, k, d
    return `c ${f(w * 0.9)} ${f(-h)} ${f(-w * 0.2)} ${f(-h * 1.1)} ${f(w)} 0`;
  }
  if (roll < 0.9) {
    const dsc = 5 + Math.random() * 3; // g, y, p
    return `q ${f(w / 2)} ${f(dsc * 2)} ${f(w)} 0`;
  }
  return `l ${f(w)} 0`; // the join between letters
};

/**
 * A page of pretend handwriting: each line a run of words, each word a run of
 * loops and strokes along the baseline with an occasional tall letter.
 *
 * Every word is its own path because SVG restarts a dash pattern at every
 * subpath — one path with pen-lifts in it would write all its words at once.
 * Separate paths, each delayed by where it sits, make one pen moving left to
 * right and down the page.
 */
const scribblePage = (): Word[] => {
  const words: Word[] = [];
  let clock = 0;
  RULES.forEach((rule, line) => {
    const baseline = rule - 2;
    const length = line === RULES.length - 1 ? 60 + Math.random() * 60 : 128 + Math.random() * 34;
    let x = 8;
    while (x < length) {
      const start = x;
      const end = Math.min(length, x + 16 + Math.random() * 30);
      let d = `M ${f(x)} ${baseline}`;
      while (x < end) {
        const w = 3 + Math.random() * 4;
        d += ` ${letter(w)}`;
        x += w;
      }
      const duration = (x - start) * INK_MS_PER_PX;
      words.push({ d, delay: clock, duration });
      clock += duration + 60; // the pen lifting between words
      x += 5 + Math.random() * 4;
    }
    clock += 180; // back to the margin for the next line
  });
  return words;
};

const WritingPage: React.FC<{ accent: string }> = ({ accent }) => {
  // Long enough for a full page (about three seconds of writing) and a beat
  // to look at it before the next one starts.
  const page = useIrregularTick(4200, 5000);
  // A new page of handwriting each time the tick turns over.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const words = useMemo(scribblePage, [page]);
  return (
    <svg
      width={PAGE_WIDTH}
      height="84"
      viewBox={`0 0 ${PAGE_WIDTH} 84`}
      className="overflow-visible"
      aria-hidden="true"
    >
      {/* Ruled lines, and the red margin every exam booklet has. */}
      {RULES.map((y) => (
        <line
          key={y}
          x1="0"
          x2={PAGE_WIDTH}
          y1={y}
          y2={y}
          className="stroke-slate-300 dark:stroke-slate-600"
          strokeWidth="1"
        />
      ))}
      <line x1="3" x2="3" y1="4" y2="80" stroke="#f87171" strokeOpacity="0.55" strokeWidth="1" />
      <g key={page} style={{ animation: 'glyph-settle 300ms ease-out' }}>
        {/* A forward slant, as a hand writes. An SVG attribute rather than CSS
            so it does not fight the settle animation for `transform`. */}
        <g transform="skewX(-10) translate(8 0)">
          {words.map((word, i) => (
            <path
              key={i}
              d={word.d}
              pathLength={1}
              fill="none"
              stroke={accent}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray="1 1"
              style={{
                strokeDashoffset: 1,
                animation: `glyph-write ${Math.round(word.duration)}ms ${Math.round(word.delay)}ms linear forwards`,
              }}
            />
          ))}
        </g>
      </g>
    </svg>
  );
};

/* ------------------------------------------------------------------ reading */

const ROWS = [14, 40, 66];

/** A row of word-shaped bars, and which of them the highlighter will pick. */
const wordsFor = (): { x: number; w: number; mark: boolean }[][] =>
  ROWS.map(() => {
    const words: { x: number; w: number; mark: boolean }[] = [];
    let x = 0;
    while (x < PAGE_WIDTH - 12) {
      const w = Math.min(PAGE_WIDTH - x, 12 + Math.random() * 30);
      words.push({ x, w, mark: Math.random() < 0.28 });
      x += w + 6;
    }
    return words;
  });

const HighlightedText: React.FC<{ accent: string }> = ({ accent }) => {
  const page = useIrregularTick(3200, 4200);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rows = useMemo(wordsFor, [page]);
  return (
    <svg
      key={page}
      width={PAGE_WIDTH}
      height="80"
      viewBox={`0 0 ${PAGE_WIDTH} 80`}
      aria-hidden="true"
      style={{ animation: 'glyph-settle 300ms ease-out' }}
    >
      {rows.map((words, r) =>
        words.map((word, i) => (
          <g key={`${r}-${i}`}>
            {word.mark && (
              <rect
                x={word.x - 2}
                y={ROWS[r] - 7}
                width={word.w + 4}
                height="14"
                rx="2"
                fill={accent}
                fillOpacity="0.32"
                style={{
                  transformBox: 'fill-box',
                  transformOrigin: 'left',
                  transform: 'scaleX(0)',
                  animation: `glyph-swipe 380ms ${400 + r * 700 + (word.x / PAGE_WIDTH) * 500}ms ease-out forwards`,
                }}
              />
            )}
            <rect
              x={word.x}
              y={ROWS[r] - 3}
              width={word.w}
              height="6"
              rx="3"
              className="fill-slate-300 dark:fill-slate-600"
            />
          </g>
        ))
      )}
    </svg>
  );
};

/* ------------------------------------------------------------------ default */

const LadderCascade: React.FC = () => (
  <div className="flex gap-1 w-[168px]" aria-hidden="true">
    {BANDS.map((b) => (
      <span
        key={b}
        className="h-3 flex-1 origin-bottom"
        style={{
          backgroundColor: getBandHex(b),
          animation: `glyph-cascade 2400ms ${b * 140}ms ease-in-out infinite both`,
        }}
      />
    ))}
  </div>
);

/* --------------------------------------------------------------------- glyph */

interface AiWaitGlyphProps {
  task: AiTaskType;
  /** Ink colour for the writing and highlighting glyphs. */
  accent: string;
}

const AiWaitGlyph: React.FC<AiWaitGlyphProps> = ({ task, accent }) => (
  <div className="h-[92px] flex items-center justify-center" aria-hidden="true">
    {task === 'evaluation' ? (
      <WeighingLadder />
    ) : task === 'generation' ? (
      <WritingPage accent={accent} />
    ) : task === 'enrichment' ? (
      <HighlightedText accent={accent} />
    ) : (
      <LadderCascade />
    )}
  </div>
);

export default AiWaitGlyph;
