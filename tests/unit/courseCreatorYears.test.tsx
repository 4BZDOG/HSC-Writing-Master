import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import CourseCreatorModal from '../../components/CourseCreatorModal';
import type { CourseOutcome } from '../../types';

/**
 * A course is created with both years' outcomes, or with neither.
 *
 * NESA writes a separate set per year, and the year control in the navigator
 * cannot be reached on a course that has no content yet — so a teacher defining
 * "HSC Physics" here had no way to enter the Year 11 outcomes at all without
 * first creating a Year 11 topic to make the year selectable. The tabs are that
 * way in.
 */

afterEach(cleanup);

const openCreator = (onCourseCreated: (name: string, outcomes: CourseOutcome[]) => void) =>
  render(
    <CourseCreatorModal isOpen onClose={vi.fn()} onCourseCreated={onCourseCreated} />
  );

const fillRow = (code: string, description: string) => {
  fireEvent.change(screen.getByPlaceholderText(/^e\.g\. SE-\d\d-01$/), {
    target: { value: code },
  });
  fireEvent.change(screen.getByPlaceholderText('Outcome description...'), {
    target: { value: description },
  });
};

describe('creating a course with two years of outcomes', () => {
  it('keeps each year’s rows apart and tags only Year 11', () => {
    const created: { name: string; outcomes: CourseOutcome[] }[] = [];
    openCreator((name, outcomes) => created.push({ name, outcomes }));

    fireEvent.change(screen.getByLabelText('Course Name'), { target: { value: 'HSC Physics' } });

    // Year 12 is the tab on open — it is what creating a course usually means.
    expect(screen.getByRole('tab', { name: /Year 12/ })).toHaveProperty('ariaSelected', 'true');
    fillRow('PH-12-01', 'HSC one');

    fireEvent.click(screen.getByRole('tab', { name: /Year 11/ }));
    // Switching tabs must not carry the other year's rows across.
    expect(screen.queryByDisplayValue('PH-12-01')).toBeNull();
    fillRow('PH-11-01', 'Prelim one');

    fireEvent.click(screen.getByRole('button', { name: 'Create Course' }));

    expect(created).toHaveLength(1);
    expect(created[0].outcomes).toEqual([
      // Year 12 stays spelled as the absence of a year, as everywhere else.
      { code: 'PH-12-01', description: 'HSC one' },
      { code: 'PH-11-01', description: 'Prelim one', year: 'year11' },
    ]);
  });

  it('counts both years in the section header, so collapsing it does not read as lost work', () => {
    openCreator(vi.fn());

    fireEvent.change(screen.getByLabelText('Course Name'), { target: { value: 'HSC Physics' } });
    fillRow('PH-12-01', 'HSC one');
    fireEvent.click(screen.getByRole('tab', { name: /Year 11/ }));
    fillRow('PH-11-01', 'Prelim one');

    expect(screen.getByText('2 added')).toBeTruthy();
  });

  it('follows the year in the code example, because NESA puts it inside the code', () => {
    openCreator(vi.fn());
    expect(screen.getByPlaceholderText('e.g. SE-12-01')).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /Year 11/ }));
    expect(screen.getByPlaceholderText('e.g. SE-11-01')).toBeTruthy();
  });

  it('flags a repeated code and leaves it out of the course', () => {
    const created: CourseOutcome[][] = [];
    openCreator((_name, outcomes) => created.push(outcomes));

    fireEvent.change(screen.getByLabelText('Course Name'), { target: { value: 'HSC Physics' } });
    fillRow('PH-12-01', 'HSC one');
    fireEvent.click(screen.getByRole('button', { name: /Add Year 12 Outcome/ }));

    const codes = screen.getAllByPlaceholderText('e.g. SE-12-01');
    fireEvent.change(codes[1], { target: { value: 'PH-12-01' } });
    fireEvent.change(screen.getAllByPlaceholderText('Outcome description...')[1], {
      target: { value: 'A second row with the same code' },
    });

    // Said on the row, because a question links to an outcome by code and two
    // rows sharing one make the link ambiguous.
    expect(screen.getByText(/already listed above/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Create Course' }));
    expect(created[0]).toEqual([{ code: 'PH-12-01', description: 'HSC one' }]);
  });

  it('creates a course with no outcomes at all when neither tab is filled', () => {
    const created: CourseOutcome[][] = [];
    openCreator((_name, outcomes) => created.push(outcomes));

    fireEvent.change(screen.getByLabelText('Course Name'), { target: { value: 'Bare Course' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create Course' }));

    // A blank row on each tab is not an outcome.
    expect(created[0]).toEqual([]);
  });
});
