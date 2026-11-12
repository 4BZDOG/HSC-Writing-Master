import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, act } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { parseSyllabusStructure } from '../../services/geminiService';
import { Course, StatePath } from '../../types';

/**
 * A topic pasted from syllabus text takes a few seconds to parse. The reader
 * may change course while it runs. The topic still belongs to the course they
 * asked from, but the navigator must not be pulled into that course, or the
 * place they have moved to is cleared.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

// The parse is plan-gated. This is about where the topic lands, not the plan.
vi.mock('../../services/entitlements', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/entitlements')>()),
  isFeatureLocked: () => false,
}));

beforeAll(() => {
  // The picker scrolls the highlighted option into view; jsdom has no layout.
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const courses: Course[] = [
  { id: 'c1', name: 'Biology', outcomes: [], topics: [] },
  { id: 'c2', name: 'Chemistry', outcomes: [], topics: [] },
];

const noop = vi.fn();

const selector = (path: StatePath, onAddTopicWithContent: (...args: unknown[]) => void) => (
  <PromptSelector
    courses={courses}
    statePath={path}
    onPathChange={noop}
    onAddCourse={noop}
    onToggleCourseStatus={noop}
    onAddSubTopic={noop}
    onGeneratePrompt={noop}
    onManualEntry={noop}
    onEditOutcomes={noop}
    onOpenDataManager={noop}
    onRenameItem={noop}
    onDeleteItem={noop}
    onAddTopicFromSyllabus={noop}
    onAddTopicWithContent={onAddTopicWithContent as never}
    onGenerateDotPoints={noop}
    onImportTopic={noop}
    onImportSyllabus={noop}
    newlyAddedIds={new Set<string>()}
    userRole="admin"
  />
);

/** Opens the inline topic form, fills it, and starts the AI parse. */
const startParse = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Add topic' }));
  fireEvent.change(screen.getByPlaceholderText(/Topic name/), {
    target: { value: 'Heredity' },
  });
  fireEvent.change(screen.getByPlaceholderText(/paste NESA syllabus text/), {
    target: { value: 'Explain patterns of inheritance.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Create & parse' }));
};

const parsed = [
  { name: 'Heredity', subTopics: [{ name: 'Genes', dotPoints: ['Explain patterns'] }] },
];

/** Holds the parse open until the test resolves it. */
const holdParse = () => {
  let finish: (value: unknown) => void = () => {};
  vi.mocked(parseSyllabusStructure).mockImplementation(
    () => new Promise((resolve) => (finish = resolve))
  );
  return (value: unknown) => finish(value);
};

describe('a topic created from syllabus text while the reader moves on', () => {
  it('is created in the course the reader asked from, and the selection stays where they are', async () => {
    const finish = holdParse();
    const onAdd = vi.fn();
    const { rerender } = render(selector({ courseId: 'c1' }, onAdd));

    startParse();
    rerender(selector({ courseId: 'c2' }, onAdd));
    await act(async () => finish(parsed));

    expect(onAdd).toHaveBeenCalledWith(
      'Heredity',
      [{ name: 'Genes', dotPoints: ['Explain patterns'] }],
      expect.objectContaining({ courseId: 'c1', select: false })
    );
  });

  it('is selected when the reader is still on the course they asked from', async () => {
    const finish = holdParse();
    const onAdd = vi.fn();
    render(selector({ courseId: 'c1' }, onAdd));

    startParse();
    await act(async () => finish(parsed));

    expect(onAdd).toHaveBeenCalledWith(
      'Heredity',
      [{ name: 'Genes', dotPoints: ['Explain patterns'] }],
      expect.objectContaining({ courseId: 'c1', select: true })
    );
  });
});
