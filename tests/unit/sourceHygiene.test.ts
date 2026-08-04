import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';

/**
 * A literal control character in a source file is close to invisible: it does
 * not show in an editor, it does not show in a diff, and it survives review.
 *
 * It is not harmless. `utils/demoCohort.ts` carried one raw NUL — used, quite
 * reasonably, as a composite-key separator, but written as the byte rather than
 * as `\\u0000`. That single byte made `file` report the module as `data`, which
 * made grep and ripgrep classify it as binary and **silently skip it in every
 * content search**. A 500-line module was invisible to the tool everyone reaches
 * for first, and nothing said so — searches just came back empty.
 *
 * The character itself is fine; writing it as an escape costs nothing and keeps
 * the file text.
 */

const ROOT = resolve(__dirname, '../..');

/** Every tracked file, from git, so the list cannot drift from the repository. */
const trackedFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'buffer' })
    .toString('utf8')
    .split('\0')
    .filter(Boolean);

/** Extensions whose contents are meant to be human-readable text. */
const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
  '.json',
  '.css',
  '.html',
  '.md',
  '.sql',
  '.yml',
  '.yaml',
  '.sh',
  '.txt',
]);

/**
 * C0 control characters other than tab (0x09), newline (0x0A) and carriage
 * return (0x0D) — the three that legitimately appear in text. This is the same
 * rule grep uses to decide a file is binary.
 */
const isDisallowed = (byte: number): boolean =>
  (byte < 0x09 || (byte > 0x0d && byte < 0x20) || byte === 0x0b || byte === 0x0c) &&
  byte !== 0x09 &&
  byte !== 0x0a &&
  byte !== 0x0d;

describe('source hygiene', () => {
  it('has no literal control characters in any text file', () => {
    const offenders: string[] = [];

    for (const file of trackedFiles()) {
      if (!TEXT_EXTENSIONS.has(extname(file))) continue;

      let bytes: Buffer;
      try {
        bytes = readFileSync(resolve(ROOT, file));
      } catch {
        continue; // deleted or unreadable in this checkout
      }

      const found = new Set<string>();
      let line = 1;
      for (const byte of bytes) {
        if (byte === 0x0a) line++;
        else if (isDisallowed(byte)) {
          found.add(`0x${byte.toString(16).padStart(2, '0')} at line ${line}`);
        }
      }
      if (found.size > 0) offenders.push(`${file}: ${[...found].join(', ')}`);
    }

    expect(
      offenders,
      `write these as escapes (\\u0000, \\t, …) so the file stays searchable:\n${offenders.join('\n')}`
    ).toEqual([]);
  });

  it('keeps the demo cohort key separator as an escape', () => {
    // The specific regression, named so the reason survives: this is the line
    // that made the module unsearchable.
    const source = readFileSync(resolve(ROOT, 'utils/demoCohort.ts'), 'utf8');
    expect(source).toContain('\\u0000');
    expect(source.includes(String.fromCharCode(0))).toBe(false);
  });
});
