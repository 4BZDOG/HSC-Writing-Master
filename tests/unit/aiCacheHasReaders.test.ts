import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

/**
 * A cache nobody reads is not a cache, it is a write amplifier.
 *
 * `AICache` shipped with four writers and no readers, from the day it was
 * added: every evaluation, enrichment, scenario and keyword result went into
 * IndexedDB on a 30-day TTL, was swept for expiry on every open, and was never
 * read back once. Nothing noticed, because `check:dead-code` looks for orphan
 * MODULES and this module was imported — just never usefully.
 *
 * Two rules, both cheap to satisfy and both failing loudly if the cache drifts
 * back into being write-only:
 *
 *  1. A file that writes to the cache must also read from it. Writing in one
 *     place and reading in another is possible in principle, but it was not
 *     what happened here, and a writer with no reader anywhere in its own file
 *     is the exact shape of the defect.
 *  2. Every public key generator must have a caller. Fourteen of the fifteen
 *     named results nothing ever asked for.
 */

const ROOT = process.cwd();
const SOURCE_DIRS = ['components', 'hooks', 'services', 'utils', 'api', 'pdf'];
const CACHE_MODULE = join('services', 'aiCache.ts');

/** Every .ts/.tsx file in the app, excluding the cache module itself. */
const sourceFiles = (): string[] => {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.tsx?$/.test(entry)) continue;
      if (full.endsWith(CACHE_MODULE)) continue;
      out.push(full);
    }
  };
  for (const dir of SOURCE_DIRS) walk(join(ROOT, dir));
  // App.tsx is a composition root and can hold call sites too.
  out.push(join(ROOT, 'App.tsx'));
  return out;
};

const files = sourceFiles().map((path) => ({ path, text: readFileSync(path, 'utf8') }));

describe('the AI cache is read by whoever writes it', () => {
  it('has source files to scan', () => {
    // A walker that found nothing would make both rules below vacuous.
    expect(files.length).toBeGreaterThan(100);
    expect(files.some((f) => f.text.includes('AICache'))).toBe(true);
  });

  it('never writes without reading in the same file', () => {
    const writeOnly = files
      .filter((f) => /AICache\.set\s*\(/.test(f.text) && !/AICache\.get\s*[<(]/.test(f.text))
      .map((f) => f.path.slice(ROOT.length + 1));

    expect(
      writeOnly,
      `these files store AI results nothing reads back — either read the cache ` +
        `where you write it, or stop writing:\n  ${writeOnly.join('\n  ')}`
    ).toEqual([]);
  });

  it('keeps no key generator that nothing calls', () => {
    const module = readFileSync(join(ROOT, CACHE_MODULE), 'utf8');
    const declared = [...module.matchAll(/static (generate\w*Key)\s*\(/g)].map((m) => m[1]);
    expect(declared.length).toBeGreaterThan(0);

    const uncalled = declared.filter(
      (name) => !files.some((f) => f.text.includes(`AICache.${name}(`))
    );
    expect(
      uncalled,
      `these key generators name a cached result nothing ever asks for:\n  ${uncalled.join('\n  ')}`
    ).toEqual([]);
  });
});
