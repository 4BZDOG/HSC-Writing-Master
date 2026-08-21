import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import SyllabusImportModal from '../../components/SyllabusImportModal';
import TopicSyllabusImportModal from '../../components/TopicSyllabusImportModal';
import type { Course, StatePath, UserRole } from '../../types';

/**
 * Entry-point and error-path tests for the syllabus import workflow: the
 * launch buttons in the navigator must exist (they were once orphaned — the
 * modal was mounted but nothing opened it) and the modal must reject bad
 * input before spending an AI call.
 */

vi.mock('../../services/geminiService', () => ({
  parseOutcomesFromText: vi.fn(),
  parseSyllabusStructure: vi.fn(),
  fetchSyllabusContentFromUrl: vi.fn(),
  splitSyllabusIntoTopics: vi.fn(),
}));

// Keep the AI-studio controls unlocked so clicks reach the real handlers.
vi.mock('../../services/entitlements', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/entitlements')>();
  return { ...actual, isFeatureLocked: () => false };
});

import {
  fetchSyllabusContentFromUrl,
  parseSyllabusStructure,
  splitSyllabusIntoTopics,
} from '../../services/geminiService';

const course: Course = {
  id: 'c1',
  name: 'Software Engineering',
  outcomes: [],
  topics: [{ id: 't1', name: 'Programming for the Web', subTopics: [] }],
};

const renderSelector = (
  userRole: UserRole,
  statePath: Partial<StatePath> = {},
  handlers: Record<string, () => void> = {}
) => {
  const noop = vi.fn();
  render(
    <PromptSelector
      courses={[course]}
      statePath={statePath as StatePath}
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
      onAddTopicFromSyllabus={handlers.onAddTopicFromSyllabus ?? noop}
      onAddTopicWithContent={noop}
      onGenerateDotPoints={noop}
      onImportTopic={handlers.onImportTopic ?? noop}
      onImportSyllabus={handlers.onImportSyllabus ?? noop}
      newlyAddedIds={new Set()}
      userRole={userRole}
    />
  );
};

describe('Syllabus import entry points (PromptSelector)', () => {
  it('shows the Import Syllabus button to admins and fires its handler', () => {
    const onImportSyllabus = vi.fn();
    renderSelector('admin', {}, { onImportSyllabus });

    const button = screen.getByTitle(/Import Syllabus \(AI\)/);
    fireEvent.click(button);
    expect(onImportSyllabus).toHaveBeenCalledTimes(1);
  });

  it('withholds course and topic CREATION from teachers, keeping the rest', () => {
    // Courses and topics are the shared skeleton — see canCreateCurriculum.
    // A teacher curates everything below a topic but does not get to add a
    // course, or the AI import that builds one.
    renderSelector('teacher', { courseId: 'c1' });
    expect(screen.queryByTitle(/Import Syllabus \(AI\)/)).toBeNull();
    expect(screen.queryByTitle('Add Course')).toBeNull();
    expect(screen.queryByTitle('Import Topic (.json)')).toBeNull();
    expect(screen.queryByTitle(/Build a new topic from NESA syllabus text/)).toBeNull();
    // Still theirs: renaming and editing the course they were given.
    expect(screen.getByTitle('Edit Outcomes')).toBeTruthy();
  });

  it('hides all curation entry points from students', () => {
    renderSelector('user');
    expect(screen.queryByTitle(/Import Syllabus \(AI\)/)).toBeNull();
    expect(screen.queryByTitle('Import Topic (.json)')).toBeNull();
  });

  it('offers Import Topic (.json) when a course is selected but no topic yet', () => {
    const onImportTopic = vi.fn();
    renderSelector('admin', { courseId: 'c1' }, { onImportTopic });

    fireEvent.click(screen.getByTitle('Import Topic (.json)'));
    expect(onImportTopic).toHaveBeenCalledTimes(1);
  });

  it('offers From Syllabus (new topic) when a course is selected but no topic yet', () => {
    const onAddTopicFromSyllabus = vi.fn();
    renderSelector('admin', { courseId: 'c1' }, { onAddTopicFromSyllabus });

    fireEvent.click(screen.getByTitle(/Build a new topic from NESA syllabus text/));
    expect(onAddTopicFromSyllabus).toHaveBeenCalledTimes(1);
  });

  it('offers the topic-level syllabus import once a topic is selected', () => {
    const onAddTopicFromSyllabus = vi.fn();
    renderSelector('admin', { courseId: 'c1', topicId: 't1' }, { onAddTopicFromSyllabus });

    fireEvent.click(screen.getByTitle(/into "Programming for the Web"/));
    expect(onAddTopicFromSyllabus).toHaveBeenCalledTimes(1);
  });
});

