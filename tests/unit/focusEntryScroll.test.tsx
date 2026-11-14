import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import React from 'react';
import { render, cleanup, waitFor } from '@testing-library/react';
import Workspace from '../../components/Workspace';
import { Prompt, PromptVerb, StatePath } from '../../types';
import { focusEntryNeedsScroll, whenAncestorsSettle } from '../../utils/focusLayout';
import { resetSupportEngagement } from '../../utils/supportEngagement';

/**
 * Entering Focus Mode from a scrolled page.
 *
 * On a wide window the Focus layout (question, splitter, writing card) is taller
 * than the screen, so the writing card's own 'nearest' scroll left the question
 * entirely above the fold. The layout's top edge is what must land on screen.
 * On a phone the question sits above the writing card and the writing card's
 * top is what the student needs, as before.
 */

vi.mock('../../services/geminiService', () => ({
  explainOutcomeInContext: vi.fn(),
  generateRubricForPrompt: vi.fn(),
}));
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

const LAYOUT_CLASS = 'flex flex-col w-full flex-1 min-h-0';

const setViewport = (width: number, height: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  Object.defineProperty(window, 'innerHeight', { value: height, configurable: true });
};

const prompt = (): Prompt =>
  ({
    id: 'p-entry',
    question: 'Outline three benefits of developing secure software.',
    verb: 'OUTLINE' as PromptVerb,
    totalMarks: 3,
    keywords: ['security'],
    sampleAnswers: [],
  }) as unknown as Prompt;

const statePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
  promptId: 'p-entry',
} as unknown as StatePath;

const ui = (isFocusMode: boolean) => (
  <Workspace
    courses={[]}
    statePath={statePath}
    currentSelection={{ currentPrompt: prompt() }}
    userAnswer=""
    debouncedUserAnswer=""
    setUserAnswer={vi.fn()}
    evaluationResult={null}
    isEvaluating={false}
    evaluationError={null}
    isEnriching={false}
    enrichError={null}
    isImproving={false}
    improveAnswerError={null}
    evaluatedAnswer=""
    handleEvaluate={vi.fn()}
    geminiHandlers={{} as never}
    modalHandlers={{} as never}
    syllabusHandlers={{ updateCourses: vi.fn() } as never}
    userRole={'user' as never}
    isFocusMode={isFocusMode}
    onToggleFocusMode={vi.fn()}
    writingMode="coach"
    onWritingModeChange={vi.fn()}
    showBreadcrumb={false}
    crumbs={[]}
  />
);

const originalRaf = window.requestAnimationFrame;
const originalCancel = window.cancelAnimationFrame;
const originalScroll = Element.prototype.scrollIntoView;
const originalRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  resetSupportEngagement();
  // Run the deferred scroll at once so the assertions read the effect's result.
  window.requestAnimationFrame = (cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  };
  window.cancelAnimationFrame = () => {};
  Element.prototype.scrollIntoView = vi.fn();
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = () => {};
});

afterEach(() => {
  cleanup();
  window.requestAnimationFrame = originalRaf;
  window.cancelAnimationFrame = originalCancel;
  Element.prototype.scrollIntoView = originalScroll;
  Element.prototype.getBoundingClientRect = originalRect;
});

/** Every element reports the same top edge, as if the page were scrolled to it. */
const topEdgeAt = (top: number) => {
  Element.prototype.getBoundingClientRect = function () {
    return { top, bottom: top + 2000, left: 0, right: 1000, width: 1000, height: 2000 } as DOMRect;
  };
};

describe('entering Focus Mode on a wide window', () => {
  it('scrolls the Focus layout, not the writing card, so the question card is in view', async () => {
    setViewport(1440, 900);
    topEdgeAt(-1200);
    render(ui(false));

    const spy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    spy.mockClear();
    render(ui(true));

    // The scroll waits for the page's padding transition, so it is awaited here.
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    const target = spy.mock.contexts[0] as HTMLElement;
    expect(target.className).toBe(LAYOUT_CLASS);
    expect(spy).toHaveBeenCalledWith({ block: 'start' });
  });

  it('does not scroll when the layout top is already on screen', async () => {
    setViewport(1440, 900);
    topEdgeAt(120);
    render(ui(true));

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('entering Focus Mode on a phone', () => {
  it('still brings the writing card to the top, as before', () => {
    setViewport(390, 844);
    topEdgeAt(-900);
    render(ui(true));

    const spy = Element.prototype.scrollIntoView as ReturnType<typeof vi.fn>;
    expect(spy).toHaveBeenCalledWith({ block: 'start' });
    const target = spy.mock.contexts[0] as HTMLElement;
    expect(target.className).not.toBe(LAYOUT_CLASS);
  });
});

describe('whenAncestorsSettle', () => {
  it('resolves at once where the browser has no Web Animations API', async () => {
    const original = document.getAnimations;
    (document as { getAnimations?: unknown }).getAnimations = undefined;
    try {
      await expect(whenAncestorsSettle(document.body)).resolves.toBeUndefined();
    } finally {
      document.getAnimations = original;
    }
  });

  it('waits for an animation running on an ancestor, and ignores the rest', async () => {
    let finish!: () => void;
    const ancestorDone = new Promise<void>((resolve) => (finish = resolve));
    const element = document.createElement('div');
    const parent = document.createElement('main');
    parent.appendChild(element);
    document.body.appendChild(parent);
    const unrelated = document.createElement('p');
    document.body.appendChild(unrelated);

    const onParent = { effect: { target: parent }, finished: ancestorDone };
    const onUnrelated = { effect: { target: unrelated }, finished: new Promise(() => {}) };
    const original = document.getAnimations;
    document.getAnimations = () => [onParent, onUnrelated] as unknown as Animation[];
    try {
      let settled = false;
      const pending = whenAncestorsSettle(element).then(() => {
        settled = true;
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(settled).toBe(false);
      finish();
      await pending;
      expect(settled).toBe(true);
    } finally {
      document.getAnimations = original;
      parent.remove();
      unrelated.remove();
    }
  });
});

describe('focusEntryNeedsScroll', () => {
  it('needs a scroll when the top is above or below the screen', () => {
    expect(focusEntryNeedsScroll(-1, 900)).toBe(true);
    expect(focusEntryNeedsScroll(900, 900)).toBe(true);
  });

  it('needs none when the top is on screen', () => {
    expect(focusEntryNeedsScroll(0, 900)).toBe(false);
    expect(focusEntryNeedsScroll(400, 900)).toBe(false);
  });
});
