import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import PromptSelector from '../../components/PromptSelector';
import SyllabusImportModal from '../../components/SyllabusImportModal';
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
      onAddTopic={noop}
      onAddSubTopic={noop}
      onGeneratePrompt={noop}
      onManualEntry={noop}
      onEditOutcomes={noop}
      onOpenDataManager={noop}
      onRenameItem={noop}
      onDeleteItem={noop}
      onAddTopicFromSyllabus={handlers.onAddTopicFromSyllabus ?? noop}
      onGenerateSuggestedTopic={noop}
      onGenerateDotPoints={noop}
      onImportTopic={handlers.onImportTopic ?? noop}
      onImportSyllabus={handlers.onImportSyllabus ?? noop}
      newlyAddedIds={new Set()}
      userRole={userRole}
    />
  );
};

describe('Syllabus import entry points (PromptSelector)', () => {
  it('shows the Import Syllabus button to curators and fires its handler', () => {
    const onImportSyllabus = vi.fn();
    renderSelector('teacher', {}, { onImportSyllabus });

    const button = screen.getByTitle(/Import Syllabus \(AI\)/);
    fireEvent.click(button);
    expect(onImportSyllabus).toHaveBeenCalledTimes(1);
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

  it('offers the topic-level syllabus import once a topic is selected', () => {
    const onAddTopicFromSyllabus = vi.fn();
    renderSelector('admin', { courseId: 'c1', topicId: 't1' }, { onAddTopicFromSyllabus });

    fireEvent.click(screen.getByTitle(/Import sub-topics into "Programming for the Web"/));
    expect(onAddTopicFromSyllabus).toHaveBeenCalledTimes(1);
  });
});

describe('SyllabusImportModal input validation', () => {
  beforeEach(() => vi.clearAllMocks());

  const renderModal = () =>
    render(
      <SyllabusImportModal isOpen={true} onClose={vi.fn()} courses={[]} onImport={vi.fn()} />
    );

  it('rejects an invalid URL without spending an AI call', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText(/educationstandards/), {
      target: { value: 'not a url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /fetch content/i }));

    expect(screen.getByText(/does not look like a valid web address/i)).toBeTruthy();
    expect(fetchSyllabusContentFromUrl).not.toHaveBeenCalled();
  });

  it('surfaces a helpful error when a page returns no usable content', async () => {
    vi.mocked(fetchSyllabusContentFromUrl).mockResolvedValue('   ');
    vi.mocked(splitSyllabusIntoTopics).mockResolvedValue([]);
    renderModal();

    fireEvent.change(screen.getByPlaceholderText(/educationstandards/), {
      target: { value: 'https://educationstandards.nsw.edu.au/syllabus' },
    });
    fireEvent.click(screen.getByRole('button', { name: /fetch content/i }));

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
