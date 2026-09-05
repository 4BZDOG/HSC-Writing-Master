import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { User, UserRole } from '../../types';
import * as headerChrome from '../../utils/headerChrome';
import {
  HEADER_ACTION,
  HEADER_BAR,
  HEADER_HAIRLINE,
  HEADER_INNER,
  HEADER_MARK_TILE,
  HEADER_MENU_ITEM,
  HEADER_MENU_PANEL,
  HEADER_PROFILE,
  HEADER_STORAGE_ALERT,
  HEADER_SUBLABEL,
  HEADER_TELEMETRY,
  HEADER_WORDMARK,
} from '../../utils/headerChrome';

/**
 * The header is about to be redesigned in `utils/headerChrome.ts`, one constant
 * at a time. That only works if the constants are the thing the header actually
 * wears — a class string left behind in the JSX would silently stop tracking
 * the redesign, and nothing else in the suite looks at this component.
 *
 * The two things that must not move while it happens are pinned here as well:
 * the theme toggle's accessible name, which `tests/e2e/light-theme.spec.ts`
 * finds the button by, and the role gate in front of the admin tools.
 */

vi.mock('../../services/geminiService', () => ({}));
vi.mock('../../services/authService', () => ({ authService: { updateUser: vi.fn() } }));

/**
 * A mutable flag rather than a constant: the moderation tools are gated on a
 * REMOTE curriculum as well as the role, and both sides of that need exercising
 * — a teacher on a local curriculum has nothing to moderate and should not be
 * offered the control at all.
 */
const { remote } = vi.hoisted(() => ({ remote: { value: true } }));
vi.mock('../../services/curriculumService', () => ({ isCurriculumRemote: () => remote.value }));

import AppHeader from '../../components/AppHeader';
import { StorageStatus } from '../../utils/storageUtils';

beforeEach(() => {
  remote.value = true;
});
afterEach(cleanup);

const makeUser = (role: UserRole, theme: 'dark' | 'light' = 'dark'): User => ({
  username: 'alex@example.com',
  role,
  displayName: 'Alex',
  preferences: {
    defaultFocusMode: false,
    autoSave: true,
    highContrast: false,
    showTips: true,
    theme,
  },
  stats: {
    xp: 0,
    level: 1,
    questionsAnswered: 0,
    totalWordsWritten: 0,
    averageBand: 0,
    lastActive: Date.now(),
    streakDays: 0,
  },
});

const renderHeader = (
  role: UserRole,
  theme: 'dark' | 'light' = 'dark',
  overrides: Partial<React.ComponentProps<typeof AppHeader>> = {}
) =>
  render(
    <AppHeader
      user={makeUser(role, theme)}
      onUpdateUser={vi.fn()}
      storageStatus={'IndexedDB' as StorageStatus}
      openModal={vi.fn()}
      onOpenAudit={vi.fn()}
      onOpenReviewQueue={vi.fn()}
      onOpenClassInsights={vi.fn()}
      onOpenStudentProgress={vi.fn()}
      onOpenUsageDashboard={vi.fn()}
      onOpenRuntimeKeys={vi.fn()}
      {...overrides}
    />
  );

/** Opens the overflow popover and hands back its trigger. */
const openTools = (): HTMLElement => {
  const trigger = screen.getByRole('button', { name: /(admin|teaching) tools/i });
  fireEvent.click(trigger);
  return trigger;
};

/** The eight admin/moderator tools, by the labels the e2e specs select on. */
const ADMIN_TOOLS = [
  'Data Vault (Import/Export/Reorder)',
  'Syllabus Audit Studio',
  'Review Queue (approve/reject contributions)',
  'Class Insights (where the cohort is struggling)',
  'Student Progress (one student across verb groups)',
  'Internal Database Health',
  'AI Usage Dashboard (monitor & adjust quotas)',
  'Runtime AI Keys (paste a key to test models)',
];

