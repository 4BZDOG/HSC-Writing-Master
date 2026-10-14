import { test, expect, Page } from '@playwright/test';
import { freezeAnimations } from './support/contrast';
import { authFile } from './support/savedSession';
import {
  setTheme,
  dismissAll,
  openWorkspaceQuestion,
  openProfile,
  openVerbSheet,
  openOutcomeBrief,
  openFeedbackAfterMarking,
} from './support/surfaces';
import { ChainNode, Rgb, contrastRatio, resolveGrounds } from './support/gradientMath';

/**
 * Stark surfaces: a white painted slab standing on a white painted parent.
 *
 * The owner's complaint about the light theme was that profiles, shells and
 * admin tools were "starkly bright": pure white panels on a white page, with
 * nothing to say where one stopped and the next began. Every such fix was
 * found by a person looking at a screenshot, and the contrast sweeps cannot
 * see it at all. Text contrast is fine on a white slab; the slab itself is
 * the defect.
 *
 * WHAT COUNTS AS A DEFECT, exactly, so a failure can be argued with:
 *
 *   A painted surface (an element with its own background colour, or a
 *   gradient, not a transparent box) whose visible area in the viewport is
 *   over 20,000 px², and
 *     1. its resolved ground is within 1.08:1 of white (no ladder rung is
 *        visibly darker than #fff), AND
 *     2. the parent it sits on is also within 1.08:1 of white, AND
 *     3. it has no visible border and no box-shadow, AND
 *     4. no colour it paints differs from the parent's by 1.1:1 or more.
 *
 *   Condition 4 is what "distinguishable" means here: 1.1:1 is the smallest
 *   step the eye reliably separates on a light ground, and the surface
 *   ladder's own test (tests/unit/surfaceLadder.test.ts) works in the same
 *   order of magnitude. A card on a paper page with a hairline is fine; a
 *   card on a paper page with nothing is the defect.
 *
 *   20,000 px² is about 141 by 141 pixels. Below that a white chip or a list
 *   row on white is a control, not a slab, and the rule would be noise.
 *
 * WHY NOT A PIXEL BASELINE. A screenshot baseline is tied to the fonts,
 * renderer and anti-aliasing of whichever machine generated it, and it fails
 * for reasons nobody can reproduce on a laptop. Worse, a diff tells you a
 * pixel moved and nothing about what it is. This walks the computed styles
 * and the hit-test geometry instead, so the same DOM gives the same answer on
 * every runner, and every finding names an element a reader can find. The
 * screenshot-based scanner this is ported from (the audit's scan-lib) sampled
 * the painted pixel; the computed walk resolves the same colours from the
 * styles, and the hit-test keeps its one useful property, that covered or
 * backdrop elements are not counted.
 *
 * WHAT IT CANNOT SEE. Surfaces below the fold: the viewport is the measured
 * area, as it was for the audit, so a long scrolled body is only judged for
 * the part a reader sees in that state. A surface whose ground is an image
 * or a colour space this harness cannot read is UNASSESSABLE, counted and
 * reported with its reason, never passed silently.
 *
 * ALLOW-LIST. A surface that is white on purpose (a paper sheet a reader is
 * meant to read as a page, a print preview) goes in ALLOWED with a reason.
 * An allowance that no longer matches anything fails the run, so the list
 * cannot quietly outlive the thing it excused.
 */

/** A surface is judged over this much viewport area. See the header. */
const AREA_MIN = 20_000;
/** Within this ratio of #fff, a ground is "white" for this rule. */
const NEAR_WHITE = 1.08;
/** Below this, two grounds are not told apart by a reader. */
const DISTINGUISHABLE = 1.1;
const WHITE: Rgb = [255, 255, 255];

const WIDE = { width: 1440, height: 900 };

interface Allowance {
  /** The state the surface appears in. */
  state: string;
  /** A substring of the surface's class list, enough to name it. */
  cls: string;
  reason: string;
}

