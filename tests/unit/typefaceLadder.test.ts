import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

/**
 * The interface face and the ladder's ceiling have to agree.
 *
 * IBM Plex Sans stops at 700, so `font-black` is mapped to 700 rather than 900
 * (see the note in `tailwind.config.js`). The failure this guards against is
 * silent: restore 900 to the theme, or point `sans` at a family that is not
 * loaded, and nothing throws — the browser quietly renders the nearest real
 * face, or the system sans, and the design drifts a step at a time with every
 * screenshot still looking plausible.
 *
 * So: the face named in the theme must be a face `index.tsx` actually imports,
 * and no weight in the theme may exceed what that face can draw.
 */

const config = readFileSync('tailwind.config.js', 'utf8');
const entry = readFileSync('index.tsx', 'utf8');

/** The heaviest face IBM Plex Sans and Newsreader both provide. */
const AXIS_CEILING = 700;

/** Inter carries the display roles and runs the full axis. */
const DISPLAY_CEILING = 900;

const themeBlock = (name: string): string => {
  const at = config.indexOf(`${name}: {`);
  if (at === -1) return '';
  let depth = 0;
  for (let i = config.indexOf('{', at); i < config.length; i += 1) {
    if (config[i] === '{') depth += 1;
    if (config[i] === '}') {
      depth -= 1;
      if (depth === 0) return config.slice(at, i + 1);
    }
  }
  return '';
};

describe('the interface face and the weight ladder agree', () => {
  it('sets a sans stack whose first family is imported', () => {
    const sans = /sans:\s*\[([^\]]*)\]/.exec(themeBlock('fontFamily'));
    expect(sans, 'fontFamily.sans is missing from tailwind.config.js').not.toBeNull();

    const families = (sans as RegExpExecArray)[1]
      .split(',')
      .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);

    // The last entry is the generic fallback; every named family before it has
    // to be one the app ships, or it is decoration in a config file.
    const named = families.filter((f) => !/^(sans-serif|serif|monospace|system-ui)$/.test(f));
    expect(named.length).toBeGreaterThan(0);

    // '@fontsource-variable/ibm-plex-sans' registers 'IBM Plex Sans Variable';
    // the id in the import path is the family, lowercased and hyphenated.
    const slug = (family: string) =>
      family
        .toLowerCase()
        .replace(/\s+variable$/, '')
        .replace(/\s+/g, '-');
    expect(entry).toContain(`fontsource-variable/${slug(named[0])}`);
  });

  it('sets a display stack whose first family is imported too', () => {
    // Two faces now: Plex reads, Inter displays. A display family named in the
    // theme but never imported fails exactly as silently as a body one — the
    // browser drops to the system sans and the screenshot still looks fine.
    const display = /display:\s*\[([^\]]*)\]/.exec(themeBlock('fontFamily'));
    expect(display, 'fontFamily.display is missing from tailwind.config.js').not.toBeNull();
    const named = (display as RegExpExecArray)[1]
      .split(',')
      .map((f) => f.trim().replace(/^['"]|['"]$/g, ''))
      .filter((f) => f && !/^(sans-serif|serif|monospace|system-ui)$/.test(f));
    expect(named.length).toBeGreaterThan(0);
    const slug = (family: string) =>
      family
        .toLowerCase()
        .replace(/\s+variable$/, '')
        .replace(/\s+/g, '-');
    expect(entry).toContain(`fontsource-variable/${slug(named[0])}`);
  });

  it('keeps every weight above the Plex ceiling bound to the face that can draw it', () => {
    // The 900 lives in `.t-display` / `.t-section` rather than in the theme,
    // because a theme-level 900 is handed to Plex too and clamps back to 700 in
    // silence. This is the boundary that arrangement depends on: any rule in
    // index.css asking for more than 700 must also name the display family.
    // Comments are stripped first: the note above `font-synthesis-weight`
    // mentions a raw `font-weight: 800` as the thing it exists to catch, and
    // scanning the prose flagged the explanation as the defect.
    const css = readFileSync('index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders: string[] = [];
    for (const block of css.split('}')) {
      const weight = /font-weight:\s*(\d{3})/.exec(block);
      if (!weight) continue;
      const asked = Number(weight[1]);
      if (asked <= AXIS_CEILING) continue;
      expect(asked).toBeLessThanOrEqual(DISPLAY_CEILING);
      if (!/font-family:[^;]*Inter/i.test(block)) {
        const selector = (block.split('{')[0] || '').trim().split('\n').pop() ?? '?';
        offenders.push(`${selector} asks for ${asked} without naming Inter`);
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('asks for no weight the face cannot draw', () => {
    const weights = themeBlock('fontWeight');
    if (!weights) return; // no override — Tailwind's own scale tops at 900 unused
    const asked = [...weights.matchAll(/:\s*'(\d{3})'/g)].map((m) => Number(m[1]));
    expect(asked.length).toBeGreaterThan(0);
    for (const w of asked) expect(w).toBeLessThanOrEqual(AXIS_CEILING);
  });

  it('imports an italic axis for every face that is set in italic', () => {
    // The failure this catches actually shipped. Inter was added for the
    // display roles with only `wght.css` — the upright axis — while every one
    // of those roles (the wordmark, both card headings, the section headings)
    // is set in italic caps. `font-synthesis-style: none` forbids faking a
    // slope, so CSS matched the upright face for an italic request and the
    // wordmark rendered bolt upright. Rendered side by side, "asked for italic"
    // and "asked for upright" were pixel-identical, and every screenshot of it
    // looked entirely plausible.
    //
    // Both families here carry italic display type, so both owe both axes.
    for (const family of ['ibm-plex-sans', 'inter']) {
      expect(entry, `${family} is imported without its italic axis`).toContain(
        `fontsource-variable/${family}/wght-italic.css`
      );
      expect(entry).toContain(`fontsource-variable/${family}/wght.css`);
    }
  });

  it('refuses to let the browser fake the weights it is missing', () => {
    const css = readFileSync('index.css', 'utf8');
    expect(css).toMatch(/font-synthesis-weight:\s*none/);
  });
});
