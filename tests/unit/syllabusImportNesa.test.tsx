import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import SyllabusImportModal from '../../components/SyllabusImportModal';
import type { NesaPage } from '../../services/geminiService';

/**
 * The import, read from NESA's own structure.
 *
 * A curriculum page that comes with its structure is used as it stands: no AI
 * call, NESA's wording, its outcomes, and its other focus areas to add. These
 * tests drive the modal through that path, with the page reader mocked.
 */

vi.mock('../../services/geminiService', () => ({
  parseOutcomesFromText: vi.fn(),
  parseSyllabusStructure: vi.fn(),
  fetchSyllabusPage: vi.fn(),
  splitSyllabusIntoTopics: vi.fn(),
}));

import {
  fetchSyllabusPage,
  parseOutcomesFromText,
  parseSyllabusStructure,
  splitSyllabusIntoTopics,
} from '../../services/geminiService';

const SYLLABUS = 'Health and Movement Science 11–12 (2023)';
const BASE = 'https://curriculum.nsw.edu.au/learning-areas/pdhpe-7-12-2023/';
const URL_HEALTH = `${BASE}health-issues`;
const URL_STRESS = `${BASE}stress`;
const URL_MOVEMENT = `${BASE}movement`;

const sibling = (
  slug: string,
  title: string,
  year: 'year11' | 'year12',
  optionsList?: string
): NesaPage['siblings'][number] => ({
  path: `${BASE}${slug}`,
  title,
  year,
  ...(optionsList ? { optionsList } : {}),
});

/** Year 11 focus area that the import opens on. Its siblings are the picker's rows. */
const healthIssues: NesaPage = {
  syllabus: SYLLABUS,
  year: 'year11',
  title: 'Health Issues',
  outcomes: [{ code: 'HM-11-01', description: 'analyses the factors that affect health' }],
  groups: [
    {
      title: 'Key concepts',
      statements: [
        {
          code: 'HM11.1',
          text: 'Explain the factors affecting health.',
          including: ['nutrition', 'physical activity.'],
        },
      ],
    },
  ],
  electives: [],
  siblings: [
    sibling('stress', 'Stress', 'year11'),
    sibling('movement', 'Movement', 'year12'),
    sibling('sport-a', '', 'year12', 'Elective focus areas'),
    sibling('sport-b', '', 'year12', 'Elective focus areas'),
  ],
};

const stress: NesaPage = {
  syllabus: SYLLABUS,
  year: 'year11',
  title: 'Stress',
  outcomes: [{ code: 'HM-11-02', description: 'describes the effects of stress' }],
  groups: [
    {
      title: 'Key concepts',
      statements: [{ code: 'HM11.4', text: 'Describe stress.', including: [] }],
    },
  ],
  electives: [],
  siblings: [],
};

const movement: NesaPage = {
  syllabus: SYLLABUS,
  year: 'year12',
  title: 'Movement',
  outcomes: [{ code: 'HM-12-01', description: 'evaluates movement' }],
  groups: [
    {
      title: 'Movement',
      statements: [{ code: 'MOV.1', text: 'Analyse movement.', including: [] }],
    },
  ],
  electives: [],
  siblings: [],
};

const pages: Record<string, NesaPage> = {
  [URL_HEALTH]: healthIssues,
  [URL_STRESS]: stress,
  [URL_MOVEMENT]: movement,
};

const renderModal = (onImport = vi.fn()) =>
  render(
    <SyllabusImportModal
      isOpen
      onClose={vi.fn()}
      courses={[]}
      onImport={onImport}
      defaultYear="year12"
    />
  );

/** Types a URL into the fetch box and presses Fetch. */
const fetchPage = (url: string) => {
  fireEvent.change(screen.getByPlaceholderText(/curriculum\.nsw\.edu\.au/), { target: { value: url } });
  fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
};

/** Opens the modal on the Year 11 Health Issues page, which the rest build on. */
const openHealthIssues = async () => {
  renderModal();
  fetchPage(URL_HEALTH);
  await screen.findByText(/Read from NESA/);
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchSyllabusPage).mockImplementation(async (url: string) => {
    const nesa = pages[url];
    if (!nesa) throw new Error('The page reader returned HTTP 404.');
    return { text: 'The page text, which the AI path would have read.', nesa };
  });
});

afterEach(cleanup);

describe('reading a NESA page', () => {
  it('uses the page structure and makes no AI call', async () => {
    await openHealthIssues();

    expect(fetchSyllabusPage).toHaveBeenCalledWith(URL_HEALTH);
    expect(parseSyllabusStructure).not.toHaveBeenCalled();
    expect(splitSyllabusIntoTopics).not.toHaveBeenCalled();
    expect(parseOutcomesFromText).not.toHaveBeenCalled();
  });

  it('fills the course name, the year and the outcomes from the page', async () => {
    await openHealthIssues();

    expect((screen.getByPlaceholderText(/New course name/) as HTMLInputElement).value).toBe(
      'HSC Health and Movement Science'
    );
    expect(screen.getByRole('radio', { name: 'Year 11' }).getAttribute('aria-checked')).toBe(
      'true'
    );
    expect(screen.getByText('1 outcomes from NESA')).toBeTruthy();
  });

  it('lists the other focus areas of the syllabus, grouped by year', async () => {
    await openHealthIssues();

    expect(screen.getByText('Add more from this syllabus')).toBeTruthy();
    expect(screen.getByLabelText('Stress')).toBeTruthy();
    expect(screen.getByLabelText('Movement')).toBeTruthy();
    // An options list is one row, whose checkbox selects all of its options.
    expect(screen.getByLabelText('Elective focus areas · 2 options')).toBeTruthy();
  });

  it('switches the button to Review import, which skips the AI', async () => {
    await openHealthIssues();

    expect(screen.getByRole('button', { name: /review import/i })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /analyse syllabus/i })).toBeNull();
  });
});