/**
 * Intentional white, each with its reason. Kept short on purpose: a new entry is
 * an argument someone has to make in review, not a way to clear a red run.
 */
const ALLOWED: Allowance[] = [
  {
    state: 'outcome brief',
    cls: 'light:bg-white/80 backdrop-blur-sm rounded-xl',
    reason:
      'The Plus paywall veil (ContentLockOverlay) over the briefing a free account cannot ' +
      'yet read. Its 80% white and blur are the lock itself, laid over the content on purpose.',
  },
];

interface RawSurface {
  tag: string;
  cls: string;
  hint: string;
  rect: [number, number, number, number];
  area: number;
  border: boolean;
  shadow: boolean;
  /** The element first, then each ancestor up to the root. */
  chain: ChainNode[];
}

interface Finding {
  tag: string;
  cls: string;
  hint: string;
  rect: [number, number, number, number];
  area: number;
  ground: string;
  parent: string;
}

/**
 * Walks the page and returns every painted surface over AREA_MIN that is
 * visible in the viewport, with its ancestor chain. Runs in the page because
 * the styles and the hit-test only exist there; the arithmetic happens in Node.
 */
const collectSurfaces = (page: Page, areaMin: number): Promise<RawSurface[]> =>
  page.evaluate((min: number) => {
    const VW = window.innerWidth;
    const VH = window.innerHeight;
    const transparent = (c: string) =>
      c === 'transparent' || c === 'rgba(0, 0, 0, 0)' || /[,/]\s*0(\.0+)?\)$/.test(c);
    const SIDES = ['Top', 'Right', 'Bottom', 'Left'] as const;
    const visibleBorder = (cs: CSSStyleDeclaration) =>
      SIDES.some(
        (s) =>
          parseFloat(cs[`border${s}Width` as const]) > 0 &&
          cs[`border${s}Style` as const] !== 'none' &&
          !transparent(cs[`border${s}Color` as const])
      );
    /** Does this node paint anything of its own that would cover what is beneath? */
    const paints = (cs: CSSStyleDeclaration) =>
      (cs.backgroundImage && cs.backgroundImage !== 'none') ||
      cs.boxShadow !== 'none' ||
      visibleBorder(cs) ||
      !transparent(cs.backgroundColor);
    /**
     * A hit point shows `el`'s own paint only when the top-most element there
     * is `el`, or a descendant whose every box between it and `el` paints
     * nothing. Padding wrappers are common and cover the whole card, so a bare
     * `hit === el` test would drop real cards.
     */
    const showsPaintOf = (hit: Element, el: Element) => {
      let n: Element | null = hit;
      while (n && n !== el) {
        if (paints(getComputedStyle(n))) return false;
        n = n.parentElement;
      }
      return n === el;
    };
    const hintFor = (el: Element) => {
      const norm = (s: string | null) => (s || '').replace(/\s+/g, ' ').trim().slice(0, 70);
      const sec = el.closest('section[aria-labelledby], [role="region"][aria-labelledby]');
      if (sec) {
        const t = document.getElementById(sec.getAttribute('aria-labelledby')!.split(' ')[0]);
        if (t) return 'section: ' + norm(t.textContent);
      }
      const h = el.querySelector('h1,h2,h3,h4');
      if (h) return 'heading: ' + norm(h.textContent);
      const al = el.closest('[aria-label]');
      if (al) return 'aria: ' + norm(al.getAttribute('aria-label'));
      return '';
    };

    const out: RawSurface[] = [];
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      if (el.closest('svg') || ['SCRIPT', 'STYLE', 'LINK', 'META'].includes(el.tagName)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity) === 0)
        continue;
      const own =
        !transparent(cs.backgroundColor) || (cs.backgroundImage && cs.backgroundImage !== 'none');
      if (!own) continue;

      const r = el.getBoundingClientRect();
      const l = Math.max(r.left, 0);
      const t = Math.max(r.top, 0);
      const rt = Math.min(r.right, VW);
      const b = Math.min(r.bottom, VH);
      const area = Math.max(0, rt - l) * Math.max(0, b - t);
      if (area <= min) continue;

      // Sample a 3x3 grid inset from the edges; keep the surface only if at
      // least one point shows its own paint. Geometry, not pixels: deterministic.
      const x0 = l + 3;
      const x1 = rt - 3;
      const y0 = t + 3;
      const y1 = b - 3;
      if (x1 <= x0 || y1 <= y0) continue;
      let visiblePoints = 0;
      for (const y of [y0, (y0 + y1) / 2, y1]) {
        for (const x of [x0, (x0 + x1) / 2, x1]) {
          const hit = document.elementFromPoint(x, y);
          if (hit && showsPaintOf(hit, el)) visiblePoints++;
        }
      }
      if (visiblePoints === 0) continue;

      const chain: ChainNode[] = [];
      let p: Element | null = el;
      while (p) {
        const s = getComputedStyle(p);
        chain.push({ backgroundColor: s.backgroundColor, backgroundImage: s.backgroundImage });
        p = p.parentElement;
      }

      out.push({
        tag: el.tagName.toLowerCase(),
        cls: (typeof el.className === 'string' ? el.className : '')
          .replace(/\s+/g, ' ')
          .slice(0, 160),
        hint: hintFor(el),
        rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
        area: Math.round(area),
        border: visibleBorder(cs),
        shadow: cs.boxShadow !== 'none',
        chain,
      });
    }
    return out;
  }, areaMin);