describe('the header wears the shared vocabulary', () => {
  it('dresses the bar and its content row from headerChrome', () => {
    const { container } = renderHeader('user');
    const bar = container.querySelector('header') as HTMLElement;

    expect(bar.className).toContain(HEADER_BAR);
    expect(bar.innerHTML).toContain(HEADER_INNER);
  });

  it('dresses the wordmark, its tile and its sub-label from headerChrome', () => {
    renderHeader('user');

    const wordmark = screen.getByRole('heading', { name: 'Band 6' });
    expect(wordmark.className).toContain(HEADER_WORDMARK);
    expect(screen.getByText('HSC Writing Coach').className).toContain(HEADER_SUBLABEL);
    // The tile is the icon's own box, one step above the lucide <svg>.
    expect(wordmark.closest('div')?.previousElementSibling?.className).toContain(HEADER_MARK_TILE);
  });

  it('dresses the rail controls that stay whatever the role', () => {
    renderHeader('user');

    expect(
      screen.getByLabelText('Quick start guide, plans and the fine print').className
    ).toContain(HEADER_ACTION);
    expect(screen.getByLabelText('Switch to light theme').className).toContain(HEADER_ACTION);
    expect(screen.getByLabelText('Open your profile').className).toContain(HEADER_PROFILE);
  });

  it('dresses the tools trigger and every item in the popover it opens', () => {
    renderHeader('admin');

    expect(openTools().className).toContain(HEADER_ACTION);
    expect(screen.getByRole('dialog').className).toContain(HEADER_MENU_PANEL);
    for (const label of ADMIN_TOOLS) {
      expect(screen.getByLabelText(label).className).toContain(HEADER_MENU_ITEM);
    }
  });
});

/**
 * The bar stopped being a gradient wall and became a token surface, which is
 * the moment every white-alpha value in it changed meaning. DesignSpec §2 asks
 * "what is it painted on?", and the only honest answer for anything on the rail
 * is now "a theme colour" — so it needs a light value and a `dark:` partner.
 * The wordmark tile is the documented exception: the brand gradient moved onto
 * it, and white-alpha on a gradient reads the same in both themes.
 */
describe('the bar carries both themes', () => {
  it('paints its own background in light and in dark', () => {
    expect(HEADER_BAR).toContain('bg-white/80');
    expect(HEADER_BAR).toContain('dark:bg-[rgb(var(--color-bg-surface))]/70');
    expect(HEADER_BAR).toContain('backdrop-blur-2xl');
  });

  it('no longer hangs a full-bleed gradient across the whole bar', () => {
    const { container } = renderHeader('user');
    const wall = container.querySelector('header > .absolute.inset-0.bg-gradient-to-r');

    expect(wall).toBeNull();
    // The gradient survives, in proportion, on the 40px tile.
    expect(HEADER_MARK_TILE).toContain('from-indigo-600');
    expect(HEADER_MARK_TILE).toContain('to-sky-500');
  });

  it('renders the mesh and the hairline beneath the content row', () => {
    const { container } = renderHeader('user');
    const bar = container.querySelector('header') as HTMLElement;

    expect(bar.querySelector('[class*="mix-blend-overlay"]')).toBeTruthy();
    const hairline = bar.querySelector(`[class="${HEADER_HAIRLINE}"]`) as HTMLElement;
    expect(hairline).toBeTruthy();
    expect(hairline.getAttribute('aria-hidden')).toBe('true');
    // Both sit below HEADER_INNER's z-10, or the blend washes over the text.
    expect(HEADER_INNER).toContain('relative z-10');
  });

  it('gives every rail colour a light value and a dark partner', () => {
    // HEADER_MARK_TILE is the one exception: the brand gradient moved onto it,
    // so its white-alpha border reads identically in both themes and a `dark:`
    // partner would be the actual mistake. Everything else is on the rail.
    const exempt = new Set(['HEADER_MARK_TILE']);

    /** `hover:bg-slate-100` → `bg`; `text-lg` and `border-b` → null. */
    const colourProperty = (token: string): string | null => {
      const utility = token.split(':').pop() as string;
      const match = utility.match(/^(text|bg|border|from|via|to|shadow|ring|divide)-(.+)$/);
      if (!match) return null;
      const [, property, value] = match;
      // Theme-neutral keywords need no partner; sizes and gradient directions
      // are not colours at all.
      if (/^(transparent|current|inherit|none)$/.test(value)) return null;
      const isColour =
        /^(white|black)(\/[\d.]+)?$/.test(value) ||
        /^[a-z]+-\d{2,3}(\/[\d.]+)?$/.test(value) ||
        value.startsWith('[rgb(');
      return isColour ? property : null;
    };

    for (const [name, value] of Object.entries(headerChrome)) {
      if (typeof value !== 'string' || exempt.has(name)) continue;

      const tokens = value.split(/\s+/).filter(Boolean);
      const themed = new Set(
        tokens
          .filter((t) => t.startsWith('dark:'))
          .map(colourProperty)
          .filter(Boolean)
      );

      for (const token of tokens) {
        if (token.startsWith('dark:')) continue;
        const property = colourProperty(token);
        if (!property) continue;
        expect(
          themed.has(property),
          `${name} sets \`${token}\` on a theme surface with no dark: partner`
        ).toBe(true);
      }
    }
  });

  it('stopped changing the sub-label’s tracking at a breakpoint', () => {
    // The fault this pins is a tracking that JUMPED at `sm` — it was the only
    // responsive tracking in the codebase, and it made the label resize itself
    // mid-breakpoint. The `tracking-[0.2em]` it used to assert was incidental
    // to that: the sub-label is a label, so it now carries `.t-label` and takes
    // its letter-spacing from there (normal, per DesignSpec §4). No tracking
    // utility at all satisfies the original intent more completely than a
    // single one did.
    expect(HEADER_SUBLABEL).toContain('t-label');
    expect(HEADER_SUBLABEL).not.toMatch(/(^|\s|:)tracking-/);
  });
});

