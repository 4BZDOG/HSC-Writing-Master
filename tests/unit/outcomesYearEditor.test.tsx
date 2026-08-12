import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import OutcomesEditorModal from '../../components/OutcomesEditorModal';
import { outcomesOfYear, replaceOutcomesForYear } from '../../utils/syllabusYear';
import type { CourseOutcome } from '../../types';

/**
 * Editing the outcomes of one year must not cost the other year's.
 *
 * The editor holds a single year, and its save replaces the course's whole
 * outcome list — so the two halves of this (what the modal is handed, and what
 * the save does with what it gives back) are the same defect if either is
 * wrong. They are tested together for that reason.
 */

vi.mock('../../services/geminiService', () => ({ parseOutcomesFromText: vi.fn() }));
vi.mock('../../services/entitlements', () => ({
  isFeatureLocked: () => false,
  requestUpgrade: vi.fn(),
}));

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(cleanup);

// A real course as it exists today: HSC outcomes, none of them labelled,
// because they were written before the years were split.
const course = {
  outcomes: [
    { code: 'BI-12-01', description: 'HSC one' },
    { code: 'BI-12-02', description: 'HSC two' },
  ] as CourseOutcome[],
};

const openEditor = (year: 'year11' | 'year12', onSave: (o: CourseOutcome[]) => void) =>
  render(
    <OutcomesEditorModal
      isOpen
      onClose={() => {}}
      onSave={onSave}
      initialOutcomes={outcomesOfYear(course, year)}
      courseName="HSC Biology"
      year={year}
      showToast={() => {}}
    />
  );

describe('editing outcomes one year at a time', () => {
  it('opens empty in Year 11 on a course whose outcomes predate the split', () => {
    openEditor('year11', () => {});

    expect(screen.getByText('Edit Year 11 Outcomes')).toBeTruthy();
    // The HSC outcomes are shown to a Year 11 READER (the lenient filter), but
    // they are not Year 11 outcomes and must not be sitting in the editor —
    // saving them here is what would retag the lot.
    expect(screen.queryByDisplayValue('BI-12-01')).toBeNull();
    expect(screen.queryByDisplayValue('BI-12-02')).toBeNull();
    // An empty year opens on one blank row, ready to type into.
    expect(screen.getByPlaceholderText('e.g., SE-11-01')).toHaveProperty('value', '');
  });

  it('shows the HSC outcomes when Year 12 is the year on screen', () => {
    openEditor('year12', () => {});

    expect(screen.getByText('Edit Year 12 Outcomes')).toBeTruthy();
    expect(screen.getByDisplayValue('BI-12-01')).toBeTruthy();
    expect(screen.getByDisplayValue('BI-12-02')).toBeTruthy();
  });

  it('adds a Year 11 outcome without disturbing Year 12', () => {
    const saved: CourseOutcome[][] = [];
    openEditor('year11', (o) => saved.push(o));

    // The empty course starts with one blank row; fill it in.
    fireEvent.change(screen.getByPlaceholderText('e.g., SE-11-01'), {
      target: { value: 'BI-11-01' },
    });
    fireEvent.change(screen.getByPlaceholderText('Outcome description...'), {
      target: { value: 'Prelim one' },
    });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(saved).toHaveLength(1);
    // What the save handler then does with it — the other half of the defect.
    const merged = replaceOutcomesForYear(course.outcomes, 'year11', saved[0]);
    expect(merged.map((o) => o.code)).toEqual(['BI-12-01', 'BI-12-02', 'BI-11-01']);
    expect(merged.find((o) => o.code === 'BI-11-01')?.year).toBe('year11');
  });

  it('points a curator at the right codes for the year they are in', () => {
    // NESA puts the year inside the code. A Year 11 editor showing SE-12-01 as
    // its example is an invitation to paste the wrong syllabus.
    const pasteBox = () => screen.getByPlaceholderText(/Describes methods used to plan/);

    const { unmount } = openEditor('year11', () => {});
    expect(screen.getByPlaceholderText('e.g., SE-11-01')).toBeTruthy();
    expect(pasteBox().getAttribute('placeholder')).toContain('SE-11-01');
    unmount();

    openEditor('year12', () => {});
    // Two rows here, so two code inputs carrying the same example.
    expect(screen.getAllByPlaceholderText('e.g., SE-12-01')).toHaveLength(2);
    expect(pasteBox().getAttribute('placeholder')).toContain('SE-12-01');
  });
});
