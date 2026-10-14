/**
 * Gradient-aware contrast arithmetic. Pure: no DOM, no Playwright, so the
 * e2e harness and tests/unit can both import it.
 *
 * `measureContrast` in contrast.ts gives up on any node whose background is an
 * image. A glyph's true contrast over a gradient depends on which pixel it
 * lands on, so those nodes were counted and never failed. That is how white
 * text on the band and amber gradients (1.9-2.8:1) shipped unseen. This file
 * turns a gradient's colour stops into the set of grounds it can paint, and a
 * glyph is then measured against the WORST of them.
 *
 * Worst-case is deliberate. A gradient paints every colour between its stops,
 * and the harness does not know which one a given word sits on, so the stricter
 * reading is the honest one. A gradient whose dark end the text never reaches
 * will read as failing; such a case is excluded by name with a reason, never by
 * loosening the floor.
 *
 * Only the forms a computed style produces here are parsed: rgb()/rgba(),
 * `transparent` and hex, inside linear, radial or conic gradients. Anything else
 * (an image, an oklch() stop, a colour-mix()) comes back UNASSESSABLE with its
 * reason. It is never guessed at, because a guessed colour is a green tick that
 * means nothing.
 */

export type Rgb = [number, number, number];

/** A colour with its alpha: `a` is 0 (invisible) to 1 (opaque). */
export interface Paint {
  rgb: Rgb;
  a: number;
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Parses one channel, where `50%` means half of 255. */
const channel = (part: string): number => {
  const n = parseFloat(part);
  return part.endsWith('%') ? (n / 100) * 255 : n;
};

/** Alpha is a number in a computed style, but `50%` is legal in authored CSS. */
const alpha = (part: string): number => {
  const n = parseFloat(part);
  return clamp01(part.endsWith('%') ? n / 100 : n);
};

/**
 * `rgb()`, `rgba()` (comma or space syntax, alpha after a slash or a comma),
 * `#rgb`, `#rrggbb`, `#rgba`, `#rrggbbaa` and `transparent`. Null for anything
 * else, which the caller reports as unassessable rather than guessing.
 */
export const parseCssColour = (value: string): Paint | null => {
  const v = value.trim().toLowerCase();
  if (v === 'transparent') return { rgb: [0, 0, 0], a: 0 };

  const hex = v.match(/^#([0-9a-f]{3,8})$/);
  if (hex) {
    let digits = hex[1];
    if (digits.length === 3 || digits.length === 4) {
      digits = digits
        .split('')
        .map((d) => d + d)
        .join('');
    }
    if (digits.length !== 6 && digits.length !== 8) return null;
    const rgb = [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as Rgb;
    const a = digits.length === 8 ? parseInt(digits.slice(6, 8), 16) / 255 : 1;
    return { rgb, a };
  }

  const fn = v.match(/^rgba?\((.*)\)$/);
  if (!fn) return null;
  const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
  if (parts.length !== 3 && parts.length !== 4) return null;
  const rgb = parts.slice(0, 3).map(channel);
  if (rgb.some((c) => Number.isNaN(c))) return null;
  const a = parts.length === 4 ? alpha(parts[3]) : 1;
  if (Number.isNaN(a)) return null;
  return { rgb: rgb.map((c) => Math.round(clamp01(c / 255) * 255)) as Rgb, a };
};

/**
 * Paints `top` over an opaque ground. Rounded per channel, as the existing
 * harness rounds, so the two agree on the same colour.
 */
export const over = (top: Paint, under: Rgb): Rgb =>
  [0, 1, 2].map((i) => Math.round(top.rgb[i] * top.a + under[i] * (1 - top.a))) as Rgb;

const linearChannel = (c: number) => {
  const v = c / 255;
  return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance. */
export const luminance = (rgb: Rgb): number =>
  0.2126 * linearChannel(rgb[0]) + 0.7152 * linearChannel(rgb[1]) + 0.0722 * linearChannel(rgb[2]);

/** WCAG contrast ratio, always >= 1, whichever order the colours come in. */
export const contrastRatio = (a: Rgb, b: Rgb): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Splits on commas that sit outside any parentheses. */
export const splitTopLevel = (s: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) out.push(current.trim());
  return out;
};

export interface GradientLayer {
  /** Colour stops in the order they are written. Positions are ignored: every
   *  colour between neighbouring stops is sampled, wherever the word sits. */
  stops: Paint[];
}

export type BackgroundImage = { layers: GradientLayer[] } | { unassessable: string };

const GRADIENT = /^(?:repeating-)?(?:linear|radial|conic)-gradient\((.*)\)$/s;

/** Geometry that comes before the colour stops: a direction, a shape, a position, an angle. */
const GEOMETRY =
  /^(to\s|circle\b|ellipse\b|closest-|farthest-|at\s|in\s|-?[\d.]+(?:deg|grad|rad|turn)\b)/i;

/** A bare length or percentage, which is a colour hint or a position, not a colour. */
const POSITION = /^-?[\d.]+(?:%|px|em|rem)?(?:\s+-?[\d.]+(?:%|px|em|rem)?)?$/i;

const COLOUR_START =
  /^((?:rgba?|hsla?|oklch|oklab|lab|lch|color|color-mix)\([^)]*\)|#[0-9a-f]{3,8}|[a-z]+)/i;

const parseStops = (args: string[]): Paint[] | string => {
  const stops: Paint[] = [];
  for (const arg of args) {
    if (GEOMETRY.test(arg)) continue;
    const start = arg.match(COLOUR_START);
    if (start) {
      const paint = parseCssColour(start[1]);
      if (!paint) return `colour "${start[1]}" is not an rgb()/hex colour`;
      stops.push(paint);
      continue;
    }
    if (POSITION.test(arg)) continue;
    return `cannot read gradient argument "${arg.slice(0, 40)}"`;
  }
  return stops;
};

/**
 * A computed `background-image`. `none` is no layers. Each comma-separated
 * layer must be a gradient over colours we can read; a `url()` or anything else
 * is unassessable, with the reason kept for the report.
 */
export const parseBackgroundImage = (image: string): BackgroundImage => {
  const value = image.trim();
  if (!value || value === 'none') return { layers: [] };

  const layers: GradientLayer[] = [];
  for (const layer of splitTopLevel(value)) {
    // A layer can be `none` next to a real one, as Tailwind leaves it when a
    // gradient is set beside a reset. It paints nothing, so it is not a layer.
    if (layer === 'none') continue;
    const g = layer.match(GRADIENT);
    if (!g) return { unassessable: `not a gradient: ${layer.slice(0, 40)}` };
    const stops = parseStops(splitTopLevel(g[1]));
    if (typeof stops === 'string') return { unassessable: stops };
    if (stops.length === 0) return { unassessable: 'gradient has no colour stops' };
    layers.push({ stops });
  }
  return { layers };
};

/**
 * Every colour a gradient layer paints: each stop, and evenly spaced
 * interpolations between neighbours. Interpolation is premultiplied, as the
 * browser does it, so a stop that fades to transparent does not darken on the
 * way out.
 */
export const sampleStops = (stops: Paint[], perSegment = 6): Paint[] => {
  const out: Paint[] = [];
  for (let i = 0; i < stops.length; i++) {
    out.push(stops[i]);
    if (i === stops.length - 1) break;
    const a = stops[i];
    const b = stops[i + 1];
    for (let k = 1; k < perSegment; k++) {
      const t = k / perSegment;
      const alphaAt = a.a + (b.a - a.a) * t;
      const premultiplied = [0, 1, 2].map(
        (c) => a.rgb[c] * a.a + (b.rgb[c] * b.a - a.rgb[c] * a.a) * t
      );
      out.push({
        rgb: alphaAt > 0 ? (premultiplied.map((p) => p / alphaAt) as Rgb) : a.rgb,
        a: alphaAt,
      });
    }
  }
  return out;
};

/** One node of the ancestor chain, as getComputedStyle reports it. */
export interface ChainNode {
  backgroundColor: string;
  backgroundImage: string;
}

export type Grounds = { candidates: Rgb[]; gradient: boolean } | { unassessable: string };

/** Enough grounds to enumerate. Past this the layers are too translucent to list. */
const MAX_CANDIDATES = 512;

const dedupe = (colours: Rgb[]): Rgb[] => {
  const seen = new Set<string>();
  const out: Rgb[] = [];
  for (const c of colours) {
    const key = c.join(',');
    if (!seen.has(key)) {
      seen.add(key);
      out.push(c);
    }
  }
  return out;
};

/**
 * The set of opaque grounds an element's text can sit on, from its own
 * background up through its ancestors. `chain[0]` is the element.
 *
 * The walk stops at the first ancestor with an opaque colour and no image. The
 * canvas beneath everything is white, which is the same assumption the solid
 * harness makes. A gradient on the way up contributes every colour it can
 * paint, composited over whatever lies beneath it.
 */
export const resolveGrounds = (chain: ChainNode[]): Grounds => {
  const parsed = chain.map((node) => ({
    bg: parseCssColour(node.backgroundColor),
    img: parseBackgroundImage(node.backgroundImage),
  }));

  let floor = parsed.length - 1;
  let gradient = false;
  for (let i = 0; i < parsed.length; i++) {
    const { bg, img } = parsed[i];
    if ('unassessable' in img) return { unassessable: img.unassessable };
    if (!bg) return { unassessable: `background colour ${chain[i].backgroundColor}` };
    if ('layers' in img && img.layers.length > 0) gradient = true;
    if ('layers' in img && img.layers.length === 0 && bg.a >= 0.999) {
      floor = i;
      break;
    }
  }

  let candidates: Rgb[] = [[255, 255, 255]];
  for (let i = floor; i >= 0; i--) {
    const { bg, img } = parsed[i];
    if (bg && bg.a > 0) candidates = candidates.map((c) => over(bg, c));
    if (!('layers' in img)) continue;
    // CSS paints the last-listed layer lowest, so the stack is walked upward.
    for (const layer of [...img.layers].reverse()) {
      const samples = sampleStops(layer.stops);
      const next: Rgb[] = [];
      for (const c of candidates) for (const s of samples) next.push(over(s, c));
      candidates = dedupe(next);
      if (candidates.length > MAX_CANDIDATES) {
        return { unassessable: `${candidates.length}+ grounds from translucent layers` };
      }
    }
  }
  return { candidates: dedupe(candidates), gradient };
};

/**
 * The worst contrast a run of text reaches over a set of grounds, and the
 * ground that produced it. The text is composited with its own alpha and the
 * element's inherited opacity, exactly as the solid harness composites it.
 */
export const worstContrast = (
  text: Paint,
  opacity: number,
  grounds: Rgb[]
): { ratio: number; background: Rgb } => {
  let worst = { ratio: Infinity, background: grounds[0] };
  for (const bg of grounds) {
    const ink = over({ rgb: text.rgb, a: text.a * opacity }, bg);
    const ratio = contrastRatio(ink, bg);
    if (ratio < worst.ratio) worst = { ratio, background: bg };
  }
  return worst;
};
