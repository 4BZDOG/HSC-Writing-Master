import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { readFileSync } from 'node:fs';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import SampleAnswersAccordion from '../../components/SampleAnswersAccordion';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import { PANEL_ROW_MIN_H, PANEL_SURFACE } from '../../utils/panelStyles';
import {
  RIBBON_HEADER_SUBLABEL,
  RIBBON_HEADER_TILE,
  RIBBON_HEADER_TITLE,
  RIBBON_MINI_BAR_UNLIT,
  RIBBON_MINI_STAIR,
} from '../../utils/verbRibbonChrome';
import {
  SAMPLE_MINI_BAR,
  SAMPLE_PANEL_BODY,
  SAMPLE_PANEL_LIT_EDGE,
  SAMPLE_PANEL_LIT_GLOW,
  SAMPLE_PANEL_TOGGLE,
  SAMPLE_ROW,
  SAMPLE_ROW_BODY,
  SAMPLE_ROW_EDGE_OPEN,
  SAMPLE_ROW_EDGE_SHUT,
  SAMPLE_ROW_HEADER,
  SAMPLE_STAT_CELL,
  SAMPLE_STAT_GRID,
  SAMPLE_STAT_LABEL,
  SAMPLE_STAT_VALUE,
} from '../../utils/sampleAnswerChrome';
import * as sampleAnswerChrome from '../../utils/sampleAnswerChrome';
import { getBandConfig, getBandRgb, getTierScaleConfig } from '../../utils/renderUtils';
import type { Prompt, PromptVerb, SampleAnswer, UserRole } from '../../types';

/**
 * The Sample Answers placard is the verb ribbon's language, at reference
 * weight: a header in the ribbon's header vocabulary with the tier on its tile
 * and a mini ladder of the bands its exemplars cover, and mark-level rows that
 * are tier cards with scoreboard headers. The open panel is lit by its tier.
 *
 * What is pinned here is what jsdom can see: the class vocabulary, the
 * `--band-rgb` the panel and each row are lit from, the ladder's three states,
 * and the disclosure's aria state. The colours themselves are measured in the
 * browser (`tests/e2e`), as the ribbon's are.
 *
 * Nothing about behaviour changes: the zoom, the AI actions, the actions on an
 * exemplar, the carousel and the feedback block are the same controls with the
 * same names, and the existing suites (`workspaceReferenceRail`,
 * `sampleSourceBadge`, `draftIntegrity`, `manyExemplarsAndQuestions`, …) still
 * assert on them.
 */

vi.mock('../../services/geminiService', () => ({
  generateSampleAnswer: vi.fn(),
  reviseSampleAnswer: vi.fn(),
  performQualityCheck: vi.fn(),
}));

afterEach(cleanup);

const sample = (over: Partial<SampleAnswer> = {}): SampleAnswer =>
  ({
    id: 's1',
    answer: 'A model response that is short enough to read.',
    mark: 6,
    band: 3,
    source: 'AI',
    ...over,
  }) as SampleAnswer;

/** EXPLAIN is tier 3, so its ceiling is Band 3; EVALUATE is tier 6. */
const renderPanel = (
  options: {
    verb?: PromptVerb;
    totalMarks?: number;
    sampleAnswers?: SampleAnswer[];
    userRole?: UserRole;
    defaultCollapsed?: boolean;
    onUseSampleAnswer?: (text: string) => void;
    onContributeSampleAnswer?: (answer: SampleAnswer) => void;
    onFontSizeChange?: (size: number) => void;
  } = {}
) => {
  const prompt = {
    id: 'p1',
    question: 'Explain how the cell membrane regulates transport.',
    verb: options.verb ?? ('EXPLAIN' as PromptVerb),
    totalMarks: options.totalMarks ?? 6,
    keywords: [],
    sampleAnswers: options.sampleAnswers ?? [],
  } as unknown as Prompt;
  return render(
    <SampleAnswersAccordion
      prompt={prompt}
      onSampleAnswerGenerated={vi.fn()}
      onDeleteSampleAnswer={vi.fn()}
      onUpdateSampleAnswer={vi.fn()}
      onUseSampleAnswer={options.onUseSampleAnswer}
      onContributeSampleAnswer={options.onContributeSampleAnswer}
      onFontSizeChange={options.onFontSizeChange}
      fontSize={options.onFontSizeChange ? 15 : undefined}
      userRole={options.userRole ?? 'user'}
      defaultCollapsed={options.defaultCollapsed ?? false}
    />
  );
};