/**
 * The header is `sticky top-0`, so any change to its height reflows the whole
 * page beneath it — and it used to change height with the viewport AND with the
 * signed-in role, because the admin cluster dropped onto a second row below
 * `sm`. `utils/layoutConstants.ts` hard-codes a reserve for a header height the
 * header never guaranteed. One control now stands where eight did, so the row
 * has nothing left to wrap and the bar can state 64px flat.
 *
 * The mirror of how `cardHeaderHeightLock.test.tsx` pins the workspace cards.
 */
describe('the bar is one height at every width and every role', () => {
  it('states a height rather than a minimum', () => {
    expect(HEADER_BAR).toContain('h-16');
    expect(HEADER_BAR).not.toMatch(/\bmin-h-/);
  });

  it('never wraps its content row, and no longer pads it by breakpoint', () => {
    expect(HEADER_INNER).toContain('flex-nowrap');
    expect(HEADER_INNER).not.toMatch(/(^|\s)flex-wrap\b/);
    expect(HEADER_INNER).not.toMatch(/(^|\s)(sm|md|lg|xl):flex-(no)?wrap\b/);
    // Centring comes from `items-center` in a fixed-height box now.
    expect(HEADER_INNER).toContain('h-full');
    expect(HEADER_INNER).not.toMatch(/(^|\s)(sm:)?py-/);
  });

  // A row that cannot wrap hands the brand block whatever the controls leave,
  // and `whitespace-nowrap` alone would have let it paint straight through
  // them — measured at 360px, 36px of sub-label over the action cluster. So the
  // gloss steps aside on a phone and both lines clip rather than overflow.
  it('lets the brand block yield rather than paint over the controls', () => {
    expect(HEADER_SUBLABEL).toContain('hidden sm:block');
    for (const value of [HEADER_WORDMARK, HEADER_SUBLABEL]) {
      expect(value).toContain('truncate');
      expect(value).not.toContain('whitespace-nowrap');
    }
  });

  // The constants are not the whole story: two clusters kept their `flex-wrap`
  // as literals in the JSX, and removing it from HEADER_INNER alone would have
  // left the header wrapping exactly as before.
  it('leaves no wrapping cluster behind in the markup', () => {
    for (const role of ['user', 'teacher', 'admin'] as const) {
      cleanup();
      const { container } = renderHeader(role, 'dark', {
        storageStatus: 'Error' as StorageStatus,
      });
      expect((container.querySelector('header') as HTMLElement).innerHTML).not.toContain(
        'flex-wrap'
      );
    }
  });
});

/**
 * `light-theme.spec.ts:45` finds this button by
 * `getByRole('button', { name: /switch to (light|dark) theme/i })`. The label is
 * the whole selector — there is no test id — so it has to survive the redesign
 * verbatim, and the button has to stay directly clickable on the rail.
 */
describe('the theme toggle keeps its accessible name', () => {
  it('offers dark to a user reading in light', () => {
    renderHeader('user', 'light');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeTruthy();
  });

  it('offers light to a user reading in dark', () => {
    renderHeader('user', 'dark');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeTruthy();
  });
});

