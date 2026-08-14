import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import type { User, UserRole } from '../../types';
import * as headerChrome from '../../utils/headerChrome';
import {
  HEADER_ACTION,
  HEADER_ADMIN_BUTTON,
  HEADER_BAR,
  HEADER_HAIRLINE,
  HEADER_INNER,
  HEADER_MARK_TILE,
  HEADER_PROFILE,
  HEADER_SUBLABEL,
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
vi.mock('../../services/curriculumService', () => ({ isCurriculumRemote: () => true }));

import AppHeader from '../../components/AppHeader';
import { StorageStatus } from '../../utils/storageUtils';

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

const renderHeader = (role: UserRole, theme: 'dark' | 'light' = 'dark') =>
  render(
    <AppHeader
      user={makeUser(role, theme)}
      onUpdateUser={vi.fn()}
      apiStatus={{ state: 'HEALTHY', errorCount: 0, isBlocked: false, blockedUntil: 0 }}
      storageStatus={'IndexedDB' as StorageStatus}
      openModal={vi.fn()}
      onOpenAudit={vi.fn()}
      onOpenReviewQueue={vi.fn()}
      onOpenClassInsights={vi.fn()}
      onOpenStudentProgress={vi.fn()}
      onOpenUsageDashboard={vi.fn()}
      onOpenRuntimeKeys={vi.fn()}
    />
  );

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

  it('dresses all eight admin tools identically', () => {
    renderHeader('admin');

    for (const label of ADMIN_TOOLS) {
      expect(screen.getByLabelText(label).className).toContain(HEADER_ADMIN_BUTTON);
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
    expect(HEADER_SUBLABEL).toContain('tracking-[0.2em]');
    expect(HEADER_SUBLABEL).not.toContain('sm:tracking-');
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

describe('the admin tools stay behind the role gate', () => {
  it('shows a student none of the eight', () => {
    renderHeader('user');

    for (const label of ADMIN_TOOLS) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it('shows an admin all eight', () => {
    renderHeader('admin');

    for (const label of ADMIN_TOOLS) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
  });

  it('shows a teacher the moderation three and none of the system-admin five', () => {
    renderHeader('teacher');

    for (const label of ADMIN_TOOLS.slice(2, 5)) {
      expect(screen.getByLabelText(label)).toBeTruthy();
    }
    for (const label of [...ADMIN_TOOLS.slice(0, 2), ...ADMIN_TOOLS.slice(5)]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });
});