const nearWhite = (grounds: Rgb[]) => grounds.every((c) => contrastRatio(c, WHITE) <= NEAR_WHITE);
const distinguishable = (a: Rgb[], b: Rgb[]) =>
  a.some((x) => b.some((y) => contrastRatio(x, y) >= DISTINGUISHABLE));
const formatGrounds = (rgb: Rgb[]) => rgb.map((c) => `rgb(${c.join(',')})`).join(' | ');

/**
 * Applies the rule to the collected surfaces. Returns the defects, and the
 * surfaces this harness could not read, so neither is lost.
 */
const judge = (surfaces: RawSurface[]) => {
  const findings: Finding[] = [];
  const unassessed: { hint: string; cls: string; reason: string }[] = [];

  for (const s of surfaces) {
    const own = resolveGrounds(s.chain);
    if ('unassessable' in own) {
      unassessed.push({ hint: s.hint, cls: s.cls, reason: own.unassessable });
      continue;
    }
    if (!nearWhite(own.candidates)) continue;

    const parent = resolveGrounds(s.chain.slice(1));
    if ('unassessable' in parent) {
      unassessed.push({ hint: s.hint, cls: s.cls, reason: `parent: ${parent.unassessable}` });
      continue;
    }
    if (!nearWhite(parent.candidates)) continue;
    if (s.border || s.shadow) continue;
    if (distinguishable(own.candidates, parent.candidates)) continue;

    findings.push({
      tag: s.tag,
      cls: s.cls,
      hint: s.hint,
      rect: s.rect,
      area: s.area,
      ground: formatGrounds(own.candidates),
      parent: formatGrounds(parent.candidates),
    });
  }
  return { findings, unassessed };
};

/** One line per defect, with the element a reader can find it by. */
const explain = (findings: Finding[]) =>
  findings
    .map(
      (f) =>
        `  ${f.area} px² at (${f.rect[0]},${f.rect[1]}) ${f.rect[2]}x${f.rect[3]}  <${f.tag}>  ${f.hint}\n` +
        `      ground ${f.ground} on parent ${f.parent}\n` +
        `      ${f.cls}`
    )
    .join('\n');

/**
 * The states this spec drives the page into, in one signed-in session. Each is
 * one interaction from the workspace and each is where a student spends time:
 * the profile, the legal reader, the plans, the sheets. Every state is closed
 * before the next, so a state starts from the workspace the way a reader does.
 */