/**
 * The rail used to carry a pill saying `API HEALTHY` and `IndexedDB Active`,
 * `hidden lg:flex`. API health is already stated twice over by
 * `ApiHealthIndicator` and `ApiStatusIndicator`, both mounted unconditionally
 * and both more informative, so the header's version is gone. Storage mode is
 * genuinely worth knowing and is now told without a breakpoint — in the profile
 * button's title and the popover's footer.
 *
 * The failure case is not treated as telemetry at all. If storage has broken,
 * the work a student is typing is going nowhere, so it gets a chip on the rail
 * at every width — the maintainer's decision, and the thing the old pill's
 * `hidden lg:` could never have done.
 */
describe('the rail states storage, and only storage', () => {
  it('says nothing about the API anywhere in the bar', () => {
    const { container } = renderHeader('admin');
    const bar = container.querySelector('header') as HTMLElement;

    expect(bar.textContent).not.toContain('API');
    expect(bar.innerHTML).not.toContain('API');
  });

  it('carries the storage mode on the profile button at every width', () => {
    renderHeader('user', 'dark', { storageStatus: 'Supabase' as StorageStatus });

    const profile = screen.getByLabelText('Open your profile');
    expect(profile.getAttribute('title')).toBe('Open your profile — storage: Supabase');
    // Nothing here is behind a breakpoint; that was the old pill's fault.
    expect(profile.className).not.toContain('hidden');
  });

  it('repeats it in the popover footer, in mono per §4', () => {
    renderHeader('admin', 'dark', { storageStatus: 'Supabase' as StorageStatus });
    openTools();

    const row = screen.getByText(/Storage · Supabase/);
    expect(row.className).toContain(HEADER_TELEMETRY);
    expect(HEADER_TELEMETRY).toContain('font-mono');
  });

  it('raises a chip on the rail when storage has failed', () => {
    renderHeader('user', 'dark', { storageStatus: 'Error' as StorageStatus });

    const chip = screen.getByRole('status');
    expect(chip.className).toBe(HEADER_STORAGE_ALERT);
    expect(chip.textContent).toContain('Storage error');
    expect(chip.getAttribute('title')).toBe(
      'Your work may not be saving — open your profile to check storage'
    );
  });

  // The whole point of the maintainer's decision: this one is never allowed to
  // be the thing that disappears when the screen gets small. The chip may get
  // *narrower* below `sm` — see the next test — but it may never stop existing,
  // so what is banned here is a display utility, not a breakpoint.
  it('shows that chip at every width, to every role', () => {
    expect(HEADER_STORAGE_ALERT).not.toMatch(/(^|\s)(sm|md|lg|xl):?(hidden|invisible)\b/);

    for (const role of ['user', 'teacher', 'admin'] as const) {
      cleanup();
      renderHeader(role, 'dark', { storageStatus: 'Error' as StorageStatus });
      expect(screen.getByRole('status')).toBeTruthy();
    }
  });

  // With its label the chip measures 147px, which a rail that can no longer
  // wrap has nowhere to put below `lg`. Narrowing it to the triangle is the
  // only way to keep both promises — visible at every width, and a header that
  // stays 64px and paints nothing over anything.
  it('drops the chip’s words below lg, never the chip or its announcement', () => {
    renderHeader('user', 'dark', { storageStatus: 'Error' as StorageStatus });

    const chip = screen.getByRole('status');
    expect(chip.getAttribute('aria-label')).toBe('Storage error — your work may not be saving');
    // The text is what hides, and it comes back at `lg`.
    const label = screen.getByText('Storage error');
    expect(label.className).toContain('hidden');
    expect(label.className).toContain('lg:inline');
    // The padding shrinks with it, so the pill still fits its icon.
    expect(HEADER_STORAGE_ALERT).toContain('px-2 lg:px-3');
  });

  it('costs nothing while storage is well', () => {
    for (const status of ['IndexedDB', 'LocalStorage', 'Supabase', 'Loading'] as const) {
      cleanup();
      renderHeader('admin', 'dark', { storageStatus: status as StorageStatus });
      expect(screen.queryByRole('status')).toBeNull();
      expect(screen.queryByText('Storage error')).toBeNull();
    }
  });
});

