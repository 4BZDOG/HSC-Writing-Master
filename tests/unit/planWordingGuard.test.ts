import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

/**
 * One language for every lock. The wording of a lock or a call to action comes
 * from `describeAccess()` in services/entitlements.ts (and the plan's own names
 * from PLAN_LABELS), and the plan comparison's rows come from utils/planComparison.ts.
 * Any other file that writes the plan's name or an upgrade call to action as a
 * literal is a second copy of that wording, and it will drift the next time a
 * deployment moves a gate. This guard fails the build when one appears.
 *
 * The allowlist is explicit and every entry says why. A stale entry fails too,
 * so the list cannot quietly outlive the sentence it excuses.
 */

const ROOT = resolve(__dirname, '../..');
const SCAN_DIRS = ['components', 'hooks', 'utils', 'services', 'pdf'];
const SCAN_FILES = ['App.tsx'];

/** The two files that OWN the wording. Everything else reads from them. */
const OWNERS = new Set(['services/entitlements.ts', 'utils/planComparison.ts']);

/**
 * Literal wording that is a lock or a call to action when it appears in a
 * control, a tooltip or a prompt. Matched on code lines only (comments are not
 * shown to a reader, so they are not part of the wording).
 */
const FORBIDDEN = [
  /Band 6 Plus/,
  /Upgrade to /,
  /Unlock with/,
  /See what Plus unlocks/,
  /See Band 6 Plus/,
];

/**
 * Files allowed to carry the literal plan name, each with the reason it is not
 * a lock or a call to action.
 */
const ALLOWLIST: Record<string, string> = {
  'components/QuickStartModal.tsx':
    "The guide's own introduction to its plans tab: a description of what the three plans are, shown on the page that compares them. It is marketing copy about the plans, not a lock and not a button.",
};

const walk = (dir: string): string[] => {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
};

const isCommentLine = (line: string): boolean => {
  const t = line.trim();
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('{/*');
};

/** Every (file, line, text) where a forbidden literal appears in code. */
const offences = (): { file: string; line: number; text: string }[] => {
  const files = [
    ...SCAN_DIRS.flatMap((d) => walk(join(ROOT, d))),
    ...SCAN_FILES.map((f) => join(ROOT, f)),
  ];
  const hits: { file: string; line: number; text: string }[] = [];
  for (const full of files) {
    const rel = relative(ROOT, full).split('\\').join('/');
    if (OWNERS.has(rel)) continue;
    readFileSync(full, 'utf8')
      .split('\n')
      .forEach((text, i) => {
        if (isCommentLine(text)) return;
        if (FORBIDDEN.some((pattern) => pattern.test(text))) {
          hits.push({ file: rel, line: i + 1, text: text.trim() });
        }
      });
  }
  return hits;
};

describe('plan wording lives in one place', () => {
  it('no component, hook, util, service or page writes a lock or a CTA as a literal', () => {
    const unexplained = offences().filter((h) => !(h.file in ALLOWLIST));
    const message = unexplained.map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n');
    expect(unexplained, `Move this wording into describeAccess():\n${message}`).toEqual([]);
  });

  it('every allowlist entry still excuses a literal, and says why', () => {
    const files = new Set(offences().map((h) => h.file));
    for (const [file, reason] of Object.entries(ALLOWLIST)) {
      expect(reason.length, `${file} has no reason`).toBeGreaterThan(20);
      expect(files.has(file), `${file} is allowlisted but no longer carries the literal`).toBe(
        true
      );
    }
  });
});
