import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import OutcomesEditorModal from '../../components/OutcomesEditorModal';
import type { CourseOutcome } from '../../types';

/**
 * The outcomes editor holds BOTH years, on tabs.
 *
 * It used to hold whichever year the navigator was on, which made a NESA
 * outcomes page unusable — those pages list Year 11 and Year 12 together, so
 * half of every fetch had nowhere to go. Holding both is also what makes the
 * save safe: it writes the whole list, which is only correct because the whole
 * list is in front of the user.
 */

vi.mock('../../services/geminiService', () => ({
  parseOutcomesFromText: vi.fn(),
  fetchSyllabusContentFromUrl: vi.fn(),
}));
vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

import { parseOutcomesFromText, fetchSyllabusContentFromUrl } from '../../services/geminiService';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// A real course as it exists today: HSC outcomes, none of them labelled,
// because they were written before the years were split.
const unlabelled: CourseOutcome[] = [
  { code: 'BI-12-01', description: 'HSC one' },
  { code: 'BI-12-02', description: 'HSC two' },
];

const openEditor = (
  year: 'year11' | 'year12',
  onSave: (o: CourseOutcome[]) => void = vi.fn(),
  outcomes: CourseOutcome[] = unlabelled
) =>
  render(
    <OutcomesEditorModal
      isOpen
      onClose={() => {}}
      onSave={onSave}
      initialOutcomes={outcomes}
      courseName="HSC Biology"
      year={year}
      showToast={() => {}}
    />
  );

const codeBoxes = () =>
  screen.getAllByPlaceholderText(/^e\.g\., SE-\d\d-01$/).map((el) => (el as HTMLInputElement).value);

describe('editing both years of outcomes', () => {
  it('opens on the navigator’s year but keeps the other one a tab away', () => {
    openEditor('year11');

    expect(screen.getByRole('tab', { name: /Year 11/ })).toHaveProperty('ariaSelected', 'true');
    // Unlabelled outcomes are Year 12, so Year 11 starts empty…
    expect(codeBoxes()).toEqual(['']);

    fireEvent.click(screen.getByRole('tab', { name: /Year 12/ }));
    // …and they are exactly one click away, not gone.
    expect(codeBoxes()).toEqual(['BI-12-01', 'BI-12-02']);
  });

  it('saves both years in one list, tagging only Year 11', () => {
    const saved: CourseOutcome[][] = [];
    openEditor('year11', (o) => saved.push(o));

    fireEvent.change(screen.getByPlaceholderText('e.g., SE-11-01'), {
      target: { value: 'BI-11-01' },
    });
    fireEvent.change(screen.getByPlaceholderText('Outcome description...'), {
      target: { value: 'Prelim one' },
    });
    fireEvent.click(screen.getByText('Save Changes'));

    // The Year 12 outcomes were never touched, and are still there.
    expect(saved[0]).toEqual([
      { code: 'BI-12-01', description: 'HSC one' },
      { code: 'BI-12-02', description: 'HSC two' },
      { code: 'BI-11-01', description: 'Prelim one', year: 'year11' },
    ]);
  });

  it('reads a NESA page and files each outcome under its own year', async () => {
    vi.mocked(fetchSyllabusContentFromUrl).mockResolvedValue('a page listing both years');
    vi.mocked(parseOutcomesFromText).mockResolvedValue([
      { code: 'BIO11-8', description: 'Prelim', year: 'year11' },
      { code: 'BIO12-12', description: 'HSC', year: 'year12' },
    ]);

    openEditor('year11', vi.fn(), []);
    fireEvent.change(screen.getByLabelText('Outcomes page URL'), {
      target: { value: 'curriculum.nsw.edu.au/biology' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch/ }));

    await waitFor(() => expect(codeBoxes()).toEqual(['BIO11-8']));
    // A bare domain is normalised rather than refused.
    expect(fetchSyllabusContentFromUrl).toHaveBeenCalledWith('https://curriculum.nsw.edu.au/biology');

    fireEvent.click(screen.getByRole('tab', { name: /Year 12/ }));
    expect(codeBoxes()).toEqual(['BIO12-12']);
  });

  it('puts an outcome the page did not place in the tab on screen', async () => {
    vi.mocked(fetchSyllabusContentFromUrl).mockResolvedValue('a page');
    vi.mocked(parseOutcomesFromText).mockResolvedValue([
      { code: 'XX-1', description: 'No year given' },
    ]);

    openEditor('year11', vi.fn(), []);
    fireEvent.change(screen.getByLabelText('Outcomes page URL'), {
      target: { value: 'https://curriculum.nsw.edu.au/x' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch/ }));

    await waitFor(() => expect(codeBoxes()).toEqual(['XX-1']));
  });

  it('shows the page reader’s own reason rather than a generic failure', async () => {
    vi.mocked(fetchSyllabusContentFromUrl).mockRejectedValue(
      new Error('Only NESA/NSW Education syllabus URLs are supported.')
    );

    openEditor('year12');
    fireEvent.change(screen.getByLabelText('Outcomes page URL'), {
      target: { value: 'https://example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch/ }));

    await waitFor(() =>
      expect(screen.getByText('Only NESA/NSW Education syllabus URLs are supported.')).toBeTruthy()
    );
    // Nothing was sent to the parser, so no AI call was spent on a page that
    // was never read.
    expect(parseOutcomesFromText).not.toHaveBeenCalled();
  });

  it('rejects something that is not a web address before any request', () => {
    openEditor('year12');
    fireEvent.change(screen.getByLabelText('Outcomes page URL'), {
      target: { value: 'not a url' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Fetch/ }));

    expect(screen.getByText(/does not look like a web address/)).toBeTruthy();
    expect(fetchSyllabusContentFromUrl).not.toHaveBeenCalled();
  });

  it('fetches on Enter, which is what everyone does', async () => {
    vi.mocked(fetchSyllabusContentFromUrl).mockResolvedValue('a page');
    vi.mocked(parseOutcomesFromText).mockResolvedValue([]);

    openEditor('year12');
    const field = screen.getByLabelText('Outcomes page URL');
    fireEvent.change(field, { target: { value: 'https://curriculum.nsw.edu.au/x' } });
    fireEvent.keyDown(field, { key: 'Enter' });

    await waitFor(() => expect(fetchSyllabusContentFromUrl).toHaveBeenCalled());
  });
});