describe('SyllabusImportModal input validation', () => {
  beforeEach(() => vi.clearAllMocks());

  const renderModal = () =>
    render(
      <SyllabusImportModal
        isOpen={true}
        onClose={vi.fn()}
        courses={[]}
        onImport={vi.fn()}
        defaultYear="year12"
      />
    );

  it('rejects an invalid URL without spending an AI call', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/educationstandards/), {
      target: { value: 'not a url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));

    expect(screen.getByText(/does not look like a web address/i)).toBeTruthy();
    expect(fetchSyllabusContentFromUrl).not.toHaveBeenCalled();
  });

  it('surfaces a helpful error when a page returns no usable content', async () => {
    vi.mocked(fetchSyllabusContentFromUrl).mockResolvedValue('   ');
    vi.mocked(splitSyllabusIntoTopics).mockResolvedValue([]);
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/educationstandards/), {
      target: { value: 'https://educationstandards.nsw.edu.au/syllabus' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));

    expect(await screen.findByText(/Couldn't read any syllabus content/i)).toBeTruthy();
  });

  it('requires a course name before analysing', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /analyse syllabus/i }));
    expect(screen.getByText('Course name is required.')).toBeTruthy();
  });

  it('requires syllabus content in at least one topic tab', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/New course name/), {
      target: { value: 'HSC Enterprise Computing' },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyse syllabus/i }));
    expect(screen.getByText(/enter syllabus content for at least one topic/i)).toBeTruthy();
  });
});

describe('TopicSyllabusImportModal (add a topic to an existing course)', () => {
  beforeEach(() => vi.clearAllMocks());

  const renderModal = (overrides: Partial<React.ComponentProps<typeof TopicSyllabusImportModal>> = {}) =>
    render(
      <TopicSyllabusImportModal
        isOpen={true}
        onClose={vi.fn()}
        courseName="Software Engineering"
        year="year12"
        topics={[{ id: 't1', name: 'Programming for the Web' }]}
        initialTopicId={null}
        onImport={vi.fn()}
        {...overrides}
      />
    );

  it('requires syllabus content before analysing', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: /analyse syllabus/i }));
    expect(screen.getByText(/paste syllabus content/i)).toBeTruthy();
    expect(parseSyllabusStructure).not.toHaveBeenCalled();
  });

  it('rejects an invalid URL without spending an AI call', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/educationstandards/), {
      target: { value: 'not a url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
    expect(screen.getByText(/does not look like a web address/i)).toBeTruthy();
    expect(fetchSyllabusContentFromUrl).not.toHaveBeenCalled();
  });

  it('creates a new topic with the AI-detected name when the name is left blank', async () => {
    vi.mocked(parseSyllabusStructure).mockResolvedValue([
      {
        name: 'Secure Software Architecture',
        subTopics: [
          { name: 'Designing software', dotPoints: ['dp one', 'dp two'] },
          { name: 'Developing secure code', dotPoints: ['dp three'] },
        ],
      },
    ]);
    const onImport = vi.fn();
    renderModal({ onImport });

    fireEvent.change(screen.getByLabelText('Syllabus Content'), {
      target: { value: 'Outcomes and content for secure software architecture...' },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyse syllabus/i }));

    // Preview: detected name shown, counts correct.
    expect(await screen.findByDisplayValue('Secure Software Architecture')).toBeTruthy();
    expect(screen.getByText('2 sub-topics · 3 dot points')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /create topic/i }));
    expect(onImport).toHaveBeenCalledWith({
      targetTopicId: null,
      topicName: 'Secure Software Architecture',
      subTopics: [
        { name: 'Designing software', dotPoints: ['dp one', 'dp two'] },
        { name: 'Developing secure code', dotPoints: ['dp three'] },
      ],
    });
  });

  it('preselects the destination and reports it when launched from a selected topic', async () => {
    vi.mocked(parseSyllabusStructure).mockResolvedValue([
      { name: 'Anything', subTopics: [{ name: 'ST', dotPoints: ['dp'] }] },
    ]);
    const onImport = vi.fn();
    renderModal({ onImport, initialTopicId: 't1' });

    expect((screen.getByLabelText('Import Into') as HTMLSelectElement).value).toBe('t1');

    fireEvent.change(screen.getByLabelText('Syllabus Content'), {
      target: { value: 'some syllabus text' },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyse syllabus/i }));

    const confirm = await screen.findByRole('button', {
      name: /add to programming for the web/i,
    });
    fireEvent.click(confirm);
    expect(onImport).toHaveBeenCalledWith(
      expect.objectContaining({ targetTopicId: 't1', topicName: 'Programming for the Web' })
    );
  });

  it('surfaces an error when no sub-topics can be extracted', async () => {
    vi.mocked(parseSyllabusStructure).mockResolvedValue([]);
    renderModal();
    fireEvent.change(screen.getByLabelText('Syllabus Content'), {
      target: { value: 'garbled text' },
    });
    fireEvent.click(screen.getByRole('button', { name: /analyse syllabus/i }));
    expect(await screen.findByText(/no sub-topics could be extracted/i)).toBeTruthy();
  });
});