const STATES: { name: string; reach: (page: Page) => Promise<void> }[] = [
  { name: 'workspace, idle', reach: async () => {} },
  {
    name: 'profile, stats',
    reach: async (page) => {
      await openProfile(page);
    },
  },
  {
    name: 'profile, settings',
    reach: async (page) => {
      const profile = await openProfile(page);
      await profile.getByRole('button', { name: /^Settings$/ }).click();
    },
  },
  {
    name: 'legal reader',
    reach: async (page) => {
      const profile = await openProfile(page);
      await profile.getByRole('button', { name: /^Settings$/ }).click();
      await profile.getByRole('button', { name: /terms & privacy/i }).click();
      await expect(page.getByRole('dialog', { name: /terms|privacy|legal/i }).first()).toBeVisible({
        timeout: 15_000,
      });
    },
  },
  {
    name: 'quick start, compare plans',
    reach: async (page) => {
      await page
        .getByRole('button', { name: /quick start guide/i })
        .first()
        .click();
      await page
        .getByRole('button', { name: /compare plans/i })
        .first()
        .click();
    },
  },
  {
    name: 'verb sheet',
    reach: async (page) => {
      await openVerbSheet(page);
    },
  },
  {
    name: 'outcome brief',
    reach: async (page) => {
      await openOutcomeBrief(page);
    },
  },
];

/**
 * Judges the page as it is now and returns one message per problem, for the
 * caller to collect. A walk that saw almost nothing is a problem too: it would
 * pass by default, which is the one thing this spec must not do.
 */
const slabProblems = async (page: Page, name: string): Promise<string[]> => {
  const surfaces = await collectSurfaces(page, AREA_MIN);
  if (surfaces.length <= 2) return [`${name}: no painted surfaces were found`];

  const { findings, unassessed } = judge(surfaces);
  const allowed = ALLOWED.filter((a) => a.state === name);
  const matches = (f: Finding, a: Allowance) => f.cls.includes(a.cls);
  const unexpected = findings.filter((f) => !allowed.some((a) => matches(f, a)));
  const stale = allowed.filter((a) => !findings.some((f) => matches(f, a)));

  const problems: string[] = [];
  if (unexpected.length) {
    problems.push(
      `${name}: ${unexpected.length} white slab(s) stand on a white parent with no edge ` +
        `(${unassessed.length} surface(s) could not be read and were not judged)\n` +
        explain(unexpected)
    );
  }
  for (const a of stale) {
    problems.push(`${name}: the allowance "${a.cls}" matches nothing now, so remove it`);
  }
  return problems;
};

test.describe('stark surfaces, light theme', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
    'chromium desktop only'
  );

  test('no white slab stands on a white parent: the workspace and its reference surfaces', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(WIDE);
    // The outcome brief needs a question that links outcomes, and every other
    // state here is fine on that question too, so one session serves them all.
    await openWorkspaceQuestion(page, 'user', true);
    await setTheme(page, 'light');
    await freezeAnimations(page);

    const problems: string[] = [];
    for (const state of STATES) {
      await state.reach(page);
      await page.waitForTimeout(800);
      problems.push(...(await slabProblems(page, state.name)));
      await dismissAll(page);
    }
    expect(problems, 'white slabs on white parents, light theme').toEqual([]);
  });
});

test.describe('stark surfaces, light theme', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || !!isMobile,
    'chromium desktop only'
  );

  test.use({ storageState: authFile('admin') });

  test('no white slab stands on a white parent: the feedback modal after marking', async ({
    page,
  }) => {
    test.setTimeout(240_000);
    await page.setViewportSize(WIDE);
    await openWorkspaceQuestion(page, 'admin', false, { savedSession: true });
    await setTheme(page, 'light');
    await freezeAnimations(page);
    await openFeedbackAfterMarking(page);
    await page.waitForTimeout(800);
    expect(
      await slabProblems(page, 'feedback modal after marking'),
      'white slabs on white parents, light theme'
    ).toEqual([]);
  });
});