/** The panel's own disclosure: the button that is named for Sample Answers. */
const toggleOf = (): HTMLElement => screen.getByRole('button', { name: /^Sample Answers/i });
/** The root of the panel, which is the surface every other panel shares. */
const panelOf = (container: HTMLElement): HTMLElement => container.firstElementChild as HTMLElement;
/** The mini ladder, by its exact class (the constant the header renders). */
const ladderOf = (container: HTMLElement): HTMLElement =>
  container.querySelector(`[class="${RIBBON_MINI_STAIR}"]`) as HTMLElement;

/** The `rgb(r, g, b)` string jsdom reports for a band's `r g b` triplet. */
const rgbOf = (band: number): string => `rgb(${getBandRgb(band).split(' ').join(', ')})`;
const rgbaOf = (band: number, alpha: number): string =>
  `rgba(${getBandRgb(band).split(' ').join(', ')}, ${alpha})`;

describe('the header is the ribbon’s header, with the tier on its tile', () => {
  it('names the panel in the ribbon’s title voice, with its summary as the sublabel', () => {
    renderPanel({
      sampleAnswers: [sample({ id: 'a', mark: 6 }), sample({ id: 'b', mark: 4 })],
    });

    const title = screen.getByText('Sample Answers');
    expect(title.tagName).toBe('SPAN');
    expect(title.className).toBe(RIBBON_HEADER_TITLE);
    // A span inside the disclosure button, which is what the shared panel
    // header test looks for.
    expect(toggleOf().querySelector('span.t-section')).toBe(title);

    const summary = screen.getByText(/2 levels · 2 exemplars · Band ceiling 3/);
    expect(summary.className).toBe(RIBBON_HEADER_SUBLABEL);
  });

  it('lights the tile in the verb’s tier, paired the way getBandConfig intends', () => {
    const { container } = renderPanel({ verb: 'EXPLAIN' as PromptVerb });
    const tile = toggleOf().querySelector(`[class*="${RIBBON_HEADER_TILE}"]`) as HTMLElement;
    const config = getTierScaleConfig(getCommandTermInfo('EXPLAIN' as PromptVerb).tier);

    // Tier 3 is yellow, and white on it is 1.9:1, so the tile takes the config's
    // own solidText. The tile is lit whether the panel is open or shut.
    expect(tile.className).toContain(config.solidBg);
    expect(tile.className).toContain(config.solidText);
    expect(tile.className).toContain('text-yellow-950');
    expect(tile.className).not.toContain('text-white');
    expect(container).toBeTruthy();
  });

  it('keeps the header on the panel row height, so the rhythm of the column holds', () => {
    renderPanel();
    expect(toggleOf().className).toContain(PANEL_ROW_MIN_H);
    expect(toggleOf().className).toContain(SAMPLE_PANEL_TOGGLE);
  });

  it('keeps the panel on the shared surface', () => {
    const { container } = renderPanel();
    expect(panelOf(container).className).toContain(PANEL_SURFACE);
  });
});

