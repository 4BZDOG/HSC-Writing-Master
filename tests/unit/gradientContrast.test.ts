import { describe, it, expect } from 'vitest';
import {
  parseCssColour,
  parseBackgroundImage,
  sampleStops,
  resolveGrounds,
  worstContrast,
  contrastRatio,
  over,
  splitTopLevel,
  Paint,
} from '../e2e/support/gradientMath';

/**
 * The arithmetic behind measureGradientContrast (tests/e2e/support/gradientMath.ts).
 * Pure, so it runs here in milliseconds and the e2e spec only has to trust it.
 *
 * The strings below are what getComputedStyle returns in Chromium, which is the
 * form the harness actually receives: rgb()/rgba() colours, and gradients that
 * keep their direction and position arguments.
 */

const WHITE = 'rgb(255, 255, 255)';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';
const opaque = (color: string) => ({ backgroundColor: color, backgroundImage: 'none' });
const gradient = (image: string) => ({ backgroundColor: TRANSPARENT, backgroundImage: image });

describe('parseCssColour', () => {
  it('reads rgb() and rgba() in the comma form computed styles use', () => {
    expect(parseCssColour('rgb(255, 255, 255)')).toEqual({ rgb: [255, 255, 255], a: 1 });
    expect(parseCssColour('rgba(15, 23, 42, 0.5)')).toEqual({ rgb: [15, 23, 42], a: 0.5 });
  });

  it('reads the space-and-slash form and percentage alpha authored in CSS', () => {
    expect(parseCssColour('rgb(99 102 241 / 0.25)')).toEqual({ rgb: [99, 102, 241], a: 0.25 });
    expect(parseCssColour('rgb(0 0 0 / 50%)')).toEqual({ rgb: [0, 0, 0], a: 0.5 });
  });

  it('reads hex in its three, four, six and eight digit forms', () => {
    expect(parseCssColour('#fff')).toEqual({ rgb: [255, 255, 255], a: 1 });
    expect(parseCssColour('#0f172a')).toEqual({ rgb: [15, 23, 42], a: 1 });
    expect(parseCssColour('#00000080')?.a).toBeCloseTo(128 / 255, 6);
  });

  it('reads transparent as an invisible black', () => {
    expect(parseCssColour('transparent')).toEqual({ rgb: [0, 0, 0], a: 0 });
  });

  it('refuses colour forms it cannot read, rather than guessing a value', () => {
    expect(parseCssColour('oklch(0.7 0.1 250)')).toBeNull();
    expect(parseCssColour('hsl(210 40% 50%)')).toBeNull();
    expect(parseCssColour('color-mix(in srgb, red 50%, blue)')).toBeNull();
    expect(parseCssColour('rgb(1, 2)')).toBeNull();
  });
});

describe('splitTopLevel', () => {
  it('does not split on commas inside parentheses', () => {
    expect(splitTopLevel('linear-gradient(to right, red, blue), url("a,b.png")')).toEqual([
      'linear-gradient(to right, red, blue)',
      'url("a,b.png")',
    ]);
  });
});