describe('adding more focus areas', () => {
  it('fetches each chosen page and adds both to the import', async () => {
    await openHealthIssues();

    fireEvent.click(screen.getByLabelText('Stress'));
    fireEvent.click(screen.getByLabelText('Movement'));
    fireEvent.click(screen.getByRole('button', { name: /add selected/i }));

    const list = await screen.findByRole('list', { name: 'Focus areas in this import' });
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(3));
    expect(within(list).getByText('Stress')).toBeTruthy();
    expect(within(list).getByText('Movement')).toBeTruthy();
    expect(fetchSyllabusPage).toHaveBeenCalledWith(URL_STRESS);
    expect(fetchSyllabusPage).toHaveBeenCalledWith(URL_MOVEMENT);
    // Added pages leave the picker.
    expect(screen.queryByLabelText('Stress')).toBeNull();
  });

  it('reports a page that fails and still adds the one that works', async () => {
    vi.mocked(fetchSyllabusPage).mockImplementation(async (url: string) => {
      if (url === URL_STRESS) throw new Error('The page reader returned HTTP 502.');
      return { text: 'page text', nesa: pages[url] };
    });
    await openHealthIssues();

    fireEvent.click(screen.getByLabelText('Stress'));
    fireEvent.click(screen.getByLabelText('Movement'));
    fireEvent.click(screen.getByRole('button', { name: /add selected/i }));

    expect(
      await screen.findByText(/1 of 2 pages could not be added: Stress \(The page reader/)
    ).toBeTruthy();
    const list = screen.getByRole('list', { name: 'Focus areas in this import' });
    expect(within(list).getByText('Movement')).toBeTruthy();
    expect(within(list).queryByText('Stress')).toBeNull();
  });

  it('removing a focus area also removes the outcomes only it held', async () => {
    await openHealthIssues();

    fireEvent.click(screen.getByLabelText('Movement'));
    fireEvent.click(screen.getByRole('button', { name: /add selected/i }));
    await screen.findByText('2 outcomes from NESA');

    fireEvent.click(screen.getByRole('button', { name: 'Remove Movement' }));
    expect(screen.getByText('1 outcomes from NESA')).toBeTruthy();
  });
});

describe('reviewing and importing', () => {
  it('shows the preview with a year badge on each topic', async () => {
    await openHealthIssues();
    fireEvent.click(screen.getByLabelText('Movement'));
    fireEvent.click(screen.getByRole('button', { name: /add selected/i }));
    await screen.findByText('2 outcomes from NESA');

    fireEvent.click(screen.getByRole('button', { name: /review import/i }));

    expect(await screen.findByDisplayValue('Health Issues')).toBeTruthy();
    expect((screen.getByLabelText('Topic 2 name') as HTMLInputElement).value).toBe('Movement');
    expect(screen.getByText('Year 11')).toBeTruthy();
    expect(screen.getByText('Year 12')).toBeTruthy();
    expect(parseSyllabusStructure).not.toHaveBeenCalled();
  });

  it('imports each topic with its own year and NESA’s dot points', async () => {
    const onImport = vi.fn();
    renderModal(onImport);
    fetchPage(URL_HEALTH);
    await screen.findByText(/Read from NESA/);
    fireEvent.click(screen.getByLabelText('Movement'));
    fireEvent.click(screen.getByRole('button', { name: /add selected/i }));
    await screen.findByText('2 outcomes from NESA');
    fireEvent.click(screen.getByRole('button', { name: /review import/i }));
    await screen.findByDisplayValue('Health Issues');

    fireEvent.click(screen.getByRole('button', { name: /import syllabus/i }));

    expect(onImport).toHaveBeenCalledWith(
      'HSC Health and Movement Science',
      [
        {
          name: 'Health Issues',
          subTopics: [
            {
              name: 'Key concepts',
              dotPoints: ['Explain the factors affecting health (nutrition; physical activity)'],
            },
          ],
          year: 'year11',
        },
        {
          name: 'Movement',
          subTopics: [{ name: 'Movement', dotPoints: ['Analyse movement'] }],
          year: 'year12',
        },
      ],
      [
        {
          code: 'HM-11-01',
          description: 'analyses the factors that affect health',
          year: 'year11',
        },
        { code: 'HM-12-01', description: 'evaluates movement', year: 'year12' },
      ],
      undefined,
      undefined,
      'year11'
    );
  });
});
