import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import ImprovementReviewModal from '../../components/ImprovementReviewModal';
import { SectionHeading } from '../../components/feedback/FeedbackPieces';
import { FEEDBACK_SECTION_HEADING } from '../../components/feedback/feedbackChrome';
import { promptBandForMark } from '../../utils/guideBands';
import { getBandForMark, getCommandTermInfo } from '../../data/commandTerms';
import { getBandHex, getBandRgb } from '../../utils/renderUtils';
import type { Prompt, PromptVerb } from '../../types';
import { Zap } from 'lucide-react';

/**
 * The chrome the improve modal and the marking feedback share with the workspace
 * cards: the band strip and its all-caps hero, the band-coloured score, the
 * ruled sheet the response sits on, and the section headings in the display voice.
 * Structure only: jsdom does no layout, so none of this measures pixels.
 */
afterEach(cleanup);

const prompt: Prompt = {
  id: 'p1',
  question: 'Analyse the impact of caching on system performance.',
  totalMarks: 8,
  verb: 'Analyse' as PromptVerb,
  keywords: ['cache hit ratio', 'latency'],
  sampleAnswers: [],
} as unknown as Prompt;

const ORIGINAL = 'Caching stores data. It makes the system faster.';
const IMPROVED =
  'Caching stores frequently requested data. It makes the system faster by reducing latency.';

const renderModal = () =>
  render(
    <ImprovementReviewModal
      isOpen
      onClose={vi.fn()}
      improvedAnswer={IMPROVED}
      originalAnswer={ORIGINAL}
      originalPrompt={prompt}
      targetBand={4}
      targetMark={5}
      originalMark={4}
      onApply={vi.fn()}
    />
  );