describe('the mini ladder says which bands the exemplars cover, against the ceiling', () => {
  // EXPLAIN on six marks has a ceiling of Band 3. A mark of 6 is Band 3, a mark
  // of 4 is Band 2, and a mark of 1 is Band 1 — so these two exemplars cover
  // Bands 2 and 3, Band 1 is reachable but has no model yet, and Bands 4–6 are
  // out of the verb's reach.
  const exemplars = [sample({ id: 'a', mark: 6 }), sample({ id: 'b', mark: 4 })];

  it('is the ribbon’s miniature, hidden from assistive technology and from phones', () => {
    const { container } = renderPanel({ sampleAnswers: exemplars });
    const ladder = ladderOf(container);
    expect(ladder).toBeTruthy();
    expect(ladder.getAttribute('aria-hidden')).toBe('true');
    expect(RIBBON_MINI_STAIR).toMatch(/(^|\s)hidden sm:flex/);
    expect(Array.from(ladder.children)).toHaveLength(6);
  });

  it('draws a solid bar for each band that has an exemplar', () => {
    const { container } = renderPanel({ sampleAnswers: exemplars });
    const bars = Array.from(ladderOf(container).children) as HTMLElement[];

    // The bands the two exemplars actually earn, from the same rule the rows use.
    const covered = exemplars.map((s) => getBandForMark(s.mark, 6, 3));
    expect(covered.sort()).toEqual([2, 3]);
    for (const band of covered) {
      expect(bars[band - 1].style.backgroundColor, `band ${band} is covered`).toBe(rgbOf(band));
      expect(bars[band - 1].className).not.toContain(RIBBON_MINI_BAR_UNLIT);
    }
  });

  it('draws a faint bar for a band inside the ceiling that has no exemplar yet', () => {
    const { container } = renderPanel({ sampleAnswers: exemplars });
    const bars = Array.from(ladderOf(container).children) as HTMLElement[];

    // Band 1 is reachable on this verb, and nothing covers it: the gap.
    expect(bars[0].style.backgroundColor).toBe(rgbaOf(1, 0.35));
    expect(bars[0].className).not.toContain(RIBBON_MINI_BAR_UNLIT);
  });

  it('greys the bands above the verb’s ceiling', () => {
    const { container } = renderPanel({ sampleAnswers: exemplars });
    const bars = Array.from(ladderOf(container).children) as HTMLElement[];

    for (const band of [4, 5, 6]) {
      expect(bars[band - 1].className, `band ${band} is above the ceiling`).toContain(
        RIBBON_MINI_BAR_UNLIT
      );
      expect(bars[band - 1].style.backgroundColor).toBe('');
    }
  });

  it('rises from Band 1 to Band 6, with a height for each step', () => {
    const { container } = renderPanel({ sampleAnswers: exemplars });
    const heights = (Array.from(ladderOf(container).children) as HTMLElement[]).map((bar) =>
      parseFloat(bar.style.height)
    );
    expect([...heights].sort((a, b) => a - b)).toEqual(heights);
    expect(new Set(heights).size).toBe(6);
  });

  it('says in its title which bands are covered, and what the ceiling is', () => {
    const { container } = renderPanel({ sampleAnswers: exemplars });
    expect(ladderOf(container).getAttribute('title')).toBe(
      'Model answers at Band 2, 3; band ceiling Band 3'
    );
  });

  it('reads "no band yet" with nothing written, and still shows the ceiling', () => {
    const { container } = renderPanel({ sampleAnswers: [] });
    const bars = Array.from(ladderOf(container).children) as HTMLElement[];
    expect(ladderOf(container).getAttribute('title')).toBe(
      'Model answers at no band yet; band ceiling Band 3'
    );
    // Nothing is solid, and the three reachable bands are faint.
    expect(bars.filter((bar) => bar.style.backgroundColor.startsWith('rgb('))).toHaveLength(0);
    expect(bars.slice(0, 3).every((bar) => bar.style.backgroundColor.startsWith('rgba('))).toBe(
      true
    );
  });
});

describe('the open panel is lit by its tier', () => {
  it('sets the tier’s hue once, on the panel, from getBandRgb', () => {
    const { container } = renderPanel({ verb: 'EVALUATE' as PromptVerb });
    const tier = getCommandTermInfo('EVALUATE' as PromptVerb).tier;
    expect(panelOf(container).style.getPropertyValue('--band-rgb')).toBe(getBandRgb(tier));
  });

  it('has a neutral edge and no glow while it is folded', () => {
    const { container } = renderPanel({ defaultCollapsed: true });
    expect(panelOf(container).style.borderColor).toBe('');
    expect(panelOf(container).style.boxShadow).toBe('');
  });

  it('takes the tier’s edge and glow when it opens, and gives them back when it shuts', () => {
    const { container } = renderPanel({ defaultCollapsed: true, verb: 'EXPLAIN' as PromptVerb });
    fireEvent.click(toggleOf());
    expect(panelOf(container).style.borderColor).toContain('var(--band-rgb)');
    expect(SAMPLE_PANEL_LIT_EDGE).toBe('rgb(var(--band-rgb) / 0.5)');
    expect(SAMPLE_PANEL_LIT_GLOW).toContain('var(--band-rgb)');

    fireEvent.click(toggleOf());
    expect(panelOf(container).style.borderColor).toBe('');
  });
});

