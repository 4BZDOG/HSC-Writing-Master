import React, { useState } from 'react';

/**
 * The drifting colour behind the app and the signed-out screens.
 *
 * DesignSpec §1 asks for "Aurora Motion: deep-layer animated blobs in the
 * background to prevent a static feel". What it had was four identical circles
 * on one 10-second loop, two seconds apart, so the whole sky lurched the same
 * way every ten seconds. Here each orb has its own path, its own long duration
 * and a random starting point, so the composition drifts without a visible
 * beat and differs from one visit to the next. The keyframes and the reason
 * for their numbers are in index.css (`aurora-drift-*`).
 *
 * The palette is the band palette's cool end — indigo, sky, violet — with one
 * low emerald, the Band 4 green, so the background is made of the same colours
 * a student's progress is. Each theme has its own weights and blend mode:
 * `screen` lifts a dark ground and `multiply` deepens a light one, and neither
 * does anything on the other's.
 */

type Path = 'a' | 'b' | 'c';

/** An `r, g, b` triplet and the alpha at the orb's heart. */
type Ink = [r: number, g: number, b: number, alpha: number];

interface Orb {
  /** Tailwind position and size. The gradient fades to nothing at the box's
   *  edge, so the box IS the orb's full extent. */
  box: string;
  /** Colour and strength, per theme. */
  dark: Ink;
  light: Ink;
  path: Path;
  /** Seconds. All different, so no two orbs fall into step. */
  seconds: number;
}

// Tailwind's palette, as numbers: indigo-500, sky-500, violet-600,
// fuchsia-600, emerald-500 on the dark ground; their -200s on the light.
const APP_ORBS: Orb[] = [
  {
    box: '-top-[22vh] -left-[16vw] w-[64vw] h-[64vw] max-w-[900px] max-h-[900px] min-w-[460px] min-h-[460px]',
    dark: [99, 102, 241, 0.4],
    light: [199, 210, 254, 0.7],
    path: 'a',
    seconds: 43,
  },
  {
    box: '-top-[16vh] -right-[18vw] w-[56vw] h-[56vw] max-w-[800px] max-h-[800px] min-w-[420px] min-h-[420px]',
    dark: [14, 165, 233, 0.28],
    light: [186, 230, 253, 0.7],
    path: 'b',
    seconds: 37,
  },
  {
    box: '-bottom-[30vh] left-[0vw] w-[60vw] h-[60vw] max-w-[860px] max-h-[860px] min-w-[460px] min-h-[460px]',
    dark: [124, 58, 237, 0.34],
    light: [221, 214, 254, 0.6],
    path: 'c',
    seconds: 53,
  },
  {
    box: '-bottom-[32vh] -right-[14vw] w-[48vw] h-[48vw] max-w-[700px] max-h-[700px] min-w-[380px] min-h-[380px]',
    dark: [192, 38, 211, 0.2],
    light: [245, 208, 254, 0.5],
    path: 'a',
    seconds: 61,
  },
  {
    box: 'top-[30vh] left-[34vw] w-[32vw] h-[32vw] max-w-[460px] max-h-[460px] min-w-[260px] min-h-[260px]',
    dark: [16, 185, 129, 0.12],
    light: [167, 243, 208, 0.4],
    path: 'b',
    seconds: 29,
  },
];

/** The signed-out screens: two orbs, slower, behind a card rather than a workspace. */
const AUTH_ORBS: Orb[] = [
  {
    box: '-top-48 -left-44 w-[46rem] h-[46rem]',
    dark: [79, 70, 229, 0.3],
    light: [165, 180, 252, 0.6],
    path: 'a',
    seconds: 47,
  },
  {
    box: '-bottom-56 -right-40 w-[44rem] h-[44rem]',
    dark: [14, 165, 233, 0.24],
    light: [125, 211, 252, 0.55],
    path: 'c',
    seconds: 59,
  },
];

/**
 * A soft orb as a radial gradient, not a solid circle under `filter: blur`.
 * Large blur radii are rasterised in tiles, and at these sizes the tiles
 * showed: hard vertical seams through the glow. A gradient has no tiles, costs
 * nothing to move, and lets the falloff be shaped — full strength at the heart,
 * half by the middle, nothing at the rim.
 */
const orbFill = ([r, g, b, a]: Ink): string =>
  `radial-gradient(closest-side, rgba(${r},${g},${b},${a}) 0%, ` +
  `rgba(${r},${g},${b},${(a * 0.45).toFixed(3)}) 50%, rgba(${r},${g},${b},0) 100%)`;

const OrbLayer: React.FC<{
  orbs: Orb[];
  theme: 'dark' | 'light';
  delays: number[];
}> = ({ orbs, theme, delays }) => (
  <div className={`absolute inset-0 ${theme === 'dark' ? 'light:hidden' : 'hidden light:block'}`}>
    {orbs.map((orb, i) => (
      <div
        key={i}
        className={`absolute rounded-full will-change-transform ${orb.box} ${
          theme === 'dark' ? 'mix-blend-screen' : 'mix-blend-multiply'
        }`}
        style={{
          backgroundImage: orbFill(theme === 'dark' ? orb.dark : orb.light),
          animation: `aurora-drift-${orb.path} ${orb.seconds}s ease-in-out infinite`,
          // A negative delay starts the orb part-way through its cycle, so the
          // first frame is already a composition rather than every orb at rest.
          animationDelay: `-${delays[i]}s`,
        }}
      />
    ))}
  </div>
);

const AmbientAurora: React.FC<{ variant?: 'app' | 'auth' }> = ({ variant = 'app' }) => {
  const orbs = variant === 'auth' ? AUTH_ORBS : APP_ORBS;
  // Chosen once per mount: a different sky each visit, a steady one within it.
  const [delays] = useState(() => orbs.map((orb) => Math.random() * orb.seconds));
  return (
    <div className="aurora absolute inset-0" aria-hidden="true">
      <OrbLayer orbs={orbs} theme="dark" delays={delays} />
      <OrbLayer orbs={orbs} theme="light" delays={delays} />
    </div>
  );
};

export default AmbientAurora;
