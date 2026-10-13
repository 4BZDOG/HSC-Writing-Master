import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  PROFILE_CARD,
  PROFILE_SECTION_TITLE,
  ProfileScoreboard,
} from '../../components/ProfileCharts';
import {
  HEADER_MENU_ITEM,
  HEADER_MENU_ITEM_HINT,
  HEADER_MENU_PANEL,
  HEADER_MENU_STATUS,
  HEADER_TELEMETRY,
} from '../../utils/headerChrome';
import { RIBBON_HEADER_BAR, RIBBON_ROOT } from '../../utils/verbRibbonChrome';

/**
 * The light-theme shape of the profile and the surfaces it opens: paper cards with
 * an edge on a desk, sentence-case section headings, a single history note, and the
 * tools popover as a step on the paper. jsdom has no stylesheet, so these pin the
 * class vocabulary; the computed colours are measured in a browser during review.
 */

const classes = (s: string) => s.split(/\s+/).filter(Boolean);

describe('profile cards sit on the desk as paper with an edge', () => {
  it('is paper with a real edge and the resting shadow, not a second white', () => {
    expect(classes(PROFILE_CARD)).toEqual(expect.arrayContaining(['bg-surface', 'shadow-sm']));
    // The edge: slate-300 is the step that survives a bright monitor; slate-200 did not.
    expect(classes(PROFILE_CARD)).toContain('border-slate-300');
    expect(classes(PROFILE_CARD)).not.toContain('bg-white');
    expect(classes(PROFILE_CARD)).not.toContain('border-slate-200');
  });

  it('keeps the dark card as a translucent lift, with no shadow', () => {
    expect(classes(PROFILE_CARD)).toEqual(
      expect.arrayContaining(['dark:bg-white/[0.03]', 'dark:shadow-none'])
    );
  });
});

describe('section headings are sentence case in the display face', () => {
  it('drops the caps, italics and tracking of the t-section voice', () => {
    expect(classes(PROFILE_SECTION_TITLE)).toContain('t-display');
    expect(classes(PROFILE_SECTION_TITLE)).not.toContain('t-section');
    expect(classes(PROFILE_SECTION_TITLE)).not.toContain('uppercase');
    expect(classes(PROFILE_SECTION_TITLE)).not.toContain('italic');
  });
});

describe('the head scoreboard is part of the head, with no box of its own', () => {
  it('draws four cells with hairlines between them, and no fill or border on the strip', () => {
    const { container } = render(
      <ProfileScoreboard
        cells={[
          { label: 'Answers marked', value: '47' },
          { label: 'Avg mark', value: '65%' },
          { label: 'Words', value: '2.0k' },
          { label: 'Day streak', value: '11' },
        ]}
      />
    );
    const strip = container.querySelector('dl') as HTMLElement;
    expect(strip).toBeTruthy();
    expect(classes(strip.className)).toEqual(expect.arrayContaining(['sm:divide-x']));
    expect(classes(strip.className)).not.toContain('bg-surface-elevated');
    expect(classes(strip.className)).not.toContain('bg-slate-200');
    expect(screen.getByText('65%')).toBeTruthy();
    expect(container.querySelectorAll('dd')).toHaveLength(4);
  });
});

describe('the tools popover is a step on the paper', () => {
  it('is the elevated rung with an edge and the lifted shadow, not a flat white', () => {
    expect(classes(HEADER_MENU_PANEL)).toEqual(
      expect.arrayContaining(['bg-surface-elevated', 'border-slate-300', 'shadow-lg'])
    );
    expect(classes(HEADER_MENU_PANEL)).not.toContain('bg-white');
  });

  it('shows its hover one rung into the panel, on hover-capable devices only', () => {
    expect(classes(HEADER_MENU_ITEM)).toEqual(
      expect.arrayContaining(['can-hover:hover:bg-surface-inset', 'min-h-11'])
    );
    // A plain `hover:` would leave a tapped row highlighted on a phone.
    expect(classes(HEADER_MENU_ITEM)).not.toContain('hover:bg-slate-100');
    expect(classes(HEADER_MENU_ITEM)).toEqual(
      expect.arrayContaining([
        'focus-visible:ring-slate-900/40',
        'dark:focus-visible:ring-white/60',
      ])
    );
  });

  it('holds its 11px hint and its footer at AA on the panel', () => {
    expect(classes(HEADER_MENU_ITEM_HINT)).toContain('text-slate-600');
    expect(classes(HEADER_TELEMETRY)).toContain('text-slate-600');
  });

  it('states the status chip in dark-first tokens, not light: variants', () => {
    expect(HEADER_MENU_STATUS).not.toMatch(/(^|\s)light:/);
    expect(classes(HEADER_MENU_STATUS)).toEqual(
      expect.arrayContaining(['bg-indigo-100', 'dark:bg-indigo-500/10'])
    );
  });
});

describe('the idle verb ribbon has an edge the page can see', () => {
  it('frames the shut bar with a firmer rim and the resting shadow', () => {
    expect(classes(RIBBON_ROOT)).toEqual(expect.arrayContaining(['border-slate-400', 'shadow-sm']));
    expect(classes(RIBBON_ROOT)).not.toContain('border-slate-300');
  });

  it('keeps the bar opaque white in the light theme, so the rim is what separates it', () => {
    expect(classes(RIBBON_HEADER_BAR)).toContain('bg-white');
  });
});
