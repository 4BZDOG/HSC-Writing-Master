import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import SyllabusImportModal from '../../components/SyllabusImportModal';

/**
 * Fix the parser's mistakes before they become content.
 *
 * The preview could only DELETE, so a topic the parser named "Module 5 – 5
 * Module" had to be imported wrong and renamed afterwards, and a mangled dot
 * point had to be deleted and retyped in the Vault. Both are the text that
 * question generation later reads, so getting them right here is worth more
 * than anywhere else in the seeding workflow.
 */

vi.mock('../../services/geminiService', () => ({
  parseOutcomesFromText: vi.fn(),
  parseSyllabusStructure: vi.fn(),
  fetchSyllabusContentFromUrl: vi.fn(),
  splitSyllabusIntoTopics: vi.fn(),
}));

import { parseSyllabusStructure } from '../../services/geminiService';

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const parsed = [
  {
    name: 'Module 5 – 5 Module',
    subTopics: [{ name: 'Sub-topic wtih a typo', dotPoints: ['descrbes cell structure'] }],
  },
];

const openAndAnalyse = async (onImport = vi.fn()) => {
  vi.mocked(parseSyllabusStructure).mockResolvedValue(parsed as never);
  render(
    <SyllabusImportModal
      isOpen
      onClose={vi.fn()}
      courses={[]}
      onImport={onImport}
      defaultYear="year12"
    />
  );
  fireEvent.change(screen.getByPlaceholderText(/New course name/), {
    target: { value: 'HSC Biology' },
  });
  fireEvent.change(screen.getByPlaceholderText(/paste dot points, sub-topics/i), {
    target: { value: 'some syllabus text' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Analyse Syllabus/ }));
  await waitFor(() => expect(screen.getByLabelText('Topic 1 name')).toBeTruthy());
  return onImport;
};

describe('creating a course by importing a syllabus', () => {
  it('refuses a name an existing course already has, and points at the merge', async () => {
    const onImport = vi.fn();
    render(
      <SyllabusImportModal
        isOpen
        onClose={vi.fn()}
        courses={[{ id: 'c1', name: 'HSC Biology', outcomes: [], topics: [] } as never]}
        onImport={onImport}
        defaultYear="year12"
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/New course name/), {
      target: { value: '  hsc biology ' },
    });
    fireEvent.change(screen.getByPlaceholderText(/paste dot points, sub-topics/i), {
      target: { value: 'some syllabus text' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Analyse Syllabus/ }));

    // Import matching pairs courses by name, so two of them split a subject
    // across entries that look identical in every picker.
    expect(await screen.findByText(/already exists/)).toBeTruthy();
    expect(parseSyllabusStructure).not.toHaveBeenCalled();
  });
});

describe('the structure preview', () => {
  it('lets every name and dot point be corrected before import', async () => {
    const onImport = await openAndAnalyse();

    fireEvent.change(screen.getByLabelText('Topic 1 name'), {
      target: { value: 'Module 5: Heredity' },
    });
    fireEvent.change(screen.getByLabelText('Sub-topic 1 name'), {
      target: { value: 'Reproduction' },
    });
    fireEvent.change(screen.getByLabelText('Dot point 1'), {
      target: { value: 'describes cell structure' },
    });

    fireEvent.click(screen.getByRole('button', { name: /Confirm & Import/ }));

    const structure = onImport.mock.calls[0][1];
    expect(structure[0].name).toBe('Module 5: Heredity');
    expect(structure[0].subTopics[0].name).toBe('Reproduction');
    expect(structure[0].subTopics[0].dotPoints).toEqual(['describes cell structure']);
  });

  it('refuses a name edited away to nothing', async () => {
    const onImport = await openAndAnalyse();

    fireEvent.change(screen.getByLabelText('Topic 1 name'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Import/ }));

    // A topic called "" is unselectable in every picker afterwards.
    expect(onImport).not.toHaveBeenCalled();
    expect(screen.getByText(/needs a name/)).toBeTruthy();
  });

  it('drops a dot point emptied in the preview, rather than importing a blank line', async () => {
    const onImport = await openAndAnalyse();

    fireEvent.change(screen.getByLabelText('Dot point 1'), { target: { value: '  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Import/ }));

    expect(onImport.mock.calls[0][1][0].subTopics[0].dotPoints).toEqual([]);
  });

  it('imports into the year chosen for the whole document', async () => {
    const onImport = vi.fn();
    vi.mocked(parseSyllabusStructure).mockResolvedValue(parsed as never);
    render(
      <SyllabusImportModal
        isOpen
        onClose={vi.fn()}
        courses={[]}
        onImport={onImport}
        defaultYear="year12"
      />
    );
    fireEvent.change(screen.getByPlaceholderText(/New course name/), {
      target: { value: 'HSC Biology' },
    });
    // A NESA document is one year's. Without this the course-level import could
    // only ever make Year 12 content, so a Year 11 course had to be built one
    // topic at a time through the picker.
    fireEvent.click(screen.getByRole('radio', { name: /Year 11/ }));
    fireEvent.change(screen.getByPlaceholderText(/paste dot points, sub-topics/i), {
      target: { value: 'some syllabus text' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Analyse Syllabus/ }));
    await waitFor(() => expect(screen.getByLabelText('Topic 1 name')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Confirm & Import/ }));

    expect(onImport.mock.calls[0][5]).toBe('year11');
  });
});