describe('the disclosure keeps its aria state and its controls', () => {
  it('reports the open state and names the body it controls', () => {
    const { container } = renderPanel({
      defaultCollapsed: true,
      sampleAnswers: [sample({ id: 'a', mark: 6 })],
    });
    const toggle = toggleOf();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toBeNull();

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const body = document.getElementById(toggle.getAttribute('aria-controls')!);
    expect(body).toBeTruthy();
    expect(body!.className).toContain(SAMPLE_PANEL_BODY);
    expect(container).toBeTruthy();
  });

  it('keeps the reading size controls in the header, reachable while folded', () => {
    const onFontSizeChange = vi.fn();
    renderPanel({ defaultCollapsed: true, onFontSizeChange });
    fireEvent.click(screen.getByTitle(/Increase text size/i));
    expect(onFontSizeChange).toHaveBeenCalledWith(17);
  });

  it('keeps the AI actions to staff', () => {
    renderPanel({ userRole: 'user', defaultCollapsed: false });
    expect(screen.queryByRole('button', { name: /Generate/i })).toBeNull();
    expect(screen.queryByTitle(/Recalibrate samples with AI/i)).toBeNull();
  });

  it('keeps the exemplar actions on an open row, and the teacher’s edit actions for staff', () => {
    const onUseSampleAnswer = vi.fn();
    const onContributeSampleAnswer = vi.fn();
    renderPanel({
      userRole: 'teacher',
      sampleAnswers: [sample({ id: 'a', mark: 6, feedback: 'Strong link.' })],
      onUseSampleAnswer,
      onContributeSampleAnswer,
    });
    fireEvent.click(screen.getByRole('button', { name: /6\/6 marks/i }));

    expect(screen.getByRole('button', { name: /^Use$/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /copy/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /submit/i })).toBeTruthy();
    expect(screen.getByTitle(/Flag it for review/i)).toBeTruthy();
    expect(screen.getByTitle('Revise with AI')).toBeTruthy();
    expect(screen.getByTitle('Edit manually')).toBeTruthy();
    expect(screen.getByTitle('Delete')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Hide Feedback/i })).toBeTruthy();
    expect(screen.getByText('Strong link.')).toBeTruthy();
  });

  it('hides the edit actions and the Use action from a student', () => {
    renderPanel({ userRole: 'user', sampleAnswers: [sample({ id: 'a', mark: 6 })] });
    fireEvent.click(screen.getByRole('button', { name: /6\/6 marks/i }));
    expect(screen.queryByTitle('Delete')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Use$/i })).toBeNull();
  });
});

