import { describe, it, expect, vi, afterEach } from 'vitest';
import React, { useState } from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { selectPromptIfStillThere } from '../../utils/stateUtils';
import type { StatePath } from '../../types';
import AppModals from '../../components/AppModals';

/**
 * A question generated while the reader waits must land on the reader's CURRENT
 * place, and only if it is still the place they asked from. Spreading the path
 * captured before the await used to drag them back to the old one.
 */

const origin: StatePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 'st1',
  dotPointId: 'dp1',
  selectedSubItems: ['focus a'],
};

describe('selectPromptIfStillThere', () => {
  it('sets promptId on the current path when the place is the same, keeping its other fields', () => {
    const current: StatePath = { ...origin, selectedSubItems: ['focus b'], promptId: 'p-old' };

    expect(selectPromptIfStillThere(current, origin, 'p-new')).toEqual({
      ...origin,
      selectedSubItems: ['focus b'],
      promptId: 'p-new',
    });
  });

  it('returns the current path itself, unchanged, when the course has moved', () => {
    const current: StatePath = { ...origin, courseId: 'c2' };
    expect(selectPromptIfStillThere(current, origin, 'p-new')).toBe(current);
  });

  it('returns the current path itself when the topic has moved', () => {
    const current: StatePath = { ...origin, topicId: 't2', subTopicId: undefined };
    expect(selectPromptIfStillThere(current, origin, 'p-new')).toBe(current);
  });

  it('returns the current path itself when the sub-topic has moved', () => {
    const current: StatePath = { ...origin, subTopicId: 'st2' };
    expect(selectPromptIfStillThere(current, origin, 'p-new')).toBe(current);
  });

  it('returns the current path itself when the dot point has moved', () => {
    const current: StatePath = { ...origin, dotPointId: 'dp2' };
    expect(selectPromptIfStillThere(current, origin, 'p-new')).toBe(current);
  });

  it('returns the current path itself when the reader has backed out to the topic', () => {
    const current: StatePath = { courseId: 'c1', topicId: 't1' };
    expect(selectPromptIfStillThere(current, origin, 'p-new')).toBe(current);
  });
});

/**
 * Renders the real AppModals with only the prompt generator mounted. The
 * generator is stubbed to a button, and the handler is a promise the test
 * resolves by hand, so the reader can move while it is pending.
 */
vi.mock('../../components/PromptGeneratorModal', () => ({
  default: ({ onPromptGenerated }: { onPromptGenerated: (prompt: unknown) => void }) => (
    <button type="button" onClick={() => onPromptGenerated({ question: 'Explain it.' })}>
      Generate stub
    </button>
  ),
}));

vi.mock('../../components/ManualPromptModal', () => ({
  default: ({ onSave }: { onSave: (prompt: unknown) => void }) => (
    <button type="button" onClick={() => onSave({ question: 'Refined.' })}>
      Save stub
    </button>
  ),
}));

vi.mock('../../services/geminiService', () => ({}));

type Props = ComponentProps<typeof AppModals>;

let latest: { statePath: StatePath; setStatePath: Props['setStatePath'] } | null = null;
let resolveGenerate: ((p: { id: string }) => void) | null = null;
const handleGeneratePrompt = vi.fn(
  () =>
    new Promise<{ id: string }>((resolve) => {
      resolveGenerate = resolve;
    })
);
const setNewlyAddedIds = vi.fn();
const showToast = vi.fn();

const Harness: React.FC<{ initial: StatePath }> = ({ initial }) => {
  const [statePath, setStatePath] = useState<StatePath>(initial);
  latest = { statePath, setStatePath };
  return (
    <AppModals
      {...({
        activeModals: new Set(['promptGenerator', 'manualPrompt']),
        modalProps: {},
        modalHandlers: { closeModal: vi.fn() },
        syllabusHandlers: { handleGeneratePrompt },
        geminiHandlers: {},
        currentSelection: {},
        statePath,
        courses: [],
        setStatePath,
        showToast,
        setNewlyAddedIds,
        user: null,
        onUpdateUser: vi.fn(),
        onLogout: vi.fn(),
      } as unknown as Props)}
    />
  );
};

const startGeneration = async (button: string) => {
  fireEvent.click(await screen.findByText(button));
  expect(handleGeneratePrompt).toHaveBeenCalledWith(origin, expect.anything());
};

const finishGeneration = async () => {
  await act(async () => {
    resolveGenerate?.({ id: 'p-new' });
  });
};

describe('AppModals prompt generation while the reader moves', () => {
  afterEach(() => {
    cleanup();
    latest = null;
    resolveGenerate = null;
    vi.clearAllMocks();
  });

  it.each(['Generate stub', 'Save stub'])(
    '%s leaves the path alone when the reader has moved to another dot point',
    async (button) => {
      render(<Harness initial={origin} />);
      await startGeneration(button);

      const moved: StatePath = { ...origin, dotPointId: 'dp2', selectedSubItems: ['focus c'] };
      act(() => latest!.setStatePath(moved));
      await finishGeneration();

      expect(latest!.statePath).toEqual(moved);
      expect(latest!.statePath.promptId).toBeUndefined();
      expect(setNewlyAddedIds).toHaveBeenCalled();
    }
  );

  it.each(['Generate stub', 'Save stub'])(
    '%s selects the new prompt on the current path when the reader is still in place',
    async (button) => {
      render(<Harness initial={origin} />);
      await startGeneration(button);

      const changedFocus: StatePath = { ...origin, selectedSubItems: ['focus b'] };
      act(() => latest!.setStatePath(changedFocus));
      await finishGeneration();

      expect(latest!.statePath).toEqual({ ...changedFocus, promptId: 'p-new' });
      expect(setNewlyAddedIds).toHaveBeenCalled();
    }
  );
});
