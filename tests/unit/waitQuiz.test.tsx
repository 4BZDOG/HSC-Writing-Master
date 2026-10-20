import { describe, it, expect, afterEach, vi } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import WaitQuiz from '../../components/WaitQuiz';
import {
  QUIZ_NUMBERS,
  QUIZ_VERBS,
  buildNumberQuestion,
  buildQuestion,
  quizDeck,
} from '../../utils/waitQuiz';
import type { QuizNumber, QuizQuestion, QuizVerb } from '../../utils/waitQuiz';
import { verbTipFor } from '../../utils/waitTips';
import { HSC_RESULTS_FACTS } from '../../data/hscResultsFacts';

/**
 * The wait quiz: the NESA command-verb questions the reader answers while the
 * AI works. The data is checked first (every wrong answer is a real verb with
 * a tip, and no pair of near-synonyms is ever offered against each other), then
 * the deck's order, then the card as a reader meets it.
 */

const ACCENT = 'rgb(var(--color-accent))';
const STREAK_KEY = 'band6:wait-quiz-streak';
const QUIZ_VERB_NAMES = QUIZ_VERBS.map((q) => q.verb);

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
  vi.restoreAllMocks();
});

const entryFor = (verb: string): QuizVerb => {
  const entry = QUIZ_VERBS.find((q) => q.verb === verb);
  if (!entry) throw new Error(`${verb} is not a quiz verb`);
  return entry;
};

/** The verbs a question about `verb` can offer: its own, and the two it is confused with. */
const offeredWith = (verb: string): string[] => {
  const entry = entryFor(verb);
  return [entry.verb, ...entry.confusedWith];
};

/** The numbers entry a numbers question was built from. Its prompt is unique. */
const numberEntryFor = (q: QuizQuestion): QuizNumber => {
  const entry = QUIZ_NUMBERS.find((e) => e.prompt === q.prompt);
  if (!entry) throw new Error(`no numbers entry for “${q.prompt}”`);
  return entry;
};

/** The text of the right answer for a question, in the shape it is asked. */
const correctText = (q: QuizQuestion): string => {
  if (q.shape === 'number') return numberEntryFor(q).choices[0];
  if (q.shape === 'meaning') return q.verb;
  const meaning = entryFor(q.verb).meaning;
  return `${meaning.charAt(0).toUpperCase()}${meaning.slice(1)}.`;
};