describe('parseBackgroundImage', () => {
  it('reads none as no layers', () => {
    expect(parseBackgroundImage('none')).toEqual({ layers: [] });
  });

  it('reads a computed linear gradient with its direction and rgb stops', () => {
    const parsed = parseBackgroundImage(
      'linear-gradient(to right, rgb(168, 85, 247) 0%, rgb(192, 132, 252) 100%)'
    );
    expect('layers' in parsed && parsed.layers[0].stops.map((s) => s.rgb)).toEqual([
      [168, 85, 247],
      [192, 132, 252],
    ]);
  });

  it('skips radial geometry, including sizes and an "at" position', () => {
    const parsed = parseBackgroundImage(
      'radial-gradient(ellipse 90% 55% at 50% -10%, rgba(99, 102, 241, 0.22), transparent 60%)'
    );
    expect('layers' in parsed && parsed.layers[0].stops).toHaveLength(2);
  });

  it('reads colour hints (a bare position between stops) without treating them as colours', () => {
    const parsed = parseBackgroundImage(
      'linear-gradient(90deg, rgb(0, 0, 0), 50%, rgb(255, 255, 255))'
    );
    expect('layers' in parsed && parsed.layers[0].stops).toHaveLength(2);
  });

  it('reads a stack of layers, each with its own stops', () => {
    const parsed = parseBackgroundImage(
      'linear-gradient(rgba(148, 163, 184, 0.16) 1px, transparent 1px), radial-gradient(circle, rgb(0, 0, 0), rgb(255, 255, 255))'
    );
    expect('layers' in parsed && parsed.layers.map((l) => l.stops.length)).toEqual([2, 2]);
  });

  it('ignores a none layer beside a real gradient, which is how a header is painted', () => {
    // The band header's computed image: a translucent wash, then a `none` layer.
    const parsed = parseBackgroundImage(
      'linear-gradient(90deg, rgba(0, 0, 0, 0) 40%, rgba(0, 0, 0, 0.2) 100%), none'
    );
    expect('layers' in parsed && parsed.layers).toHaveLength(1);
  });

  it('reports a url() image as unassessable, with the reason', () => {
    const parsed = parseBackgroundImage('url("data:image/png;base64,AAAA")');
    expect(parsed).toEqual({ unassessable: expect.stringContaining('not a gradient') });
  });

  it('reports a gradient stop in a colour space it cannot read as unassessable', () => {
    const parsed = parseBackgroundImage('linear-gradient(oklch(0.7 0.1 250), white)');
    expect(parsed).toEqual({ unassessable: expect.stringContaining('oklch') });
  });

  it('reports a gradient with no colour stops as unassessable', () => {
    expect(parseBackgroundImage('linear-gradient(to right, 50%)')).toEqual({
      unassessable: 'gradient has no colour stops',
    });
  });
});

describe('sampleStops', () => {
  const black: Paint = { rgb: [0, 0, 0], a: 1 };
  const clear: Paint = { rgb: [0, 0, 0], a: 0 };

  it('includes every stop itself, and interpolations between neighbours', () => {
    const samples = sampleStops([black, { rgb: [255, 255, 255], a: 1 }]);
    expect(samples[0]).toEqual(black);
    expect(samples[samples.length - 1]).toEqual({ rgb: [255, 255, 255], a: 1 });
    expect(samples.length).toBeGreaterThan(2);
  });

  it('interpolates alpha in premultiplied space, so a fade to clear keeps its colour', () => {
    const mid = sampleStops([black, clear], 2)[1];
    expect(mid.a).toBeCloseTo(0.5, 6);
    expect(mid.rgb).toEqual([0, 0, 0]);
  });
});

