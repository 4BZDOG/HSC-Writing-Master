import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import SyllabusImportModal from '../../components/SyllabusImportModal';
import TopicSyllabusImportModal from '../../components/TopicSyllabusImportModal';

/**
 * A stray click must not throw away a pasted syllabus.
 *
 * These modals are where twenty minutes of an admin's attention lives — pasted
 * NESA text, split across tabs, analysed and pruned — with nowhere else for it
 * to be stored. Every one of them closed on a click anywhere outside the panel,
 * and closing wipes that state. The dark area is large, it is exactly where the
 * pointer travels between the page and the dialog, and one miss cost the lot.
 */

vi.mock('../../services/geminiService', () => ({
  parseOutcomesFromText: vi.fn(),
  parseSyllabusStructure: vi.fn(),
  fetchSyllabusContentFromUrl: vi.fn(),
  splitSyllabusIntoTopics: vi.fn(),
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

/** The full-screen dark area behind the panel. */
const backdrop = () => document.querySelector('.fixed.inset-0') as HTMLElement;

describe('the course syllabus import', () => {
  const renderModal = (onClose = vi.fn()) => {
    render(
      <SyllabusImportModal
        isOpen
        onClose={onClose}
        courses={[]}
        onImport={vi.fn()}
        defaultYear="year12"
      />
    );
    return onClose;
  };

  it('closes on a backdrop click while there is nothing to lose', () => {
    const onClose = renderModal();
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalled();
  });

  it('ignores a backdrop click once syllabus text has been pasted', () => {
    const onClose = renderModal();
    fireEvent.change(screen.getByPlaceholderText(/paste dot points, sub-topics/i), {
      target: { value: 'Module 1: Cells\n- describe cell structure' },
    });

    fireEvent.click(backdrop());

    // Inert, not merely survivable: a misplaced click should do nothing at all.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.queryByText(/Discard/)).toBeNull();
  });

  it('asks before discarding when the close is deliberate', () => {
    const onClose = renderModal();
    fireEvent.change(screen.getByPlaceholderText(/paste dot points, sub-topics/i), {
      target: { value: 'Module 1: Cells' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText(/Discard the syllabus content you have entered/)).toBeTruthy();

    // Keeping puts the work back, untouched.
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Module 1: Cells')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onClose).toHaveBeenCalled();
  });
});

describe('the topic syllabus import', () => {
  const renderModal = (onClose = vi.fn()) => {
    render(
      <TopicSyllabusImportModal
        isOpen
        onClose={onClose}
        courseName="HSC Biology"
        year="year12"
        topics={[]}
        initialTopicId={null}
        onImport={vi.fn()}
      />
    );
    return onClose;
  };

  it('holds on to pasted text through a stray backdrop click', () => {
    const onClose = renderModal();
    fireEvent.change(screen.getByPlaceholderText(/paste the topic's sub-topics/i), {
      target: { value: 'Inquiry question 1' },
    });

    fireEvent.click(backdrop());

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Inquiry question 1')).toBeTruthy();
  });

  it('still closes freely when nothing has been entered', () => {
    const onClose = renderModal();
    fireEvent.click(backdrop());
    expect(onClose).toHaveBeenCalled();
  });
});