describe('ImprovementReviewModal chrome', () => {
  it('draws the header as the card band strip, with the all-caps hero title', () => {
    renderModal();

    const title = screen.getByRole('heading', { name: 'Your answer, one mark higher' });
    // The words stay in sentence case in the DOM; the capitals are the style's.
    expect(title.className).toContain('t-display');
    expect(title.className).toContain('uppercase');
    expect(title.className).toContain('italic');

    // The strip is the card header box, white ink on the band's ground. jsdom drops
    // the gradient itself, so the ground's contrast is held by the e2e audit.
    const strip = title.closest('header');
    expect(strip).toBeTruthy();
    expect(strip!.className).toContain('text-white');
    expect(strip!.className).toContain('px-4');
  });
  // The level key is the header's one statement of the three levels: the You tile in the
  // student's band, the Improved tile one step stronger in the rewrite's band, each with its
  // 3px rule along its foot. The Top is a third tile, joined by a dotted connector.
  it('draws the level key: You, Improved and Top, each tile in its own band', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Your answer, one mark higher' });
    const key = within(dialog).getByRole('group', { name: /You scored 4 out of 8/ });

    const youBand = getBandForMark(4, prompt.totalMarks, getCommandTermInfo(prompt.verb).tier);
    const you = within(key).getByText('4');
    expect(you.className).toContain('bg-white/15');
    expect(you.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(youBand));
    expect(you.querySelector('span[aria-hidden="true"]')!.className).toContain('h-[3px]');

    const improved = dialog.querySelector('[data-mark-figure="target"]') as HTMLElement;
    expect(improved.className).toContain('bg-white/25');
    expect(improved.className).toContain('font-black');
    expect(improved.textContent).toBe('5');
    expect(improved.style.getPropertyValue('--band-rgb')).toBe(
      getBandRgb(promptBandForMark(prompt, 5))
    );
    expect(improved.querySelector('span[aria-hidden="true"]')!.className).toContain('h-[3px]');

    // The top of this question is the third tile: 8 out of 8, Band 4 on the verb's formula.
    expect(within(key).getByText('Top')).toBeTruthy();
    expect(within(key).getByText('8')).toBeTruthy();
  });

  it('says the key in one sentence for a screen reader, with both bands and the top', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Your answer, one mark higher' });
    const you = getBandForMark(4, prompt.totalMarks, getCommandTermInfo(prompt.verb).tier);
    const improved = promptBandForMark(prompt, 5);
    const top = promptBandForMark(prompt, prompt.totalMarks);
    expect(
      within(dialog).getByRole('group', {
        name: `You scored 4 out of 8, Band ${you}. The improved response reaches 5 out of 8, Band ${improved}. The top of this question is 8 out of 8, Band ${top}.`,
      })
    ).toBeTruthy();
  });

  // The header's band is the one the feedback behind it names. On a ranged guide the marking
  // guide's row decides a mark's band, and the verb's formula does not: 11/20 is Band 4 on the
  // guide, Band 3 on the formula. The window used to take the formula and disagree with the
  // placard, so this fails on that code.
  it('names the same You band as the feedback behind it, on a ranged marking guide', () => {
    const ranged = {
      ...prompt,
      totalMarks: 20,
      verb: 'DISCUSS' as PromptVerb,
      markingCriteria:
        '17-20 marks: Analyses skilfully\n14-16 marks: Analyses effectively\n11-13 marks: Analyses\n7-10 marks: Describes\n1-6 marks: Refers minimally',
    } as Prompt;
    render(
      <ImprovementReviewModal
        isOpen
        onClose={vi.fn()}
        improvedAnswer={IMPROVED}
        originalAnswer={ORIGINAL}
        originalPrompt={ranged}
        targetBand={4}
        targetMark={14}
        originalMark={11}
        onApply={vi.fn()}
      />
    );
    const dialog = screen.getByRole('dialog');
    const youBand = promptBandForMark(ranged, 11);
    expect(youBand).not.toBe(getBandForMark(11, 20, 5));
    expect(dialog.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(youBand));
    expect(
      within(dialog).getByRole('group', {
        name: new RegExp(`You scored 11 out of 20, Band ${youBand}\\.`),
      })
    ).toBeTruthy();
  });

  it('shows a short title beside the scores on a phone, with the full title as the name', () => {
    renderModal();

    const title = screen.getByRole('heading', { name: 'Your answer, one mark higher' });
    expect(title.textContent).toContain('One mark higher');
    expect(within(title).getByText('One mark higher').className).toContain('sm:hidden');
  });

  it('keeps emerald and rose to the diff marks, not the stat figures', () => {
    renderModal();

    for (const label of ['words added', 'words cut']) {
      const tile = screen.getByText(label).closest('div')!;
      const figure = tile.querySelector('dd')!;
      expect(figure.className).not.toMatch(/emerald|rose/);
      expect(figure.className).toContain('text-slate-900');
    }
  });

  it('sets the response on a sheet ruled like the writing area', () => {
    renderModal();

    const sheet = document.querySelector('.editor-ruling') as HTMLElement;
    expect(sheet).toBeTruthy();
    // The rules are measured from the reading size, and the margin is Band 1's red.
    expect(sheet.style.getPropertyValue('--editor-fs')).toBe('17px');
    expect(sheet.style.getPropertyValue('--editor-margin')).toBe(getBandHex(1));
    // The response's own lines are one rule step each: 1.8 leading, as the editor's.
    const text = sheet.querySelector('p') as HTMLElement;
    expect(text.className).toContain('leading-[1.8]');
    expect(text.textContent).toContain('frequently requested data');
  });

  it('shows the selected view with the band, as the editor toolbar does', () => {
    renderModal();

    const selected = screen.getByRole('button', { name: 'Edits marked' });
    expect(selected.getAttribute('aria-pressed')).toBe('true');
    // A neutral raised segment, with the band as a rule along its foot (`after:`), not a fill.
    expect(selected.className).not.toContain('band-solid');
    expect(selected.className).toContain('ring-1');
    expect(selected.className).toContain('after:bg-[rgb(var(--next-rgb))]');
    expect(screen.getByRole('button', { name: 'Clean copy' }).className).not.toContain('after:bg-');
  });
});

describe('SectionHeading', () => {
  it('sets the section in the display voice, at section size', () => {
    render(<SectionHeading icon={Zap} label="Improved response" />);

    const heading = screen.getByRole('heading', { name: 'Improved response' });
    expect(heading.className).toBe(FEEDBACK_SECTION_HEADING);
    expect(heading.className).toContain('t-display');
    expect(heading.className).toContain('uppercase');
    expect(heading.className).toContain('italic');
  });
});
