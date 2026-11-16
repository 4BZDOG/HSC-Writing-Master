import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor, within } from '@testing-library/react';
import CourseLibraryModal from '../../components/CourseLibraryModal';
import type { ShippedCourseOffer } from '../../utils/shippedCatalogue';
import type { Course } from '../../types';

/**
 * The course library: every shipped course a library does not hold, by faculty,
 * to add at any time — the way back to a course left unticked at first run.
 */

const withQuestions = (id: string, name: string, n: number): Course =>
  ({
    id,
    name,
    outcomes: [],
    topics: [
      {
        id: `${id}-t`,
        name: 'Topic',
        subTopics: [
          {
            id: `${id}-st`,
            name: 'Sub-topic',
            dotPoints: [
              {
                id: `${id}-dp`,
                description: 'Dot point',
                prompts: Array.from({ length: n }, (_, i) => ({ id: `${id}-p${i}` })),
              },
            ],
          },
        ],
      },
    ],
  }) as unknown as Course;

const offer = (id: string, name: string, subject: string, questions = 3): ShippedCourseOffer => ({
  id,
  name,
  subject,
  source: `${name}.json`,
  course: withQuestions(id, name, questions),
});

const CATALOGUE = [
  offer('bio', 'Biology', 'Science'),
  offer('chem', 'Chemistry', 'Science'),
  offer('hms', 'Health and Movement Science', 'PDHPE', 138),
  offer('va', 'Visual Arts', 'Creative Arts', 0),
];

const open = ({
  courses = [] as Course[],
  loadCatalogue = vi.fn(async () => CATALOGUE),
  onAdd = vi.fn((offers: ShippedCourseOffer[]) => offers.map((o) => o.id)),
  onClose = vi.fn(),
} = {}) => {
  render(
    <CourseLibraryModal
      isOpen
      onClose={onClose}
      courses={courses}
      loadCatalogue={loadCatalogue}
      onAdd={onAdd}
    />
  );
  return { loadCatalogue, onAdd, onClose };
};

afterEach(cleanup);

describe('the course library', () => {
  it('lists every shipped course the library lacks, under its faculty', async () => {
    open({ courses: [{ id: 'chem', name: 'Chemistry', outcomes: [], topics: [] }] });
    await screen.findByRole('checkbox', { name: /Biology/ });
    expect(screen.queryByRole('checkbox', { name: /Chemistry/ })).toBeNull();

    const science = screen.getByRole('region', { name: 'Science' });
    expect(within(science).getByRole('checkbox', { name: /Biology/ })).toBeTruthy();
    const pdhpe = screen.getByRole('region', { name: 'PDHPE' });
    expect(
      within(pdhpe).getByRole('checkbox', { name: /Health and Movement Science/ })
    ).toBeTruthy();
    // Faculties in the course picker's order: Creative Arts, PDHPE, Science.
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Creative Arts',
      'PDHPE',
      'Science',
    ]);
  });

  it('says how many questions each course has, and which ship as structure only', async () => {
    open();
    expect(await screen.findByText('138 questions')).toBeTruthy();
    expect(screen.getByText('Structure only, no questions yet')).toBeTruthy();
  });

  it('adds the ticked courses and closes', async () => {
    const { onAdd, onClose } = open();
    fireEvent.click(await screen.findByRole('checkbox', { name: /Biology/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Visual Arts/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Add 2 courses' }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0][0].map((o: ShippedCourseOffer) => o.id)).toEqual(['bio', 'va']);
    expect(onClose).toHaveBeenCalled();
  });

  it('cannot add with nothing ticked', async () => {
    const { onAdd } = open();
    await screen.findByRole('checkbox', { name: /Biology/ });
    const add = screen.getByRole('button', { name: 'Add courses' }) as HTMLButtonElement;
    expect(add.disabled).toBe(true);
    fireEvent.click(add);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('says so when every shipped course is already in the library', async () => {
    open({ courses: CATALOGUE.map((o) => o.course) });
    expect(await screen.findByText(/already in your library/)).toBeTruthy();
  });

  it('offers a retry when the catalogue cannot be read', async () => {
    const loadCatalogue = vi
      .fn<() => Promise<ShippedCourseOffer[]>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(CATALOGUE);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    open({ loadCatalogue });
    expect((await screen.findByRole('alert')).textContent).toMatch(/could not be read/);
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }));
    await waitFor(() => expect(screen.getByRole('checkbox', { name: /Biology/ })).toBeTruthy());
    expect(loadCatalogue).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });

  it('searches once the list is long enough to need it', async () => {
    const many = Array.from({ length: 8 }, (_, i) => offer(`c${i}`, `Course ${i}`, 'HSIE'));
    open({ loadCatalogue: vi.fn(async () => [...many, offer('bio', 'Biology', 'Science')]) });
    const search = await screen.findByRole('searchbox', { name: /Search the course library/ });
    fireEvent.change(search, { target: { value: 'bio' } });
    expect(screen.getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.change(search, { target: { value: 'drama' } });
    expect(screen.getByText(/No course in the library matches/)).toBeTruthy();
  });
});
