import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import Workspace from '../../components/Workspace';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';

/**
 * A draft must survive the ways a session actually ends.
 *
 * It used to be written only when the writing surface lost focus, or on
 * Evaluate. A student who typed for twenty minutes and closed the tab, whose
 * browser crashed, or who was signed out by the school's idle timeout, lost
 * the lot — and the writing surface is where this app asks for a page of prose.
 * It now saves when typing stops, and again on the way out.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));
// Partial: only the gates this test needs are forced open, and the rest of the
// module keeps working. An exhaustive mock has to be updated every time
// entitlements grows an export, which is a test that breaks for no reason.
vi.mock('../../services/entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/entitlements')>()),
  isFeatureLocked: () => false,
  isQuestionTierLocked: () => false,
  isSampleAnswerLocked: () => false,
  isFeedbackLocked: () => false,
  freeEvalsRemaining: () => Infinity,
  requestUpgrade: vi.fn(),
}));
vi.mock('../../services/curriculumService', () => ({ isCurriculumRemote: () => false }));

afterEach(cleanup);

// jsdom has no layout, so the breadcrumb's scroll-into-view and the cards'
// ResizeObservers need stand-ins.
if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};

const prompt = (over: Partial<Prompt> = {}): Prompt =>
  ({
    id: 'p1',
    question: 'Describe the key steps involved in DNA replication.',
    verb: 'DESCRIBE' as PromptVerb,
    totalMarks: 4,
    keywords: [],
    sampleAnswers: [],
    ...over,
  }) as unknown as Prompt;

const statePath: StatePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
  promptId: 'p1',
} as unknown as StatePath;

/**
 * Renders the workspace the way the app does: the stored draft is loaded into
 * the writing surface first, and the student types from there. That order
 * matters — the autosave only claims an answer once what is on screen is
 * demonstrably the selected question's own text.
 */
const setup = (opts: { answer: string; current?: Prompt; debounced?: string }) => {
  const saved: string[] = [];
  const updateCourses = vi.fn((recipe: (draft: unknown) => void) => {
    // The real handler runs an immer recipe over the course tree; the draft is
    // whatever `findAndUpdateItem` reaches, so a minimal tree is enough.
    const tree = [
      {
        id: 'c1',
        topics: [
          {
            id: 't1',
            subTopics: [
              { id: 's1', dotPoints: [{ id: 'd1', prompts: [opts.current ?? prompt()] }] },
            ],
          },
        ],
      },
    ] as unknown as Course[];
    recipe(tree);
    const p = (tree as never as typeof tree)[0].topics[0].subTopics[0].dotPoints[0].prompts[0];
    saved.push((p as Prompt).userDraft ?? '');
  });

  const current = opts.current ?? prompt();
  // Stable across rerenders, exactly like the useState setter App passes down:
  // a fresh function each render would re-run the draft-loading effect and
  // wipe what the student had typed.
  const setUserAnswer = vi.fn();
  const props = (answer: string) => ({
    courses: [] as Course[],
    statePath,
    currentSelection: { currentPrompt: current },
    userAnswer: answer,
    debouncedUserAnswer: answer,
  });

  const view = render(
    <Workspace
      {...props(current.userDraft ?? '')}
      courses={[]}
      statePath={statePath}
      currentSelection={{ currentPrompt: current }}
      userAnswer={current.userDraft ?? ''}
      debouncedUserAnswer={current.userDraft ?? ''}
      setUserAnswer={setUserAnswer}
      evaluationResult={null}
      isEvaluating={false}
      evaluationError={null}
      isEnriching={false}
      enrichError={null}
      isImproving={false}
      improveAnswerError={null}
      evaluatedAnswer=""
      handleEvaluate={vi.fn()}
      geminiHandlers={{}}
      modalHandlers={{}}
      syllabusHandlers={{ updateCourses } as never}
      userRole="user"
      isFocusMode={false}
      onToggleFocusMode={vi.fn()}
      writingMode="coach"
      onWritingModeChange={vi.fn()}
      showBreadcrumb={false}
    />
  );

  // …and now the student types.
  const type = (answer: string) =>
    view.rerender(
      <Workspace
        {...props(answer)}
        evaluationResult={null}
        isEvaluating={false}
        evaluationError={null}
        isEnriching={false}
        enrichError={null}
        isImproving={false}
        improveAnswerError={null}
        evaluatedAnswer=""
        setUserAnswer={setUserAnswer}
        handleEvaluate={vi.fn()}
        geminiHandlers={{}}
        modalHandlers={{}}
        syllabusHandlers={{ updateCourses } as never}
        userRole="user"
        isFocusMode={false}
        onToggleFocusMode={vi.fn()}
        writingMode="coach"
        onWritingModeChange={vi.fn()}
        showBreadcrumb={false}
      />
    );

  if (opts.answer !== (current.userDraft ?? '')) type(opts.answer);

  return { saved, updateCourses, view, type };
};

