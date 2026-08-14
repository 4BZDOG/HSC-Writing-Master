import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import { Course, Prompt, PromptVerb, StatePath } from '../../types';

/**
 * Choosing at any level of the navigator clears every level below it. That is
 * the right behaviour — a topic id from one course means nothing in another —
 * but until now it was the quietest thing the app does: up to four steps leave
 * the DOM, the question the reader had chosen goes with them, and nothing was
 * announced. A sighted reader watches four cards fold away; everybody else was
 * told nothing at all.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

const makePrompt = (id: string, question: string): Prompt =>
  ({ id, question, verb: 'ASSESS' as PromptVerb, totalMarks: 8 }) as Prompt;

const courses: Course[] = [
  {
    id: 'c1',
    name: 'Software Engineering',
    outcomes: [],
    topics: [
      {
        id: 't1',
        name: 'Programming for the Web',
        subTopics: [
          {
            id: 's1',
            name: 'Web Systems',
            dotPoints: [
              {
                id: 'd1',
                description: 'Explore the applications of web programming.',
                prompts: [makePrompt('p1', 'Assess the value of automated testing.')],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'c2',
    name: 'Biology',
    outcomes: [],
    topics: [
      {
        id: 't2',
        name: 'Heredity',
        subTopics: [
          {
            id: 's2',
            name: 'Reproduction',
            dotPoints: [{ id: 'd2', description: 'Explain inheritance.', prompts: [] }],
          },
        ],
      },
    ],
  },
];

const noop = vi.fn();

const props = {
  courses,
  onPathChange: noop,
  onAddCourse: noop,
  onAddSubTopic: noop,
  onGeneratePrompt: noop,
  onManualEntry: noop,
  onEditOutcomes: noop,
  onOpenDataManager: noop,
  onRenameItem: noop,
  onDeleteItem: noop,
  onAddTopicFromSyllabus: noop,
  onAddTopicWithContent: noop,
  onGenerateDotPoints: noop,
  onImportTopic: noop,
  onImportSyllabus: noop,
  newlyAddedIds: new Set<string>(),
  userRole: 'user' as const,
};

const fullPath: StatePath = {
  courseId: 'c1',
  topicId: 't1',
  subTopicId: 's1',
  dotPointId: 'd1',
  promptId: 'p1',
} as StatePath;

const region = () => screen.getByRole('status');

describe('the navigator says what the cascade did', () => {
  it('is a polite, atomic status region and is silent on arrival', () => {
    // An assignment link lands a reader on a whole path at once. Reading five
    // levels out before they have done anything is noise, not an announcement.
    render(<PromptSelector {...props} statePath={fullPath} />);

    expect(region().getAttribute('aria-live')).toBe('polite');
    expect(region().getAttribute('aria-atomic')).toBe('true');
    expect(region().className).toContain('sr-only');
    expect(region().textContent).toBe('');
  });

  it('names what was set and what that wiped out', () => {
    const { rerender } = render(<PromptSelector {...props} statePath={fullPath} />);

    rerender(<PromptSelector {...props} statePath={{ courseId: 'c2' } as StatePath} />);

    // Both halves. The second sentence is the one that was missing: four levels
    // and the reader's chosen question left the page without a word.
    expect(region().textContent).toBe(
      'Course set to Biology. Topic, sub-topic, syllabus point and question cleared.'
    );
  });

  it('says which level a step back has left empty', () => {
    const { rerender } = render(<PromptSelector {...props} statePath={fullPath} />);

    // A crumb click from the collapsed bar clears without setting anything.
    rerender(
      <PromptSelector
        {...props}
        statePath={{ courseId: 'c1', topicId: 't1', subTopicId: 's1' } as StatePath}
      />
    );

    expect(region().textContent).toBe(
      'Syllabus point and question cleared. Choose a syllabus point to continue.'
    );
  });

  it('names a single question by the question itself', () => {
    const { rerender } = render(
      <PromptSelector
        {...props}
        statePath={
          { courseId: 'c1', topicId: 't1', subTopicId: 's1', dotPointId: 'd1' } as StatePath
        }
      />
    );

    rerender(<PromptSelector {...props} statePath={fullPath} />);

    expect(region().textContent).toBe('Question set to Assess the value of automated testing.');
  });

  it('says nothing when the path has not moved', () => {
    const { rerender } = render(<PromptSelector {...props} statePath={fullPath} />);

    // A re-render carrying the same path — an attempt history arriving, a
    // course list refreshing — must not re-announce anything.
    rerender(<PromptSelector {...props} statePath={{ ...fullPath }} />);

    expect(region().textContent).toBe('');
  });
});