describe('resolveGrounds', () => {
  it('uses an opaque ancestor colour as the only ground', () => {
    const grounds = resolveGrounds([opaque(TRANSPARENT), opaque('rgb(15, 23, 42)')]);
    expect(grounds).toEqual({ candidates: [[15, 23, 42]], gradient: false });
  });

  it('falls back to white when nothing above the element is painted', () => {
    const grounds = resolveGrounds([opaque(TRANSPARENT), opaque(TRANSPARENT)]);
    expect(grounds).toEqual({ candidates: [[255, 255, 255]], gradient: false });
  });

  it('enumerates every colour an opaque gradient paints, not just its ends', () => {
    const grounds = resolveGrounds([
      gradient('linear-gradient(to right, rgb(0, 0, 0), rgb(255, 255, 255))'),
      opaque(WHITE),
    ]);
    if (!('candidates' in grounds)) throw new Error(grounds.unassessable);
    expect(grounds.gradient).toBe(true);
    expect(grounds.candidates).toContainEqual([0, 0, 0]);
    expect(grounds.candidates).toContainEqual([255, 255, 255]);
    expect(grounds.candidates.length).toBeGreaterThan(2);
  });

  it('composites an alpha stop over the parent colour beneath it', () => {
    // A wash that fades from amber to nothing, over a near-black panel: the
    // faded end is the panel itself, and it must be a candidate ground.
    const grounds = resolveGrounds([
      gradient('linear-gradient(rgba(245, 158, 11, 0.9), rgba(245, 158, 11, 0))'),
      opaque('rgb(15, 23, 42)'),
    ]);
    if (!('candidates' in grounds)) throw new Error(grounds.unassessable);
    expect(grounds.candidates).toContainEqual([15, 23, 42]);
  });

  it('lets a translucent colour on an element composite over the opaque ancestor', () => {
    const grounds = resolveGrounds([opaque('rgba(0, 0, 0, 0.5)'), opaque('rgb(255, 255, 255)')]);
    expect(grounds).toEqual({ candidates: [[128, 128, 128]], gradient: false });
  });

  it('carries an unassessable image up the chain as unassessable', () => {
    const grounds = resolveGrounds([gradient('url("hero.png")'), opaque(WHITE)]);
    expect(grounds).toEqual({ unassessable: expect.stringContaining('not a gradient') });
  });

  it('stops at the first opaque colour and ignores the paint beneath it', () => {
    const grounds = resolveGrounds([
      opaque(TRANSPARENT),
      opaque('rgb(255, 255, 255)'),
      gradient('url("would-be-unassessable.png")'),
    ]);
    expect(grounds).toEqual({ candidates: [[255, 255, 255]], gradient: false });
  });
});

describe('worstContrast', () => {
  const white: Paint = { rgb: [255, 255, 255], a: 1 };
  const ink: Paint = { rgb: [15, 23, 42], a: 1 };

  it('gives the known ceilings: black on white is 21:1 and white on white is 1:1', () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBeCloseTo(1, 5);
  });

  it('takes the lightest ground when the text is dark, and the darkest when it is light', () => {
    const grounds: [number, number, number][] = [
      [255, 255, 255],
      [200, 200, 200],
    ];
    const dark = worstContrast(ink, 1, grounds);
    expect(dark.background).toEqual([200, 200, 200]);
    const light = worstContrast(white, 1, grounds);
    expect(light.background).toEqual([255, 255, 255]);
  });

  it('fails white text on a band-style amber gradient the way the audit found it', () => {
    // The shape of the defect: white ink on the yellow band's two stops
    // (yellow-500 to yellow-400), which the marking report shipped at ~1.9-2.8:1.
    const grounds = resolveGrounds([
      gradient('linear-gradient(to right, rgb(234, 179, 8) 0%, rgb(250, 204, 21) 100%)'),
      opaque(WHITE),
    ]);
    if (!('candidates' in grounds)) throw new Error(grounds.unassessable);
    const worst = worstContrast(white, 1, grounds.candidates);
    expect(worst.ratio).toBeLessThan(3);
  });

  it('passes dark ink on the same amber gradient, so the gate is not simply "always fail"', () => {
    const grounds = resolveGrounds([
      gradient('linear-gradient(to right, rgb(234, 179, 8) 0%, rgb(250, 204, 21) 100%)'),
      opaque(WHITE),
    ]);
    if (!('candidates' in grounds)) throw new Error(grounds.unassessable);
    expect(worstContrast(ink, 1, grounds.candidates).ratio).toBeGreaterThan(4.5);
  });

  it('applies an inherited opacity to the text before measuring it', () => {
    const full = worstContrast(ink, 1, [[255, 255, 255]]).ratio;
    const faded = worstContrast(ink, 0.5, [[255, 255, 255]]).ratio;
    expect(faded).toBeLessThan(full);
  });
});

describe('over', () => {
  it('paints a translucent colour over an opaque ground, rounded per channel', () => {
    expect(over({ rgb: [0, 0, 0], a: 0.5 }, [255, 255, 255])).toEqual([128, 128, 128]);
  });
});
