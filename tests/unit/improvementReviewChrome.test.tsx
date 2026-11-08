import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, within } from '@testing-library/react';
import ImprovementReviewModal from '../../components/ImprovementReviewModal';
import { SectionHeading } from '../../components/feedback/FeedbackPieces';
import { FEEDBACK_SECTION_HEADING } from '../../components/feedback/feedbackChrome';
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

  it('gives each score its own band: the from-mark and the to-mark are solid chips', () => {
    renderModal();
    const dialog = screen.getByRole('dialog', { name: 'Your answer, one mark higher' });

    const fromBand = getBandForMark(4, prompt.totalMarks, getCommandTermInfo(prompt.verb).tier);
    const from = within(dialog).getByText('4', { selector: '.band-solid' });
    expect(from.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(fromBand));

    const to = dialog.querySelector('[data-mark-figure="target"]') as HTMLElement;
    expect(to.className).toContain('band-solid');
    expect(to.textContent).toBe('5');
    expect(to.style.getPropertyValue('--band-rgb')).toBe(getBandRgb(4));
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
    expect(selected.className).toContain('band-solid');
    expect(screen.getByRole('button', { name: 'Clean copy' }).className).not.toContain(
      'band-solid'
    );
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
