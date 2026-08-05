// @vitest-environment node
//
// Node, not jsdom: importing vite.config pulls in esbuild, whose startup
// asserts `new TextEncoder().encode('') instanceof Uint8Array` — false under
// jsdom's separate realm, so the import throws before a test can run.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

/**
 * A production build must not publish the application's source.
 *
 * The trap this guards is that `sourcemap: 'hidden'` LOOKS like the fix and is
 * not. It only drops the `//# sourceMappingURL=` comment, so devtools stops
 * fetching the map by itself — but Vite still writes `dist/assets/*.js.map`,
 * and both deploy paths publish `dist/` wholesale. The map's filename is
 * derived from the bundle's, which is right there in the HTML, so
 * `curl https://<site>/assets/<chunk>-<hash>.js.map` returns 200 and the
 * `sourcesContent` array hands back the original commented TypeScript.
 * Verified exactly that way against a real `npm run build` before this changed:
 * 18 maps, ~8.8 MB, full source recoverable.
 *
 * So the assertion is `false`, not `'hidden'` — anything that emits a map file
 * at all is a regression, because nothing in this repo deletes it before
 * deploying.
 */

import viteConfig from '../../vite.config';

type ConfigFn = (env: { mode: string; command: 'build' | 'serve' }) => {
  build?: { sourcemap?: unknown };
};

const resolve = (mode: string) =>
  (viteConfig as unknown as ConfigFn)({ mode, command: 'build' }).build?.sourcemap;

describe('production source maps', () => {
  const original = process.env.BUILD_SOURCEMAPS;

  beforeEach(() => {
    delete process.env.BUILD_SOURCEMAPS;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.BUILD_SOURCEMAPS;
    else process.env.BUILD_SOURCEMAPS = original;
  });

  it('emits no source maps in a production build', () => {
    // Not 'hidden' — see the note above. 'hidden' still writes the files.
    expect(resolve('production')).toBe(false);
  });

  it('keeps full source maps in development, where nothing is published', () => {
    expect(resolve('development')).toBe(true);
  });

  it('re-enables hidden maps only when BUILD_SOURCEMAPS is explicitly true', () => {
    process.env.BUILD_SOURCEMAPS = 'true';
    // 'hidden' is right for the opt-in: an error-tracker upload needs the file
    // to exist, but the browser must still not be pointed at it. Whoever opts
    // in owns deleting dist/assets/*.map after the upload.
    expect(resolve('production')).toBe('hidden');
  });

  it('treats any other BUILD_SOURCEMAPS value as off, not as on', () => {
    // A hosting dashboard holding '1', 'yes' or '' must not publish source on
    // a near-miss — opting in to shipping source should take saying so exactly.
    for (const value of ['1', 'yes', 'TRUE', 'false', '']) {
      process.env.BUILD_SOURCEMAPS = value;
      expect(resolve('production')).toBe(false);
    }
  });
});
