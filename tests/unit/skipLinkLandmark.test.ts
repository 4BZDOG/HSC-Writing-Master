import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Until this landed, a repo-wide search for `<main` returned nothing and
 * `<header>` was the application's only landmark. A keyboard user therefore
 * Tabbed through the whole header — and before the overflow popover that was
 * twelve controls — on every page load, with no way past it, and a screen
 * reader had no region to jump to.
 *
 * Source-scanning, so read it for what it is: it proves the anchor, its target
 * and the `tabIndex` are written in `App.tsx` in that order, not that the shell
 * renders the way it reads. Rendering `AuthenticatedApp` here would mean mocking
 * most of the application to assert on two attributes, and the failure worth
 * catching is someone tidying the wrapper back into a `<div>` — which this sees.
 */
describe('the app shell offers a way past the header', () => {
  const app = readFileSync(resolve(__dirname, '../../App.tsx'), 'utf8');

  it('has exactly one main landmark, and it is the content container', () => {
    expect(app.match(/<main\b/g)).toHaveLength(1);
    expect(app.match(/<\/main>/g)).toHaveLength(1);
    expect(app).toContain('id="main-content"');
  });

  /**
   * The one attribute nobody remembers: without it the anchor scrolls the page
   * and leaves focus where it was, so the next Tab lands back in the header the
   * reader just asked to skip. A `<main>` is not focusable by default.
   */
  it('makes the landmark focusable so the link moves focus, not just the scroll', () => {
    const at = app.indexOf('<main');
    const close = app.indexOf('>', app.indexOf('className', at));
    expect(app.slice(at, close)).toContain('tabIndex={-1}');
  });

  it('offers a skip link that targets it, ahead of it in the document', () => {
    const link = app.indexOf('href="#main-content"');
    expect(link).toBeGreaterThan(-1);
    expect(link).toBeLessThan(app.indexOf('<main'));
    expect(app).toContain('Skip to main content');
  });

  // Hidden until it is wanted: `sr-only` keeps it out of the visual design and
  // `focus:not-sr-only` brings it back the moment a keyboard reaches it. One
  // without the other is either invisible chrome or permanent clutter.
  it('shows the link only once focus reaches it, above the header and popovers', () => {
    const link = app.indexOf('href="#main-content"');
    const attrs = app.slice(link, link + 600);
    expect(attrs).toContain('sr-only');
    expect(attrs).toContain('focus:not-sr-only');
    // Above the header's z-header (60) and the tools popover's z-popover (120); below modals.
    expect(attrs).toContain('focus:z-skip-link');
    // It lands on a light theme surface too, not white text on white.
    expect(attrs).toContain('focus:bg-white');
    expect(attrs).toContain('dark:focus:bg-[rgb(var(--color-bg-surface-elevated))]');
  });
});