describe('the admin tools stay behind the role gate', () => {
  it('offers a student no trigger at all', () => {
    renderHeader('user');

    expect(screen.queryByRole('button', { name: /(admin|teaching) tools/i })).toBeNull();
    for (const label of ADMIN_TOOLS) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it('shows an admin all eight, under a trigger labelled for the role', () => {
    renderHeader('admin');

    expect(openTools().getAttribute('aria-label')).toBe('Admin tools');
    for (const label of ADMIN_TOOLS) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('shows a teacher the moderation three and none of the system-admin five', () => {
    renderHeader('teacher');

    expect(openTools().getAttribute('aria-label')).toBe('Teaching tools');
    for (const label of ADMIN_TOOLS.slice(2, 5)) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    for (const label of [...ADMIN_TOOLS.slice(0, 2), ...ADMIN_TOOLS.slice(5)]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  // A local curriculum has no shared review queue, so the moderation three have
  // nothing to act on — and with nothing else a teacher may open, the trigger
  // would be a control that opens an empty box.
  it('offers a teacher no trigger when the curriculum is local', () => {
    remote.value = false;
    renderHeader('teacher');

    expect(screen.queryByRole('button', { name: /(admin|teaching) tools/i })).toBeNull();
  });

  // The eight labels are the e2e specs' only selectors — there are no test ids —
  // so the move off the rail had to carry them across byte for byte.
  it('keeps every tool label intact as both title and accessible name', () => {
    renderHeader('admin');
    openTools();

    for (const label of ADMIN_TOOLS) {
      expect(screen.getByLabelText(label).getAttribute('title')).toBe(label);
    }
  });
});

/**
 * DesignSpec §3, Keyboard Reach. This is a NON-modal popover: the page behind it
 * is live, so it must not claim otherwise with `aria-modal` and must not trap.
 * The half of `useFocusTrap` we still owe the keyboard user is the focus
 * restore, which the popover does by hand on close.
 */
describe('the tools popover follows the non-modal contract', () => {
  it('is a dialog that does not claim the page behind it is inert', () => {
    renderHeader('admin');
    openTools();
    const panel = screen.getByRole('dialog');

    expect(panel.getAttribute('aria-modal')).toBeNull();
    // A trap would have put focus inside the panel on open; nothing here moves
    // it off the trigger.
    expect(panel.contains(document.activeElement)).toBe(false);
  });

  it('leaves every item in the page tab order, and nothing tabbable behind it', () => {
    renderHeader('admin');
    openTools();
    const panel = screen.getByRole('dialog');

    // No sentinel, no `tabindex="-1"` wrapper, no `inert` — Tab walks out of the
    // last item and on into the document, which is what §3 asks for.
    expect(panel.getAttribute('tabindex')).toBeNull();
    expect(panel.querySelector('[tabindex="-1"]')).toBeNull();
    for (const label of ADMIN_TOOLS) {
      expect(screen.getByLabelText(label).getAttribute('tabindex')).toBeNull();
    }
  });

  it('closes on Escape and puts focus back on the trigger', () => {
    renderHeader('admin');
    const trigger = openTools();

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  // The whole point of the capture-phase listener: `useEscapeKey`'s stack sits on
  // the bubble phase, and one press must not close this popover AND whatever it
  // opened over.
  it('does not let the Escape reach a listener beneath it', () => {
    const beneath = vi.fn();
    window.addEventListener('keydown', beneath);
    renderHeader('admin');
    openTools();

    fireEvent.keyDown(window, { key: 'Escape' });
    window.removeEventListener('keydown', beneath);

    expect(beneath).not.toHaveBeenCalled();
  });

  it('closes on a press outside it, but not on one inside', () => {
    renderHeader('admin');
    openTools();

    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeTruthy();

    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  // Picking a tool dismisses the popover as well as opening the tool — a menu
  // left standing over the modal it just opened is a menu in the way.
  it('runs the chosen tool and dismisses itself', () => {
    const onOpenRuntimeKeys = vi.fn();
    renderHeader('admin', 'dark', { onOpenRuntimeKeys });
    const trigger = openTools();

    fireEvent.click(screen.getByLabelText('Runtime AI Keys (paste a key to test models)'));

    expect(onOpenRuntimeKeys).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  // It renders through a portal for the same reason PdfExportOptions does: a
  // panel positioned inside the bar is clipped by it and by the stacking context
  // the sticky rail creates.
  it('renders outside the header, above what would clip it', () => {
    const { container } = renderHeader('admin');
    openTools();
    const panel = screen.getByRole('dialog');

    expect(container.contains(panel)).toBe(false);
    expect(document.body.contains(panel)).toBe(true);
    expect(panel.className).toContain('fixed');
  });
});
