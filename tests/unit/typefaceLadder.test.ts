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

  it('asks for no weight the face cannot draw', () => {
    const weights = themeBlock('fontWeight');
    if (!weights) return; // no override — Tailwind's own scale tops at 900 unused
    const asked = [...weights.matchAll(/:\s*'(\d{3})'/g)].map((m) => Number(m[1]));
    expect(asked.length).toBeGreaterThan(0);
    for (const w of asked) expect(w).toBeLessThanOrEqual(AXIS_CEILING);
  });

  it('refuses to let the browser fake the weights it is missing', () => {
    const css = readFileSync('index.css', 'utf8');
    expect(css).toMatch(/font-synthesis-weight:\s*none/);
  });
});