describe('the quiz data', () => {
  it('offers only verbs that are on the card, and two different wrong answers', () => {
    for (const entry of QUIZ_VERBS) {
      const [a, b] = entry.confusedWith;
      expect(QUIZ_VERB_NAMES).toContain(a);
      expect(QUIZ_VERB_NAMES).toContain(b);
      expect(a).not.toBe(entry.verb);
      expect(b).not.toBe(entry.verb);
      expect(a).not.toBe(b);
    }
  });

  it('gives every quiz verb its own wait tip', () => {
    for (const entry of QUIZ_VERBS) {
      expect(verbTipFor(entry.verb), `tip for ${entry.verb}`).toBeTruthy();
    }
  });

  it('never offers a verb against its glossary near-synonym, in either direction', () => {
    // Assess and Evaluate, and Outline and Summarise, have near-identical glossary
    // meanings; a quiz that marks a fair answer wrong would teach the wrong thing.
    const nearSynonyms: [string, string][] = [
      ['Assess', 'Evaluate'],
      ['Outline', 'Summarise'],
    ];
    for (const [a, b] of nearSynonyms) {
      expect(QUIZ_VERB_NAMES).toContain(a);
      expect(QUIZ_VERB_NAMES).toContain(b);
      expect(offeredWith(a)).not.toContain(b);
      expect(offeredWith(b)).not.toContain(a);
    }
  });

  it('builds every verb in both shapes with one right answer at answerIndex', () => {
    for (const entry of QUIZ_VERBS) {
      for (const shape of ['meaning', 'verb'] as const) {
        const q = buildQuestion(entry, shape);
        expect(q.verb).toBe(entry.verb);
        expect(q.shape).toBe(shape);
        expect(q.choices).toHaveLength(3);
        expect(new Set(q.choices).size).toBe(3);
        expect(q.answerIndex).toBeGreaterThanOrEqual(0);
        expect(q.answerIndex).toBeLessThan(3);
        expect(q.choices.filter((c) => c === correctText(q))).toHaveLength(1);
        expect(q.choices[q.answerIndex]).toBe(correctText(q));
        expect(q.reason).toBe(verbTipFor(entry.verb));
      }
    }
  });

  it('puts the verb being marked first, as a verb question', () => {
    const [first] = quizDeck('evaluate');
    expect(first.verb).toBe('Evaluate');
    expect(first.shape).toBe('verb');
  });

  it('reads the marked verb with case and spacing ignored', () => {
    const a = quizDeck('evaluate')[0];
    const b = quizDeck('EVALUATE ')[0];
    expect(b.verb).toBe(a.verb);
    expect(b.shape).toBe(a.shape);
    expect(b.prompt).toBe(a.prompt);
  });

  it('asks every verb once and every published figure once, whatever the verb being marked', () => {
    for (const verb of ['evaluate', 'EVALUATE ', 'frobnicate', undefined]) {
      const deck = quizDeck(verb);
      const verbQuestions = deck.filter((q) => q.shape !== 'number');
      const numberQuestions = deck.filter((q) => q.shape === 'number');

      expect(verbQuestions).toHaveLength(QUIZ_VERBS.length);
      expect(new Set(verbQuestions.map((q) => q.verb))).toEqual(new Set(QUIZ_VERB_NAMES));
      expect(numberQuestions).toHaveLength(QUIZ_NUMBERS.length);
      expect(new Set(numberQuestions.map((q) => q.prompt)).size).toBe(QUIZ_NUMBERS.length);
      expect(deck).toHaveLength(QUIZ_VERBS.length + QUIZ_NUMBERS.length);
    }
  });

  it('alternates the verb shapes from a meaning question when the verb is unknown', () => {
    // The numbers questions sit between the verb questions, so the alternation is
    // checked across the verb questions alone.
    const verbQuestions = quizDeck('frobnicate').filter((q) => q.shape !== 'number');
    verbQuestions.forEach((q, i) => expect(q.shape).toBe(i % 2 === 0 ? 'meaning' : 'verb'));
  });

  it('answers every numbers question from a published fact, with its reason and year', () => {
    for (const entry of QUIZ_NUMBERS) {
      const fact = HSC_RESULTS_FACTS.find((f) => f.id === entry.factId);
      expect(fact, `fact ${entry.factId}`).toBeDefined();

      const q = buildNumberQuestion(entry);
      expect(q).toBeDefined();
      const reason = entry.reasonFrom === 'caveat' ? fact?.caveat : fact?.text;
      expect(q?.reason).toBe(reason);
      expect(q?.year).toBe(fact?.year);
      expect(q?.choices).toHaveLength(3);
      expect(new Set(q?.choices).size).toBe(3);
      expect(q?.choices[q?.answerIndex ?? -1]).toBe(entry.choices[0]);
    }
  });

  it('gives each numbers question in the deck the reason and year of its fact', () => {
    for (const q of quizDeck('evaluate').filter((q) => q.shape === 'number')) {
      const entry = numberEntryFor(q);
      const fact = HSC_RESULTS_FACTS.find((f) => f.id === entry.factId);
      expect(q.reason).toBe(entry.reasonFrom === 'caveat' ? fact?.caveat : fact?.text);
      expect(q.year).toBe(fact?.year);
    }
  });

  it('gives each question three choices with exactly one right answer', () => {
    for (let run = 0; run < 20; run++) {
      for (const q of quizDeck(run % 2 ? 'analyse' : undefined)) {
        expect(q.choices).toHaveLength(3);
        expect(q.choices.filter((c) => c === correctText(q))).toHaveLength(1);
        expect(q.choices[q.answerIndex]).toBe(correctText(q));
        if (q.shape === 'meaning') expect(q.choices[q.answerIndex]).toBe(q.verb);
      }
    }
  });
});

/** Pins Math.random, so the deck and its choice order are the same for the test and the component. */
const pinnedDeck = (verb: string): QuizQuestion[] => {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  return quizDeck(verb);
};

