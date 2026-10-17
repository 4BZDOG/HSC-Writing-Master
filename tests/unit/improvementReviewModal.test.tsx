import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, within, waitFor, act } from '@testing-library/react';
import ImprovementReviewModal from '../../components/ImprovementReviewModal';
import type { Prompt, PromptVerb } from '../../types';

/**
 * The improvement is an EDIT of the student's own answer, so the review has to
 * read as a diff: what was added, what was cut, and how much of their own
 * writing survived. A block of new prose teaches none of that.
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

/**
 * Three separate edits: two→alpha, seven→beta and twelve→gamma. Each gap of kept
 * words is four long, which is past the two-word bridge, so they stay apart.
 */
const THREE_EDITS_ORIGINAL = 'one two three four five six seven eight nine ten eleven twelve';
const THREE_EDITS_REVISED = 'one alpha three four five six beta eight nine ten eleven gamma';

const renderModal = (over: Partial<React.ComponentProps<typeof ImprovementReviewModal>> = {}) => {
  const onApply = vi.fn();
  const onClose = vi.fn();
  render(
    <ImprovementReviewModal
      isOpen
      onClose={onClose}
      improvedAnswer={IMPROVED}
      originalAnswer={ORIGINAL}
      originalPrompt={prompt}
      targetBand={4}
      targetMark={5}
      originalMark={4}
      onApply={onApply}
      {...over}
    />
  );
  return { onApply, onClose };
};

