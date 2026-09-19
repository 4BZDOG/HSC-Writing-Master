import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Every check script says PASS or FAIL as its last line.
 *
 * `check:eager-reads` failed in CI on a change that had been run locally and
 * read as passing. Its output ends with an "Accepted as safe" block that prints
 * whether or not the run succeeded, so the tail of a failing run looked exactly
 * like the tail of a passing one — and the verdict, several lines up, was
 * scrolled away. `check:dead-code` had the same shape.
 *
 * A check whose output does not end in its own verdict is a check that will be
 * misread, and reading `tail` instead of `$?` is a habit no amount of resolve
 * fixes. So the contract is structural: the last line states the outcome.
 *
 * The two pure-static scanners are RUN here, because their contract is about
 * what they print and only running them can say. They take about a second each
 * and need no build. The two that need `dist/` are asserted from source
 * instead — running a build inside a unit test would cost more than it proves.
 */

const ROOT = process.cwd();
const VERDICT = /^(PASS|FAIL) — .+$/;

/** The last non-empty line of a command's combined output. */
const lastLine = (script: string): string => {
  let out = '';
  try {
    out = execFileSync('node', [join(ROOT, 'scripts', script)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (error) {
    const e = error as { stdout?: string; stderr?: string };
    out = `${e.stdout ?? ''}${e.stderr ?? ''}`;
  }
  const lines = out.trim().split('\n');
  return lines[lines.length - 1].trim();
};

describe('a check script ends on its verdict', () => {
  it.each(['findModuleInitReads.mjs', 'findOrphanModules.mjs'])('%s', (script) => {
    expect(
      lastLine(script),
      `${script} must end with a PASS/FAIL line — its tail is what a reader actually looks at`
    ).toMatch(VERDICT);
  });

  // These two read `dist/`, so they are checked by what they are written to
  // print rather than by running them.
  it.each(['checkChunkInitOrder.mjs', 'checkEagerChunks.mjs'])(
    '%s emits both verdicts',
    (script) => {
      const source = readFileSync(join(ROOT, 'scripts', script), 'utf8');
      expect(source, `${script} never prints a PASS line`).toMatch(/['"`]\\nPASS — /);
      expect(source, `${script} never prints a FAIL line`).toMatch(/FAIL — /);
    }
  );
});