const renderQuiz = (verb = 'evaluate'): QuizQuestion[] => {
  const deck = pinnedDeck(verb);
  render(<WaitQuiz verb={verb} accent={ACCENT} />);
  return deck;
};

const choices = (): HTMLElement[] =>
  within(screen.getByRole('group')).getAllByRole('button') as HTMLElement[];

const nextButton = (): HTMLElement => screen.getByRole('button', { name: 'Next question' });

const correctOf = (q: QuizQuestion): string => q.choices[q.answerIndex];

/**
 * Answers each question before the first one that matches, correctly, and leaves
 * the card on that one. Returns its index in the deck.
 */
const reach = (deck: QuizQuestion[], matches: (q: QuizQuestion) => boolean): number => {
  const at = deck.findIndex(matches);
  expect(at, 'a question matching the search').toBeGreaterThanOrEqual(0);
  for (let i = 0; i < at; i++) {
    fireEvent.click(choices()[deck[i].answerIndex]);
    fireEvent.click(nextButton());
  }
  return at;
};

describe('WaitQuiz', () => {
  it('shows the heading, the first prompt and three choices', () => {
    const deck = renderQuiz();
    expect(screen.getByRole('heading', { name: 'Quick check' })).toBeTruthy();
    expect(screen.getByText(deck[0].prompt)).toBeTruthy();
    expect(choices()).toHaveLength(3);
    expect(screen.getByRole('region', { name: 'Quick check' }).className).toContain('cursor-auto');
  });

  it('mixes the accent rule from the accent rather than appending an alpha to it', () => {
    renderQuiz();
    const root = screen.getByRole('region', { name: 'Quick check' });
    expect(root.style.boxShadow).toContain('color-mix(in srgb, rgb(var(--color-accent)) 55%');
  });

  it('lays out sentence choices in a column and verb choices in three columns', () => {
    const deck = renderQuiz();
    expect(screen.getByRole('group').className).toContain('flex-col');
    fireEvent.click(choices()[deck[0].answerIndex]);
    fireEvent.click(nextButton());
    expect(screen.getByRole('group').className).toContain('grid-cols-3');
  });

  it('shows Right, the reason and a Next button for the right answer, then the next prompt', () => {
    const deck = renderQuiz();
    fireEvent.click(choices()[deck[0].answerIndex]);
    expect(screen.getByText('Right.')).toBeTruthy();
    expect(screen.getByText(deck[0].reason)).toBeTruthy();

    fireEvent.click(nextButton());
    expect(screen.getByText(deck[1].prompt)).toBeTruthy();
    expect(screen.queryByText(deck[0].prompt)).toBeNull();
    expect(screen.queryByText('Right.')).toBeNull();
  });

  it('says Not quite for a wrong answer to a sentence question', () => {
    const deck = renderQuiz();
    fireEvent.click(choices()[(deck[0].answerIndex + 1) % 3]);
    expect(screen.getByText(/^Not quite\.$/)).toBeTruthy();
    expect(screen.getByText(deck[0].reason)).toBeTruthy();
  });

  it('names the right verb for a wrong answer to a meaning question', () => {
    const deck = renderQuiz();
    fireEvent.click(choices()[deck[0].answerIndex]);
    fireEvent.click(nextButton());

    expect(deck[1].shape).toBe('meaning');
    fireEvent.click(choices()[(deck[1].answerIndex + 1) % 3]);
    expect(screen.getByText(`Not quite. It’s “${deck[1].verb}”.`)).toBeTruthy();
  });

  it('ignores clicks on the other choices once one is picked', () => {
    const deck = renderQuiz();
    fireEvent.click(choices()[deck[0].answerIndex]);

    // Only the right choice is left on the card, so there is nothing else to click.
    expect(choices()).toHaveLength(1);
    fireEvent.click(choices()[0]);

    expect(screen.getByText('Right.')).toBeTruthy();
    expect(screen.queryByText(/^Not quite/)).toBeNull();
    for (const choice of choices()) expect(choice.getAttribute('aria-disabled')).toBe('true');
  });

  it('takes the choice that was neither picked nor right off the card once answered', () => {
    const deck = renderQuiz();
    const wrong = (deck[0].answerIndex + 1) % 3;
    const other = (deck[0].answerIndex + 2) % 3;
    fireEvent.click(choices()[wrong]);

    const left = choices().map((b) => b.textContent);
    expect(left).toHaveLength(2);
    expect(left).toContain(deck[0].choices[wrong]);
    expect(left).toContain(deck[0].choices[deck[0].answerIndex]);
    expect(left).not.toContain(deck[0].choices[other]);
  });

  it('lays a question out in columns when every choice is short', () => {
    const deck = renderQuiz('evaluate');
    reach(deck, (q) => q.choices.every((c) => c.length <= 16));
    expect(screen.getByRole('group').className).toContain('grid-cols-3');
  });

  it('lays a numbers question out as a list when one of its choices is long', () => {
    const deck = renderQuiz('evaluate');
    reach(deck, (q) => q.shape === 'number' && q.choices.some((c) => c.length > 16));
    expect(screen.getByRole('group').className).toContain('flex-col');
  });

  it('labels a numbers question with its year once it is answered, and not before', () => {
    const deck = pinnedDeck('evaluate');
    render(<WaitQuiz verb="evaluate" accent={ACCENT} />);

    const at = reach(deck, (q) => q.shape === 'number');
    expect(screen.queryByText('HSC in numbers, 2025')).toBeNull();

    fireEvent.click(choices()[deck[at].answerIndex]);
    expect(screen.getByText('HSC in numbers, 2025')).toBeTruthy();
    expect(screen.getByText(deck[at].reason)).toBeTruthy();
  });

  it('quotes a short right answer in the wrong-answer line', () => {
    const deck = pinnedDeck('evaluate');
    render(<WaitQuiz verb="evaluate" accent={ACCENT} />);

    const at = reach(deck, (q) => q.shape === 'number' && correctOf(q).length <= 24);
    fireEvent.click(choices()[(deck[at].answerIndex + 1) % 3]);
    expect(screen.getByText(`Not quite. It’s “${correctOf(deck[at])}”.`)).toBeTruthy();
  });

  it('says only Not quite when the right answer is too long to quote', () => {
    const deck = pinnedDeck('evaluate');
    render(<WaitQuiz verb="evaluate" accent={ACCENT} />);

    const at = reach(deck, (q) => q.shape === 'number' && correctOf(q).length > 24);
    fireEvent.click(choices()[(deck[at].answerIndex + 1) % 3]);
    expect(screen.getByText(/^Not quite\.$/)).toBeTruthy();
  });

  it('keeps the choices focusable after an answer (aria-disabled, not disabled)', () => {
    const deck = renderQuiz();
    fireEvent.click(choices()[deck[0].answerIndex]);
    for (const choice of choices()) expect((choice as HTMLButtonElement).disabled).toBe(false);
  });

  it('has no role=status, so the card keeps its one status region', () => {
    const { container } = render(<WaitQuiz verb="evaluate" accent={ACCENT} />);
    expect(container.querySelector('[role="status"]')).toBeNull();
    expect(container.querySelector('[aria-live="polite"]')).not.toBeNull();
  });

  it('shows the streak once there are two right answers in a row', () => {
    const deck = renderQuiz();
    fireEvent.click(choices()[deck[0].answerIndex]);
    expect(screen.queryByText(/right in a row/)).toBeNull();

    fireEvent.click(nextButton());
    fireEvent.click(choices()[deck[1].answerIndex]);
    expect(screen.getByText('2 right in a row')).toBeTruthy();
    expect(window.sessionStorage.getItem(STREAK_KEY)).toBe('2');
  });

  it('carries the streak into the next wait, and resets it on a wrong answer', () => {
    window.sessionStorage.setItem(STREAK_KEY, '3');
    const deck = renderQuiz();
    expect(screen.getByText('3 right in a row')).toBeTruthy();

    fireEvent.click(choices()[(deck[0].answerIndex + 1) % 3]);
    expect(screen.queryByText(/right in a row/)).toBeNull();
    expect(window.sessionStorage.getItem(STREAK_KEY)).toBe('0');
  });

  it('moves focus to Next when the reader answered from inside the card', () => {
    const deck = renderQuiz();
    const correct = choices()[deck[0].answerIndex];
    correct.focus();
    fireEvent.click(correct);
    expect(document.activeElement).toBe(nextButton());
  });

  it('leaves focus where it is when the answer was not picked from inside the card', () => {
    const deck = renderQuiz();
    fireEvent.click(choices()[deck[0].answerIndex]);
    expect(document.activeElement).not.toBe(nextButton());
  });

  it('moves focus to the new question’s first choice when Next is pressed from inside the card', () => {
    renderQuiz();
    const first = choices()[0];
    first.focus();
    fireEvent.click(first);

    nextButton().focus();
    fireEvent.click(nextButton());

    // The new question is a fresh group, so the focus must land inside it, on its
    // first choice, rather than fall to the page when Next unmounts.
    expect(screen.getByRole('group').contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(choices()[0]);
  });

  it('moves focus to Next and then to the next first choice without scrolling', () => {
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    renderQuiz();
    const first = choices()[0];
    first.focus();
    fireEvent.click(first);
    // A focus call scrolls its element into view unless told not to, and the card is
    // a scroll box, so both focus moves must pass preventScroll.
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(nextButton());

    nextButton().focus();
    fireEvent.click(nextButton());
    expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    expect(document.activeElement).toBe(choices()[0]);
  });

  describe('keeping the answer in view', () => {
    const rect = (top: number, bottom: number): DOMRect =>
      ({
        top,
        bottom,
        left: 0,
        right: 0,
        width: 0,
        height: bottom - top,
        x: 0,
        y: top,
        toJSON: () => ({}),
      }) as DOMRect;

    /**
     * Renders the quiz in a scroll box that is 200px tall and holds 400px, and places
     * the answer block (the feedback and Next) at `[answerTop, answerBottom]`. Returns
     * the elements that were asked to scroll into view.
     */
    const answerInBox = (answerTop: number, answerBottom: number): HTMLElement[] => {
      render(
        <div data-testid="box" style={{ overflowY: 'auto' }}>
          <WaitQuiz verb="evaluate" accent={ACCENT} />
        </div>
      );
      const box = screen.getByTestId('box');
      Object.defineProperty(box, 'scrollHeight', { configurable: true, value: 400 });
      Object.defineProperty(box, 'clientHeight', { configurable: true, value: 200 });
      const scrolled: HTMLElement[] = [];
      HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
        scrolled.push(this);
      };
      vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
        this: HTMLElement
      ) {
        if (this === box) return rect(0, 200);
        if (this.querySelector('[aria-live]')) return rect(answerTop, answerBottom);
        return rect(0, 0);
      });
      return scrolled;
    };

    afterEach(() => {
      Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
    });

    it('scrolls the answer block into view when its scroll box cuts it off', () => {
      const scrolled = answerInBox(150, 260);
      choices()[0].focus();
      fireEvent.click(choices()[0]);
      const answer = nextButton().parentElement as HTMLElement;
      expect(scrolled).toEqual([answer]);
    });

    it('scrolls the answer block and never the Next button alone', () => {
      const scrolled = answerInBox(150, 260);
      choices()[0].focus();
      fireEvent.click(choices()[0]);
      expect(scrolled).not.toContain(nextButton());
    });

    it('leaves the scroll where it is when the answer block already fits', () => {
      const scrolled = answerInBox(40, 150);
      choices()[0].focus();
      fireEvent.click(choices()[0]);
      expect(scrolled).toHaveLength(0);
    });
  });
});

describe('WaitQuiz when sessionStorage throws', () => {
  it('still renders, answers, and counts the streak in memory', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage denied');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage denied');
    });

    const deck = renderQuiz();
    expect(screen.getByText(deck[0].prompt)).toBeTruthy();

    fireEvent.click(choices()[deck[0].answerIndex]);
    expect(screen.getByText('Right.')).toBeTruthy();

    fireEvent.click(nextButton());
    fireEvent.click(choices()[deck[1].answerIndex]);
    expect(screen.getByText('Right.')).toBeTruthy();
    expect(screen.getByText('2 right in a row')).toBeTruthy();
  });
});
