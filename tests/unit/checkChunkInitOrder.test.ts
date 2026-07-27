import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * The chunk-initialisation guard is the only automated thing between a
 * cross-chunk TDZ read and a blank production page: dev never reproduces it,
 * `vite build` succeeds, and unit tests pass. So the guard itself has to be
 * right in both directions — it must still catch the crash, and it must not
 * cry wolf, because a check people learn to skip protects nothing.
 */

let dir: string;

const buildDist = (files: Record<string, string>) => {
  dir = mkdtempSync(join(tmpdir(), 'chunkcheck-'));
  mkdirSync(join(dir, 'assets'));
  for (const [name, code] of Object.entries(files)) {
    writeFileSync(join(dir, 'assets', name), code);
  }
  return dir;
};

/** Runs the real script over a fixture dist; returns its exit code and output. */
const run = (distDir: string) => {
  try {
    const stdout = execFileSync('node', ['scripts/checkChunkInitOrder.mjs', distDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (error) {
    const e = error as { status: number; stdout: string; stderr: string };
    return { code: e.status, output: `${e.stdout}${e.stderr}` };
  }
};

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('checkChunkInitOrder', () => {
  // The crash it exists for: two chunks import each other, and one reads the
  // other's binding at module scope, before that chunk has run.
  it('fails on a top-level read across a chunk cycle', () => {
    const result = run(
      buildDist({
        'a.js': 'import{V as v}from"./b.js";const x=v.length;export{x as A};',
        'b.js': 'import{A as a}from"./a.js";const V=[1,2];export{V,a as B};',
      })
    );

    expect(result.code).toBe(1);
    expect(result.output).toContain("reads 'v'");
  });

  it('passes when the read is inside a function, which runs after init', () => {
    const result = run(
      buildDist({
        'a.js': 'import{V as v}from"./b.js";const f=()=>v.length;export{f as A};',
        'b.js': 'import{A as a}from"./a.js";const V=[1,2];export{V,a as B};',
      })
    );

    expect(result.code).toBe(0);
  });

  it('passes when the chunks do not form a cycle', () => {
    const result = run(
      buildDist({
        'a.js': 'import{V as v}from"./b.js";const x=v.length;export{x as A};',
        'b.js': 'const V=[1,2];export{V};',
      })
    );

    expect(result.code).toBe(0);
  });

  // The false positive this guard developed as the bundle grew: once Rollup's
  // alias generator reaches two-letter names, an export LABEL can be spelled
  // the same as the local name given to an imported binding. An export list
  // evaluates nothing — `export { Yw as aa }` creates a binding, it does not
  // read either name.
  it('does not mistake an export label for a read of an imported binding', () => {
    const result = run(
      buildDist({
        'a.js': 'import{L as aa}from"./b.js";const Yw=1;export{Yw as aa};',
        'b.js': 'import{aa as z}from"./a.js";const L=2;export{L};',
      })
    );

    expect(result.code).toBe(0);
  });

  it('does not treat re-exporting an imported binding as a read', () => {
    const result = run(
      buildDist({
        'a.js': 'import{V as v}from"./b.js";const f=()=>v.length;export{f as A,v as V2};',
        'b.js': 'import{A as a}from"./a.js";const V=[1,2];export{V,a as B};',
      })
    );

    expect(result.code).toBe(0);
  });

  it('does not mistake a property name for a read', () => {
    const result = run(
      buildDist({
        'a.js': 'import{L as aa}from"./b.js";const o={aa:1};const p=o.aa;export{p as A};',
        'b.js': 'import{A as z}from"./a.js";const L=2;export{L};',
      })
    );

    expect(result.code).toBe(0);
  });

  // …but a computed key is an expression, so it still reads what it names.
  it('still catches a read hidden in a computed property key', () => {
    const result = run(
      buildDist({
        'a.js': 'import{L as aa}from"./b.js";const o={[aa]:1};export{o as A};',
        'b.js': 'import{A as z}from"./a.js";const L=2;export{L};',
      })
    );

    expect(result.code).toBe(1);
    expect(result.output).toContain("reads 'aa'");
  });

  it('still catches a shorthand property, which is a real read', () => {
    const result = run(
      buildDist({
        'a.js': 'import{L as aa}from"./b.js";const o={aa};export{o as A};',
        'b.js': 'import{A as z}from"./a.js";const L=2;export{L};',
      })
    );

    expect(result.code).toBe(1);
  });
});
