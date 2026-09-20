import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import SyllabusImportModal from '../../components/SyllabusImportModal';

/**
 * The topic tabs on the import screen, as a keyboard reaches them.
 *
 * The row was a `<div onClick>` holding a delete `<button>` — no tab stop, no
 * role, no key handler — so a teacher pasting several topics could only switch
 * between them with a mouse. A `<button>` could not simply wrap the row
 * either, because a button may not contain another one; the row is a plain
 * container now and each of the two things you can do to it is its own button.
 *
 * The delete control had a second problem: `text-transparent` until the row
 * was hovered, so a keyboard user could tab onto a control they could not see,
 * and every one of them announced the same "Remove Topic".
 */

vi.mock('../../services/geminiService', () => ({
  parseOutcomesFromText: vi.fn(),
  parseSyllabusStructure: vi.fn(),
  fetchSyllabusContentFromUrl: vi.fn(),
  splitSyllabusIntoTopics: vi.fn(),
}));

afterEach(cleanup);

/** Open the modal and add a second topic, which is when tabs become a choice. */
const withTwoTopics = async () => {
  render(
    <SyllabusImportModal
      isOpen
      onClose={vi.fn()}
      courses={[]}
      onImport={vi.fn()}
      defaultYear="year12"
    />
  );
  fireEvent.click(screen.getByRole('button', { name: /Add Topic/ }));
  await waitFor(() => expect(screen.getByRole('button', { name: /^2\s*Topic 2$/ })).toBeTruthy());
};

describe('switching between topics being pasted', () => {
  it('offers each topic as a button a keyboard can reach', async () => {
    await withTwoTopics();
    expect(screen.getByRole('button', { name: /^1\s*Topic 1$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^2\s*Topic 2$/ })).toBeTruthy();
  });

  it('marks which one is active, rather than leaving it to colour', async () => {
    await withTwoTopics();
    // Adding a topic moves to it (handleAddTab sets the active id), so the new
    // one is current and the first is not.
    expect(screen.getByRole('button', { name: /^2\s*Topic 2$/ }).getAttribute('aria-current')).toBe(
      'true'
    );
    expect(
      screen.getByRole('button', { name: /^1\s*Topic 1$/ }).getAttribute('aria-current')
    ).toBeNull();

    // Activating the other one moves it back — the whole point of the fix,
    // since this was previously reachable only with a mouse.
    fireEvent.click(screen.getByRole('button', { name: /^1\s*Topic 1$/ }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /^1\s*Topic 1$/ }).getAttribute('aria-current')
      ).toBe('true')
    );
    expect(
      screen.getByRole('button', { name: /^2\s*Topic 2$/ }).getAttribute('aria-current')
    ).toBeNull();
  });

  it('names what each delete button removes', async () => {
    // They all read "Remove Topic" before, so a screen reader announced a list
    // of identical controls with no way to tell which row was which.
    await withTwoTopics();
    expect(screen.getByRole('button', { name: /^Remove Topic 1$/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Remove Topic 2$/ })).toBeTruthy();
  });
});
