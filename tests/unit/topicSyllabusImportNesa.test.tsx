import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import TopicSyllabusImportModal from '../../components/TopicSyllabusImportModal';
import type { NesaPage } from '../../services/geminiService';

/**
 * Adding one focus area to the current course and year, from a NESA page.
 *
 * The page's own structure is used as it stands. The year is never changed to
 * suit the page: a Year 11 focus area opened from a Year 12 view is still added
 * to Year 12, and the modal says so.
 */

vi.mock('../../services/geminiService', () => ({
  parseSyllabusStructure: vi.fn(),
  fetchSyllabusPage: vi.fn(),
}));

import { fetchSyllabusPage, parseSyllabusStructure } from '../../services/geminiService';

const URL_HEALTH = 'https://curriculum.nsw.edu.au/learning-areas/pdhpe-7-12-2023/health-issues';

const healthIssues: NesaPage = {
  syllabus: 'Health and Movement Science 11–12 (2023)',
  year: 'year11',
  title: 'Health Issues',
  outcomes: [],
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
    {
      title: 'Skills',
      statements: [{ code: 'HM11.2', text: 'Plan a session.', including: [] }],
    },
  ],
  electives: [],
  siblings: [],
};

const renderModal = (overrides: Partial<ComponentProps<typeof TopicSyllabusImportModal>> = {}) => {
  const onImport = vi.fn();
  render(
    <TopicSyllabusImportModal
      isOpen={true}
      onClose={vi.fn()}
      courseName="Health and Movement Science"
      year="year12"
      topics={[]}
      initialTopicId={null}
      onImport={onImport}
      {...overrides}
    />
  );
  return onImport;
};

const fetchPage = () => {
  fireEvent.change(screen.getByPlaceholderText(/curriculum\.nsw\.edu\.au/), {
    target: { value: URL_HEALTH },
  });
  fireEvent.click(screen.getByRole('button', { name: /^fetch$/i }));
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchSyllabusPage).mockResolvedValue({
    text: 'The page text.',
    nesa: healthIssues,
  });
});

afterEach(cleanup);

describe('TopicSyllabusImportModal reading a NESA page', () => {
  it('builds the preview from NESA’s structure and makes no AI call', async () => {
    renderModal();
    fetchPage();

    expect(await screen.findByText('Read from NESA — exact wording, no AI.')).toBeTruthy();
    expect(parseSyllabusStructure).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue('Health Issues')).toBeTruthy();
    expect(screen.getByText('Key concepts')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
  });

  it('adds the focus area to the year the modal is in, and warns when the page is another year', async () => {
    renderModal({ year: 'year12' });
    fetchPage();

    expect(
      await screen.findByText(
        'This focus area is Year 11 content; it will be added to Year 12 because that is where you are.'
      )
    ).toBeTruthy();
  });

  it('shows no year warning when the page is the year the modal is in', async () => {
    vi.mocked(fetchSyllabusPage).mockResolvedValue({
      text: 'The page text.',
      nesa: { ...healthIssues, year: 'year12' },
    });
    renderModal({ year: 'year12' });
    fetchPage();

    await screen.findByText('Read from NESA — exact wording, no AI.');
    expect(screen.queryByText(/will be added to/)).toBeNull();
  });

  it('imports the exact dot points under the page title', async () => {
    const onImport = renderModal({ year: 'year11' });
    fetchPage();

    await screen.findByText('Read from NESA — exact wording, no AI.');
    fireEvent.click(screen.getByRole('button', { name: /create topic/i }));

    expect(onImport).toHaveBeenCalledWith({
      targetTopicId: null,
      topicName: 'Health Issues',
      subTopics: [
        {
          name: 'Key concepts',
          dotPoints: ['Explain the factors affecting health (nutrition; physical activity)'],
        },
        { name: 'Skills', dotPoints: ['Plan a session'] },
      ],
    });
  });
});
