import { describe, it, expect, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

/**
 * The dead-module guard has to be right in both directions, for the same
 * reason the chunk-init guard does: it must catch a module nothing imports,
 * and it must not cry wolf, because a check people learn to skip protects
 * nothing. Crying wolf here is the likelier failure — "imported" has more
 * shapes than it looks (no extension, dynamic, from a test, from a script),
 * and each one it misses would condemn a live module.
 */

let dir: string;

const buildTree = (files: Record<string, string>) => {
  dir = mkdtempSync(join(tmpdir(), 'orphans-'));
  for (const [name, code] of Object.entries(files)) {
    const full = join(dir, name);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, code);
  }
  return dir;
};

/** Runs the real script over a fixture tree; returns its exit code and output. */
const run = (root: string) => {
  try {
    const stdout = execFileSync('node', ['scripts/findOrphanModules.mjs', root, '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, orphans: JSON.parse(stdout) as string[] };
  } catch (error) {
    const e = error as { status: number; stdout: string };
    return { code: e.status, orphans: JSON.parse(e.stdout) as string[] };
  }
};

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe('findOrphanModules', () => {
  it('reports a module nothing imports, and fails the build', () => {
    const root = buildTree({
      'App.tsx': `import { thing } from './utils/used';\nexport default thing;\n`,
      'utils/used.ts': `export const thing = 1;\n`,
      'utils/orphan.ts': `export const nobody = 2;\n`,
    });

    const { code, orphans } = run(root);
    expect(orphans).toEqual(['utils/orphan.ts']);
    expect(code).toBe(1);
  });

  it('passes a tree where everything is reachable', () => {
    const root = buildTree({
      'App.tsx': `import { thing } from './utils/used';\nexport default thing;\n`,
      'utils/used.ts': `export const thing = 1;\n`,
    });

    const { code, orphans } = run(root);
    expect(orphans).toEqual([]);
    expect(code).toBe(0);
  });

  it('does not call a module dead when only a test imports it', () => {
    // Under test is not unused. This is the exemption most likely to be got
    // wrong, and it would condemn every pure utility the app calls indirectly.
    const root = buildTree({
      'App.tsx': `export default 1;\n`,
      'utils/tested.ts': `export const pure = () => 1;\n`,
      'tests/unit/pure.test.ts': `import { pure } from '../../utils/tested';\npure();\n`,
    });

    expect(run(root).orphans).toEqual([]);
  });

  it('counts the import shapes that do not name a file extension', () => {
    const root = buildTree({
      'App.tsx': [
        `import { a } from './utils/noExt';`,
        `import { b } from './utils/withExt.ts';`,
        `const c = await import('./utils/dynamic');`,
        `export default [a, b, c];`,
      ].join('\n'),
      'utils/noExt.ts': `export const a = 1;\n`,
      'utils/withExt.ts': `export const b = 2;\n`,
      'utils/dynamic.ts': `export const c = 3;\n`,
    });

    expect(run(root).orphans).toEqual([]);
  });

  it('never reports an entry point, which by definition has no importer', () => {
    const root = buildTree({
      'App.tsx': `export default 1;\n`,
      'index.tsx': `export default 2;\n`,
      'types.ts': `export type T = string;\n`,
    });

    const { code, orphans } = run(root);
    expect(orphans).toEqual([]);
    expect(code).toBe(0);
  });

  it('follows an import chain rather than only the entry point', () => {
    const root = buildTree({
      'App.tsx': `import './services/first';\n`,
      'services/first.ts': `import './second';\nexport const one = 1;\n`,
      'services/second.ts': `export const two = 2;\n`,
      'services/third.ts': `export const three = 3;\n`,
    });

    expect(run(root).orphans).toEqual(['services/third.ts']);
  });
});