describe('ImprovementReviewModal', () => {
  /**
   * The unified view is one reading column in a 1152px modal; side by side is
   * already two narrow panes. The bound belongs to the first and not the second,
   * and it belongs to the wrapper holding BOTH the legend and the prose, so the
   * two narrow together instead of the text stranding itself inside a card
   * nobody narrowed — which is what the reverted `max-w-[56ch]` on the text did.
   *
   * This pins the structure. It does not measure pixels: jsdom does no layout,
   * so the character count this buys was reasoned from the modal's width, not
   * observed. See DesignSpec §4, "Measure".
   */
  it('bounds the unified reading column, and only that view', () => {
    renderModal();

    const marked = screen.getByText(/everything unmarked is your own writing/i);
    const column = marked.closest('div');
    expect(column?.className, 'the unified column carries the reading bound').toMatch(/max-w-3xl/);
    expect(column?.className).toMatch(/mx-auto/);

    fireEvent.click(screen.getByText('Side by side'));
    expect(
      document.body.querySelectorAll('.max-w-3xl').length,
      'side by side needs no bound — its panes are already half the modal'
    ).toBe(0);
  });

  it('marks the added words and leaves the student’s own words unmarked', () => {
    renderModal();

    const added = screen.getAllByTitle('Added by the marker').map((el) => el.textContent?.trim());
    expect(added.join(' ')).toContain('frequently requested');
    expect(added.join(' ')).toContain('by reducing latency');

    // Nothing was cut in this revision, so no strike-through runs at all.
    expect(screen.queryAllByTitle('Cut by the marker')).toHaveLength(0);
  });

  it('marks words the revision cut', () => {
    renderModal({ improvedAnswer: 'Caching stores data.' });

    const cut = screen.getAllByTitle('Cut by the marker').map((el) => el.textContent?.trim());
    expect(cut.join(' ')).toContain('It makes the system faster.');
  });

  /**
   * A replacement that ends where a paragraph breaks ("numbers.\n\n" cut, the
   * new sentence ending in its own break) used to paint the break inside the
   * marks: an empty struck-through bar, then the new sentence on a paragraph of
   * its own, then an empty green bar. Only the words go inside a mark now.
   */
  const paragraphBreakEdit = {
    originalAnswer: 'The graph shows reading the numbers.\n\nVisualisations also matter.',
    improvedAnswer:
      'The graph shows the acceleration after 1990 the first thing the reader notices.\n\nVisualisations also matter.',
  };

  it('keeps paragraph breaks out of the marks, so an edit draws no empty bar', () => {
    renderModal(paragraphBreakEdit);

    const marks = Array.from(document.body.querySelectorAll('mark'));
    expect(marks.length).toBeGreaterThan(0);
    for (const mark of marks) {
      expect(mark.textContent).not.toMatch(/\n/);
      expect(mark.textContent?.trim()).not.toBe('');
    }
    // The revision's own break still ends the paragraph the new sentence is in.
    const page = document.body.querySelector('p.font-serif')!;
    expect(page.textContent).toContain('notices.\n\nVisualisations');
  });

  it('keeps the original paragraph break in the original column, where it is the student’s', () => {
    renderModal(paragraphBreakEdit);

    fireEvent.click(screen.getByText('Side by side'));

    const [original, revised] = Array.from(document.body.querySelectorAll('p.font-serif'));
    expect(original.textContent).toContain('numbers.\n\nVisualisations');
    expect(revised.textContent).toContain('notices.\n\nVisualisations');
    for (const mark of Array.from(document.body.querySelectorAll('mark'))) {
      expect(mark.textContent?.trim()).not.toBe('');
    }
  });

  it('cuts a run that spans paragraphs at each break, so no mark holds an empty line', () => {
    // The insertion carries a break INSIDE it, not only at its end: a new
    // closing sentence and a whole new paragraph after it.
    renderModal({
      originalAnswer: 'Tables hide the trend.\n\nGraphs show it.',
      improvedAnswer:
        'Tables hide the trend in rows of figures.\n\nA reader must build it alone.\n\nGraphs show it.',
    });

    const marks = Array.from(document.body.querySelectorAll('mark'));
    expect(marks.length).toBeGreaterThan(1);
    for (const mark of marks) {
      expect(mark.textContent).not.toMatch(/\n/);
      expect(mark.textContent?.trim()).not.toBe('');
    }
    const page = document.body.querySelector('p.font-serif')!;
    expect(page.textContent).toContain('figures.\n\nA reader must build it alone.\n\nGraphs');
  });

  it('reports how much of the student’s own writing survived', () => {
    renderModal();

    expect(screen.getByText('of your words kept')).toBeTruthy();
    // Every original word is carried through, so retention is 100%.
    expect(screen.getByText('100%')).toBeTruthy();
  });

  it('names the mark it moved from and to', () => {
    renderModal();

    const dialog = screen.getByRole('dialog', { name: 'Your answer, one mark higher' });
    expect(within(dialog).getByText('4')).toBeTruthy();
    expect(within(dialog).getByText('5')).toBeTruthy();
    expect(screen.getByText('Band 4')).toBeTruthy();
  });

  /**
   * The header states the gain once. The title says it, the figure shows the
   * move, and the line under the figure names only the band. The "+1 mark"
   * chip used to say it a third time.
   */
  it('says how many marks when the gain is more than one, and only once', () => {
    renderModal({ originalMark: 3, targetMark: 5 });

    expect(screen.getByRole('dialog', { name: 'Your answer, 2 marks higher' })).toBeTruthy();
    expect(screen.queryByText(/\+2 marks/)).toBeNull();
    expect(screen.queryByText(/\+1 mark/)).toBeNull();
  });

  it('names the syllabus terms the revision brought in', () => {
    renderModal();

    const panel = screen.getByText(/Syllabus terms the revision added/).closest('section')!;
    expect(within(panel).getByText('latency')).toBeTruthy();
    // A term the student already used is not claimed as new.
    expect(within(panel).queryByText('cache hit ratio')).toBeNull();
  });

  it('applies the revised text, not the marked-up version', () => {
    const { onApply } = renderModal();

    fireEvent.click(screen.getByText('Use this version'));

    expect(onApply).toHaveBeenCalledWith(IMPROVED);
  });

  it('offers a side-by-side view that shows each side its own text', () => {
    renderModal();

    fireEvent.click(screen.getByText('Side by side'));

    expect(screen.getByText('Your original')).toBeTruthy();
    expect(screen.getByText('Improved')).toBeTruthy();
    // Word counts for each column come from the diff, not a separate count.
    expect(screen.getByText('8 words')).toBeTruthy();
    expect(screen.getByText('13 words')).toBeTruthy();
  });

  it('says plainly when the marker changed nothing', () => {
    renderModal({ improvedAnswer: ORIGINAL });

    expect(screen.getByText(/No changes — this is already your answer/)).toBeTruthy();
    expect(screen.queryAllByTitle('Added by the marker')).toHaveLength(0);
    // With no changes there is nothing to step through…
    expect(screen.queryByLabelText('Next change')).toBeNull();
    // …nothing to apply…
    expect(screen.queryByText('Use this version')).toBeNull();
    // …and no extra mark to claim.
    expect(screen.getByText('Your answer, unchanged')).toBeTruthy();
    expect(screen.queryByText(/\+1 mark/)).toBeNull();
  });

  it('treats a punctuation-only rewrite as no change', () => {
    renderModal({ improvedAnswer: `${ORIGINAL.replace(/\.$/, '')}!` });

    expect(screen.getByText(/No changes — this is already your answer/)).toBeTruthy();
  });

  it('ignores markdown the model wrapped around its wording', () => {
    // "**faster**" is the student's own word in bold, not an addition.
    renderModal({
      originalAnswer: 'Caching stores data. It makes the system faster.',
      improvedAnswer: 'Caching stores data. It makes the system **faster**.',
    });

    expect(screen.getByText(/No changes — this is already your answer/)).toBeTruthy();
  });

  it('steps through the changes in a long revision', () => {
    renderModal({
      originalAnswer: THREE_EDITS_ORIGINAL,
      improvedAnswer: THREE_EDITS_REVISED,
    });

    // Three separated edits, counted as three — not as six insert/delete runs.
    expect(screen.getByText('1/3')).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Next change'));
    expect(screen.getByText('2/3')).toBeTruthy();
    // The counter wraps rather than dead-ending.
    fireEvent.click(screen.getByLabelText('Previous change'));
    fireEvent.click(screen.getByLabelText('Previous change'));
    expect(screen.getByText('3/3')).toBeTruthy();
  });

  /**
   * "slow and costly" → "quick and cheap" is one rewrite. The kept "and" between
   * the two changes is two words' worth of bridge, so the margin lists one edit
   * with both halves in full, and the page marks only the words that changed.
   */
  const BRIDGED = {
    originalAnswer: 'the system is slow and costly',
    improvedAnswer: 'the system is quick and cheap',
  };

  it('reads two changes with a short kept run between them as one edit', () => {
    renderModal(BRIDGED);

    const margin = screen.getByRole('complementary', { name: 'What changed and why' });
    const items = within(margin).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('slow and costly');
    expect(items[0].textContent).toContain('quick and cheap');
    // One edit has nothing to step through, and only the one number on the page.
    expect(screen.queryByLabelText('Next change')).toBeNull();
    expect(screen.getByLabelText('Edit 1')).toBeTruthy();
    expect(screen.queryByLabelText('Edit 2')).toBeNull();
  });

  it('leaves the bridged kept word unmarked, and marks only what changed', () => {
    renderModal(BRIDGED);

    const added = screen.getAllByTitle('Added by the marker').map((el) => el.textContent?.trim());
    const cut = screen.getAllByTitle('Cut by the marker').map((el) => el.textContent?.trim());
    expect(added).toEqual(['quick', 'cheap']);
    expect(cut).toEqual(['slow', 'costly']);
  });

  it('rings every changed run of a bridged edit, and not the kept word between them', () => {
    renderModal(BRIDGED);

    const ringed = () =>
      Array.from(document.body.querySelectorAll('mark'))
        .filter((m) => m.className.includes('ring-2'))
        .map((m) => m.textContent?.trim());
    expect(ringed()).toEqual(['slow', 'quick', 'costly', 'cheap']);

    // The side-by-side revised column rings the same two insertions, in its own indexing.
    fireEvent.click(screen.getByText('Side by side'));
    expect(ringed()).toEqual(['quick', 'cheap']);
  });

  it('numbers each edit on the page and lists the same numbers in the margin', () => {
    renderModal({
      originalAnswer: THREE_EDITS_ORIGINAL,
      improvedAnswer: THREE_EDITS_REVISED,
    });

    const margin = screen.getByRole('complementary', { name: 'What changed and why' });
    const items = within(margin).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    // A replacement shows what was cut and what took its place.
    expect(items[0].textContent).toContain('two');
    expect(items[0].textContent).toContain('alpha');
    // The page carries a numbered marker for each edit.
    expect(screen.getByLabelText('Edit 1')).toBeTruthy();
    expect(screen.getByLabelText('Edit 3')).toBeTruthy();
  });

  it('moves to an edit picked from the margin or the page', () => {
    renderModal({
      originalAnswer: THREE_EDITS_ORIGINAL,
      improvedAnswer: THREE_EDITS_REVISED,
    });

    const margin = screen.getByRole('complementary', { name: 'What changed and why' });
    fireEvent.click(within(margin).getAllByRole('button')[2]);
    expect(screen.getByText('3/3')).toBeTruthy();

    fireEvent.click(screen.getByLabelText('Edit 2'));
    expect(screen.getByText('2/3')).toBeTruthy();
  });

  it('gives each inline marker a 44px hit area that does not change the line it sits in', () => {
    // The pill is about 14px tall on a phone. Its tap target is a 44px square
    // drawn by an absolutely positioned pseudo-element, so the layout of the
    // prose is the same with or without it.
    renderModal({
      originalAnswer: THREE_EDITS_ORIGINAL,
      improvedAnswer: THREE_EDITS_REVISED,
    });

    const marker = screen.getByLabelText('Edit 1');
    expect(marker.className).toContain('relative');
    expect(marker.className).toContain('after:absolute');
    expect(marker.className).toContain('after:h-11');
    expect(marker.className).toContain('after:w-11');
    expect(marker.className).toContain('after:-translate-x-1/2');
    // Still the small pill as well: its own size is unchanged.
    expect(marker.className).toContain('h-[1.4em]');
  });

  it('puts the marker’s advice beside the edits', () => {
    renderModal({ markerAsked: ['Name the effect on latency.', '  '] });

    const margin = screen.getByRole('complementary', { name: 'What changed and why' });
    expect(within(margin).getByText('What the marker asked for')).toBeTruthy();
    expect(margin.textContent).toContain('Name the effect on');
  });

  it('leaves the advice out when there is none', () => {
    renderModal();
    expect(screen.queryByText('What the marker asked for')).toBeNull();
  });

  it('offers a clean copy with nothing marked', () => {
    renderModal();

    fireEvent.click(screen.getByText('Clean copy'));
    expect(screen.queryAllByTitle('Added by the marker')).toHaveLength(0);
    expect(screen.getByText(/Caching stores frequently requested data/)).toBeTruthy();
  });

  /**
   * The side-by-side column holds only equal and inserted runs, so an index
   * into the full diff lands on different words there. The stepper used to
   * ring text several runs away from the edit it named.
   */
  it('rings the named edit in the side-by-side column', () => {
    renderModal({
      originalAnswer: THREE_EDITS_ORIGINAL,
      improvedAnswer: THREE_EDITS_REVISED,
    });

    fireEvent.click(screen.getByText('Side by side'));
    fireEvent.click(screen.getByLabelText('Next change'));
    const ringed = Array.from(document.body.querySelectorAll('mark')).filter((m) =>
      m.className.includes('ring-2')
    );
    expect(ringed.map((m) => m.textContent?.trim())).toEqual(['beta']);
  });

  it('is announced as a dialog', () => {
    renderModal();

    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy();
  });

  it('falls back to the plain revision when there is no original to compare', () => {
    renderModal({ originalAnswer: null });

    expect(screen.queryByText('Side by side')).toBeNull();
    expect(screen.queryAllByTitle('Cut by the marker')).toHaveLength(0);
    expect(screen.getByText(/Caching stores frequently requested data/)).toBeTruthy();
  });

  /**
   * White text on a band's solid fill failed AA on most of the bands (2.15:1 on
   * yellow, under 4:1 on purple), so the ink comes from `band-solid`, which sets
   * the band as the fill and its own near-black ink, with the band itself
   * handed down on the frame as `--band-rgb`.
   */
  it('paints the primary action and the active edit marker in the band, not in white', () => {
    renderModal({
      originalAnswer: THREE_EDITS_ORIGINAL,
      improvedAnswer: THREE_EDITS_REVISED,
    });

    const apply = screen.getByText('Use this version').closest('button')!;
    expect(apply.className).toContain('band-solid');
    expect(apply.className).not.toMatch(/text-white/);

    const activeMarker = screen.getByLabelText('Edit 1');
    expect(activeMarker.className).toContain('band-solid');
    expect(activeMarker.className).not.toMatch(/text-white/);
    expect(screen.getByLabelText('Edit 2').className).not.toContain('band-solid');
  });

  it('hands the band down to the frame as one custom property', () => {
    renderModal({ targetBand: 4 });

    const dialog = screen.getByRole('dialog');
    // Band 4 is the green-500 step, the same triplet `getBandRgb` gives.
    expect(dialog.style.getPropertyValue('--band-rgb')).toBe('34 197 94');
  });

  it('marks the cursor edit in the band’s edge, and only that edit', () => {
    renderModal({
      originalAnswer: THREE_EDITS_ORIGINAL,
      improvedAnswer: THREE_EDITS_REVISED,
    });

    const margin = screen.getByRole('complementary', { name: 'What changed and why' });
    const [first, second] = within(margin).getAllByRole('button');
    expect(first.className).toContain('band-edge-strong');
    expect(second.className).not.toContain('band-edge-strong');
  });

  it('draws the page’s own colours from tokens: the cut text is not dimmed by an alpha', () => {
    renderModal({ improvedAnswer: 'Caching stores data.' });

    const cut = screen.getAllByTitle('Cut by the marker')[0];
    expect(cut.className).toContain('text-rose-800');
    expect(cut.className).not.toMatch(/text-rose-800\/\d/);
  });

  it('keeps the stepper and the close button at a 44px touch target on a phone', () => {
    renderModal({
      originalAnswer: THREE_EDITS_ORIGINAL,
      improvedAnswer: THREE_EDITS_REVISED,
    });

    for (const name of ['Previous change', 'Next change']) {
      expect(screen.getByLabelText(name).className).toMatch(/min-h-11/);
      expect(screen.getByLabelText(name).className).toMatch(/min-w-11/);
    }
    expect(screen.getByLabelText('Close').className).toContain('w-11 h-11 sm:w-9 sm:h-9');
  });

  it('gives aria-label only to elements that can carry one', () => {
    renderModal();

    expect(document.body.querySelectorAll('span[aria-label]')).toHaveLength(0);
  });

  it('says what changed and why above the edits, when the rewrite says', () => {
    renderModal({
      keyChanges: ['Named the consequence', 'Added a judgement'],
      originalAnswer: THREE_EDITS_ORIGINAL,
      improvedAnswer: THREE_EDITS_REVISED,
    });

    const margin = screen.getByRole('complementary', { name: 'What changed and why' });
    const reasons = within(margin).getByRole('heading', { name: 'What changed and why' });
    const edits = within(margin).getByRole('heading', { name: 'The edits' });
    expect(within(margin).getByText('Named the consequence')).toBeTruthy();
    expect(within(margin).getByText('Added a judgement')).toBeTruthy();
    expect(reasons.compareDocumentPosition(edits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves the reasons out when the rewrite gives none', () => {
    renderModal();

    expect(screen.queryByRole('heading', { name: 'What changed and why' })).toBeNull();
  });

  it('does not point at a regenerate control this modal does not have', () => {
    renderModal({ improvedAnswer: ORIGINAL });

    expect(screen.queryByText(/regenerate/i)).toBeNull();
    expect(screen.getByText(/Add more of your own reasoning/)).toBeTruthy();
  });

  it('offers Back to feedback beside Use this version when opened from the summary', () => {
    const { onClose, onApply } = renderModal();

    fireEvent.click(screen.getByText('Back to feedback'));

    expect(onClose).toHaveBeenCalledTimes(1);
    // Going back must not quietly overwrite what the student wrote.
    expect(onApply).not.toHaveBeenCalled();
  });

  it('applies the version and closes the review, so control goes back to the workspace', () => {
    const { onApply, onClose } = renderModal();

    fireEvent.click(screen.getByText('Use this version'));

    expect(onApply).toHaveBeenCalledWith(IMPROVED);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('makes Back to feedback the way forward when there is nothing to apply', () => {
    renderModal({ improvedAnswer: ORIGINAL });

    const back = screen.getByText('Back to feedback').closest('button')!;
    expect(back.className).toContain('band-solid');
  });

  describe('copying the rewrite', () => {
    const stubClipboard = (writeText: ReturnType<typeof vi.fn>) =>
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

    afterEach(() => {
      delete (navigator as { clipboard?: unknown }).clipboard;
    });

    it('says Copied once the clipboard accepts the text', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      stubClipboard(writeText);
      renderModal();

      fireEvent.click(screen.getByText('Copy'));

      expect(await screen.findByText('Copied')).toBeTruthy();
      expect(writeText).toHaveBeenCalledWith(IMPROVED);
    });

    /**
     * A refused clipboard (no permission, an insecure page) used to be an
     * unhandled rejection, and the button went on saying nothing had happened
     * while claiming it had not. Now nothing is claimed.
     */
    it('does not say Copied when the browser refuses the clipboard', async () => {
      const writeText = vi.fn().mockRejectedValue(new DOMException('Denied', 'NotAllowedError'));
      stubClipboard(writeText);
      renderModal();

      fireEvent.click(screen.getByText('Copy'));
      await waitFor(() => expect(writeText).toHaveBeenCalledWith(IMPROVED));
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByText('Copied')).toBeNull();
      expect(screen.getByText('Copy')).toBeTruthy();
    });
  });
});