describe('the draft saves itself', () => {
  it('writes what has been typed once typing settles', () => {
    const { saved } = setup({ answer: 'Helicase unwinds the double helix.' });

    expect(saved).toContain('Helicase unwinds the double helix.');
  });

  it('does not write when nothing has changed', () => {
    const { updateCourses } = setup({
      answer: 'Already saved.',
      current: prompt({ userDraft: 'Already saved.' }),
    });

    expect(updateCourses).not.toHaveBeenCalled();
  });

  // The tab closing is the case the old blur-only save could not cover.
  it('writes again on the way out, with whatever was typed since', () => {
    const { saved, updateCourses } = setup({ answer: 'A sentence in progress' });
    updateCourses.mockClear();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(updateCourses).toHaveBeenCalled();
    expect(saved[saved.length - 1]).toBe('A sentence in progress');
  });

  it('writes when the app is backgrounded — how a phone session ends', () => {
    const { updateCourses } = setup({ answer: 'Half an answer' });
    updateCourses.mockClear();

    act(() => {
      Object.defineProperty(document, 'visibilityState', {
        value: 'hidden',
        configurable: true,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(updateCourses).toHaveBeenCalled();

    Object.defineProperty(document, 'visibilityState', {
      value: 'visible',
      configurable: true,
    });
  });

  it('writes on unmount, so navigating away costs nothing', () => {
    const { updateCourses, view } = setup({ answer: 'Mid-sentence' });
    updateCourses.mockClear();

    view.unmount();

    expect(updateCourses).toHaveBeenCalled();
  });

  /**
   * Switching questions replaces the answer in an effect, so for a moment the
   * new question is selected while the previous question's words are still in
   * state. Whatever happens in that window, those words must never be written
   * onto the new question.
   */
  it('never writes one question’s answer onto another', () => {
    const writes: { promptId: string; draft: string }[] = [];
    const updateCourses = vi.fn((recipe: (draft: unknown) => void) => {
      const tree = [
        {
          id: 'c1',
          topics: [
            {
              id: 't1',
              subTopics: [
                {
                  id: 's1',
                  dotPoints: [{ id: 'd1', prompts: [prompt({ id: 'p1' }), prompt({ id: 'p2' })] }],
                },
              ],
            },
          ],
        },
      ] as unknown as Course[];
      recipe(tree);
      for (const p of (tree as never as typeof tree)[0].topics[0].subTopics[0].dotPoints[0]
        .prompts as unknown as Prompt[]) {
        if (p.userDraft) writes.push({ promptId: p.id, draft: p.userDraft });
      }
    });

    const setUserAnswer = vi.fn();
    const render1 = (promptId: string, answer: string) => (
      <Workspace
        courses={[]}
        statePath={{ ...statePath, promptId } as StatePath}
        currentSelection={{ currentPrompt: prompt({ id: promptId }) }}
        userAnswer={answer}
        debouncedUserAnswer={answer}
        setUserAnswer={setUserAnswer}
        evaluationResult={null}
        isEvaluating={false}
        evaluationError={null}
        isEnriching={false}
        enrichError={null}
        isImproving={false}
        improveAnswerError={null}
        evaluatedAnswer=""
        handleEvaluate={vi.fn()}
        geminiHandlers={{}}
        modalHandlers={{}}
        syllabusHandlers={{ updateCourses } as never}
        userRole="user"
        isFocusMode={false}
        onToggleFocusMode={vi.fn()}
        writingMode="coach"
        onWritingModeChange={vi.fn()}
        showBreadcrumb={false}
      />
    );

    // Load p1, type into it, then switch to p2 before the answer catches up.
    const view = render(render1('p1', ''));
    view.rerender(render1('p1', 'An answer about DNA'));
    view.rerender(render1('p2', 'An answer about DNA'));

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    view.unmount();

    // p1 may be written as often as it likes — that is its own answer.
    expect(writes.some((w) => w.promptId === 'p1')).toBe(true);
    // p2 must never receive it.
    expect(writes.filter((w) => w.promptId === 'p2')).toHaveLength(0);
  });
});