describe('each mark level is a tier card in its own band', () => {
  const twoLevels = [
    sample({ id: 'a', mark: 6 }), // Band 3
    sample({ id: 'b', mark: 4 }), // Band 2
    sample({ id: 'c', mark: 4, source: 'USER' }),
  ];

  it('draws each row’s edge from its own band, and nothing else', () => {
    renderPanel({ sampleAnswers: twoLevels });

    const headerOfBand6 = screen.getByRole('button', { name: /6\/6 marks/i });
    const rowOfBand6 = headerOfBand6.parentElement as HTMLElement;
    expect(rowOfBand6.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(3));
    expect(rowOfBand6.className).toContain(SAMPLE_ROW);
    expect(rowOfBand6.classList.contains(SAMPLE_ROW_EDGE_SHUT)).toBe(true);
    expect(rowOfBand6.classList.contains('band-edge-strong')).toBe(false);

    const headerOfBand2 = screen.getByRole('button', { name: /4\/6 marks/i });
    expect((headerOfBand2.parentElement as HTMLElement).style.getPropertyValue('--band-rgb')).toBe(
      getBandRgb(2)
    );
  });

  it('gives the row its header in the scoreboard, with the band as a figure', () => {
    renderPanel({ sampleAnswers: twoLevels });
    const header = screen.getByRole('button', { name: /6\/6 marks/i });
    expect(header.className).toContain(SAMPLE_ROW_HEADER);

    const grid = header.querySelector(`[class="${SAMPLE_STAT_GRID}"]`) as HTMLElement;
    expect(grid).toBeTruthy();
    const cells = Array.from(grid.children) as HTMLElement[];
    // One exemplar at this level, so there is no Exemplars cell — it only says
    // something when there is more than one to count.
    expect(cells.map((c) => c.querySelector('span')!.textContent)).toEqual([
      'Mark',
      'Band',
      'Length',
    ]);
    for (const cell of cells) {
      expect(cell.className).toBe(SAMPLE_STAT_CELL);
      expect(cell.querySelector('span')!.className).toBe(SAMPLE_STAT_LABEL);
    }
    // The figures are one text run each, so "6/6 marks" is a single figure.
    const mark = within(grid).getByText('6/6 marks');
    expect(mark.className).toContain(SAMPLE_STAT_VALUE);
    expect(within(grid).getByText('3', { selector: 'span' }).className).toContain(
      getBandConfig(3).text
    );
  });

  it('counts the words and the exemplars at a level in the scoreboard', () => {
    renderPanel({ sampleAnswers: twoLevels });
    const header = screen.getByRole('button', { name: /4\/6 marks/i });
    // Two exemplars at this level, so the Exemplars cell is there and reads 2.
    // The band figure is also 2, so the cell is found by its caption.
    const exemplarsCell = within(header).getByText('Exemplars').parentElement as HTMLElement;
    expect(exemplarsCell.querySelector('span:last-child')!.textContent).toBe('2');
    // The first exemplar is the student's own (trust order puts USER ahead of AI),
    // and its nine words are what the Length cell counts.
    expect(within(header).getByText('9 words')).toBeTruthy();
  });

  it('opens a row to a statement edge in the same band, and shuts it to a whisper', () => {
    renderPanel({ sampleAnswers: twoLevels });
    const header = screen.getByRole('button', { name: /6\/6 marks/i });
    const row = header.parentElement as HTMLElement;

    expect(header.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(header);
    expect(header.getAttribute('aria-expanded')).toBe('true');
    expect(row.classList.contains(SAMPLE_ROW_EDGE_OPEN)).toBe(true);
    expect(row.classList.contains(SAMPLE_ROW_EDGE_SHUT)).toBe(false);

    const body = document.getElementById(header.getAttribute('aria-controls')!);
    expect(body).toBeTruthy();
    expect(body!.hasAttribute('inert')).toBe(false);
    expect(body!.querySelector(`[class*="${SAMPLE_ROW_BODY}"]`)).toBeTruthy();

    fireEvent.click(header);
    expect(row.classList.contains(SAMPLE_ROW_EDGE_SHUT)).toBe(true);
    expect(body!.hasAttribute('inert')).toBe(true);
  });

  it('keeps the carousel, the source line and the level tabs on an open row', () => {
    renderPanel({ sampleAnswers: twoLevels });
    fireEvent.click(screen.getByRole('button', { name: /4\/6 marks/i }));
    // Two exemplars at this level, so the picker and the arrows are there.
    expect(screen.getByRole('tablist', { name: /exemplars at this mark/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /next sample/i })).toBeTruthy();
    // "Student" is the source badge and also the first tab's label, so it is
    // found by its presence rather than as a single match.
    expect(screen.getAllByText('Student').length).toBeGreaterThan(0);
    expect(screen.getAllByText('AI Model').length).toBeGreaterThan(0);
  });
});

describe('the placard’s class vocabulary is pinned', () => {
  const source = readFileSync('utils/sampleAnswerChrome.ts', 'utf8');

  /** Every exported string, by name. */
  const strings = Object.entries(sampleAnswerChrome).filter(
    ([, value]) => typeof value === 'string'
  ) as [string, string][];

  /** A colour utility that names a ground, an ink or a hairline. */
  const colourProperty = (token: string): string | null => {
    const utility = token.split(':').pop() as string;
    const match = utility.match(/^(text|bg|border|from|via|to|shadow|ring|divide)-(.+)$/);
    if (!match) return null;
    const [, property, value] = match;
    if (/^(transparent|current|inherit|none)$/.test(value)) return null;
    const alpha = '(\\/(\\[[^\\]]+\\]|[\\d.]+))?';
    const isColour =
      new RegExp(`^(white|black)${alpha}$`).test(value) ||
      new RegExp(`^[a-z]+-\\d{2,3}${alpha}$`).test(value) ||
      value.startsWith('[rgb(');
    return isColour ? property : null;
  };

  it('has constants to hold to it', () => {
    expect(strings.length).toBeGreaterThanOrEqual(15);
  });

  it('documents every export with a doc comment, saying what it is painted on', () => {
    // A block comment directly above each export, and it names the surface.
    const exports = Array.from(source.matchAll(/^export const (\w+)/gm)).map((m) => m[1]);
    expect(exports.length).toBe(strings.length);
    for (const name of exports) {
      const index = source.indexOf(`export const ${name}`);
      const before = source.slice(0, index).trimEnd();
      expect(before.endsWith('*/'), `${name} has no doc comment`).toBe(true);
      const comment = before.slice(before.lastIndexOf('/**'));
      expect(comment, `${name} does not say what it is painted on`).toMatch(
        /[Pp]ainted (on|in)|Painted|painted/
      );
    }
  });

  it('names no hex colour', () => {
    for (const [name, value] of strings) {
      expect(value, `${name} names a hex colour`).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    }
  });

  it('draws no band colour from a palette literal — the tier comes from --band-rgb', () => {
    for (const [name, value] of strings) {
      expect(value, `${name} names a band palette colour`).not.toMatch(
        /\b(red|orange|yellow|green|blue|purple|amber|emerald|violet|indigo)-\d{2,3}\b/
      );
    }
  });

  it('is dark-first: no light: variant anywhere', () => {
    for (const [name, value] of strings) {
      expect(value, `${name} still uses the legacy light: variant`).not.toContain('light:');
    }
  });

  it('gives every colour on a themed surface a dark: partner', () => {
    // The band-tinted classes are one colour in both themes, the same exemption the
    // ribbon makes for its halo: `band-edge`, `band-edge-strong` and `band-wash`
    // draw `--band-rgb` at an alpha and have no ground to get wrong.
    const exempt = new Set(['band-edge', 'band-edge-strong', 'band-wash']);
    for (const [name, value] of strings) {
      const tokens = value.split(/\s+/).filter(Boolean);
      const themed = new Set(
        tokens
          .filter((t) => t.startsWith('dark:'))
          .map(colourProperty)
          .filter(Boolean)
      );
      for (const token of tokens) {
        if (token.startsWith('dark:') || exempt.has(token)) continue;
        const property = colourProperty(token);
        if (!property) continue;
        expect(themed.has(property), `${name} sets \`${token}\` with no dark: partner`).toBe(true);
      }
    }
  });

  it('holds small text to the contrast floor in both themes', () => {
    // The caption and the figure label are 12px: slate-600 on white is 7.6:1 and
    // slate-300 on the dark surface is 13.3:1. slate-500 is 4.1:1 on the dark one.
    expect(SAMPLE_STAT_LABEL).toContain('text-slate-600');
    expect(SAMPLE_STAT_LABEL).toContain('dark:text-slate-300');
    expect(SAMPLE_STAT_LABEL).not.toMatch(/text-slate-500/);
    expect(SAMPLE_STAT_LABEL).not.toMatch(/dark:text-slate-400/);
  });

  it('dims nothing with opacity, and animates nothing forever', () => {
    for (const [name, value] of strings) {
      expect(value, `${name} dims with opacity`).not.toMatch(/(^|\s)opacity-/);
      expect(value, `${name} runs forever`).not.toMatch(/animate-(ping|pulse|bounce|spin)/);
    }
  });

  it('transitions only the properties it names, and never all', () => {
    for (const [name, value] of strings) {
      expect(value, `${name} transitions \`all\``).not.toMatch(/(^|\s)transition-all(\s|$)/);
    }
    expect(SAMPLE_ROW).toContain('transition-[border-color]');
  });

  it('gates every hover to a device that can hover', () => {
    for (const [name, value] of strings) {
      for (const token of value.split(/\s+/)) {
        if (!/(^|:)(group-)?hover([/:]|$)/.test(token)) continue;
        expect(token, `${name} has an ungated hover: ${token}`).toMatch(/(^|:)can-hover:/);
      }
    }
  });

  it('draws every focus ring in both themes, inset because the panel clips', () => {
    for (const [name, value] of strings) {
      if (!value.includes('focus-visible:ring-')) continue;
      expect(value, `${name} has a focus ring with no dark partner`).toContain(
        'dark:focus-visible:ring-'
      );
      expect(value, `${name} draws its focus ring outside the box`).toContain(
        'focus-visible:ring-inset'
      );
    }
  });

  it('keeps the lit edge and glow to the tier’s own hue, from a variable', () => {
    for (const value of [SAMPLE_PANEL_LIT_EDGE, SAMPLE_PANEL_LIT_GLOW]) {
      expect(value).toContain('var(--band-rgb)');
      expect(value).not.toMatch(/#[0-9a-f]{3,8}/i);
      expect(value).not.toMatch(/\b(rgb|rgba|hsl)\(\s*\d/);
    }
  });

  it('has the constants the placard renders, in the classes it renders them with', () => {
    expect(SAMPLE_PANEL_BODY).toContain('flex-col');
    expect(SAMPLE_ROW).toContain('rounded-2xl');
    expect(SAMPLE_ROW_EDGE_SHUT).toBe('band-edge');
    expect(SAMPLE_ROW_EDGE_OPEN).toBe('band-edge-strong');
    expect(SAMPLE_MINI_BAR).toContain('w-1');
    expect(SAMPLE_STAT_GRID).toContain('grid-cols-2');
    expect(SAMPLE_STAT_GRID).toContain('sm:grid-cols-4');
    expect(SAMPLE_STAT_VALUE).toContain('font-mono');
    expect(SAMPLE_STAT_VALUE).toContain('tabular-nums');
  });
});
