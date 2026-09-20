import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import ManifestImportModal from '../../components/ManifestImportModal';
import type { DiscoveredDoc } from '../../hooks/useSyllabusData';

/**
 * Choosing what to import, from a keyboard.
 *
 * The chooser was a grid of `<div onClick>` cards with a decorative circle for
 * a tick — no checkbox, no tab stop, no role, no key handler. Picking
 * syllabuses is the only thing this screen does, so for a keyboard or
 * screen-reader user it could not be completed at all. The cards also could
 * not simply become buttons: each carries a `<select>` for the subject area,
 * and a button may not contain interactive content.
 *
 * It is a list of real checkboxes now, so the keyboard route is the platform's
 * rather than something re-implemented on a div.
 */

const doc = (over: Partial<DiscoveredDoc> & { id: string; name: string }): DiscoveredDoc =>
  ({
    source: 'manifest.json',
    subject: 'Science',
    type: 'course',
    data: {},
    selected: false,
    ...over,
  }) as DiscoveredDoc;

const docs: DiscoveredDoc[] = [
  doc({ id: 'a', name: 'HSC Biology (Advanced)' }),
  doc({ id: 'b', name: 'HSC Chemistry (Advanced)' }),
  doc({ id: 'c', name: 'Heredity', type: 'topic', targetCourseName: 'HSC Biology' }),
  doc({ id: 'd', name: 'Orphan Topic', type: 'topic' }),
];

const open = (onImport = vi.fn(async (_docs: DiscoveredDoc[]) => true)) => {
  render(
    <ManifestImportModal isOpen onClose={vi.fn()} discoveredDocs={docs} onImport={onImport} />
  );
  return onImport;
};

afterEach(cleanup);

describe('picking syllabuses', () => {
  it('offers a real checkbox for each one, named after it', () => {
    open();
    expect(screen.getByRole('checkbox', { name: /HSC Biology \(Advanced\)/ })).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: /HSC Chemistry \(Advanced\)/ })).toBeTruthy();
  });

  it('ticks and unticks from the keyboard route', () => {
    open();
    const bio = screen.getByRole('checkbox', {
      name: /HSC Biology \(Advanced\)/,
    }) as HTMLInputElement;
    const before = bio.checked;
    fireEvent.click(bio);
    expect(bio.checked).toBe(!before);
    fireEvent.click(bio);
    expect(bio.checked).toBe(before);
  });

  it('imports exactly what is ticked', async () => {
    const onImport = open();
    // Start from nothing ticked, then tick one.
    for (const box of screen.getAllByRole('checkbox') as HTMLInputElement[]) {
      if (box.checked) fireEvent.click(box);
    }
    fireEvent.click(screen.getByRole('checkbox', { name: /HSC Chemistry \(Advanced\)/ }));
    fireEvent.click(screen.getByRole('button', { name: /Add 1 syllabus/ }));
    await waitFor(() => expect(onImport).toHaveBeenCalledTimes(1));
    expect(onImport.mock.calls[0][0].map((d) => d.id)).toEqual(['b']);
  });

  it('gives each subject picker a name, rather than four identical ones', () => {
    open();
    expect(screen.getByLabelText('Subject area for HSC Biology (Advanced)')).toBeTruthy();
    expect(screen.getByLabelText('Subject area for Heredity')).toBeTruthy();
  });

  it('says what a topic attaches to, and warns when it has nowhere to go', () => {
    open();
    // A pill reading "Target HSC Biology" said this before — a label and a
    // value with no verb, at the same weight as a pill naming a file format.
    expect(screen.getByText(/adds to HSC Biology/)).toBeTruthy();
    expect(screen.getByText(/nowhere to go/i)).toBeTruthy();
  });

  it('gives a heading only to a faculty with something to tick', () => {
    // Every doc in this fixture is Science, so seven of the eight faculties
    // are empty. Each still wore a full section — coloured icon tile, a 20px
    // black heading, "0 available" and an empty bordered list — for the sole
    // purpose of saying the app does not carry it yet. On the shipped
    // manifest those took 41% of the list's scroll height.
    open();
    expect(screen.getByRole('heading', { name: 'Science' })).toBeTruthy();
    for (const empty of ['English', 'Mathematics', 'HSIE', 'Creative Arts', 'PDHPE']) {
      expect(screen.queryByRole('heading', { name: empty })).toBeNull();
    }
  });

  it('still names everything the app does not carry yet', () => {
    // Dropping the empty sections must not drop what they said. The names
    // move to one closing block — a teacher wants to know whether Drama is
    // coming; they just do not need it laid out like something to tick.
    open();
    expect(screen.getByText('Not carried yet')).toBeTruthy();
    expect(screen.getByText('Visual Arts, Music 1, Drama')).toBeTruthy();
    expect(screen.getByText('English Extension 1, English Extension 2')).toBeTruthy();
    // Science has docs AND names it does not carry; both still show.
    expect(screen.getByText('Physics, Earth and Environmental Science')).toBeTruthy();
  });

  it('counts what is ticked in the button, in the reader’s words', () => {
    open();
    // "Import 3 Items" named a database operation on a count of records.
    for (const box of screen.getAllByRole('checkbox') as HTMLInputElement[]) {
      if (box.checked) fireEvent.click(box);
    }
    expect(screen.getByRole('button', { name: /Add 0 syllabuses/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /HSC Biology \(Advanced\)/ }));
    expect(screen.getByRole('button', { name: /Add 1 syllabus$/ })).toBeTruthy();
  });
});
