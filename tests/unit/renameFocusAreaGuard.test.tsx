import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RenameModal from '../../components/RenameModal';
import { parseSubItemsFromDescription } from '../../utils/dataManagerUtils';

/**
 * A dot point's focus areas are read from its wording, and generated questions
 * are narrowed to them — so editing the wording quietly changes what the app
 * writes questions about. The rename dialog has to say so, and let the teacher
 * keep what they had.
 */
afterEach(cleanup);

const DESCRIPTION = 'investigate data structures including arrays, records and trees';

const renderRename = (over: Partial<React.ComponentProps<typeof RenameModal>> = {}) => {
  const onRename = vi.fn();
  const onKeep = vi.fn();
  render(
    <RenameModal
      isOpen
      onClose={vi.fn()}
      onRename={onRename}
      targetType="Dot point"
      initialName={DESCRIPTION}
      focusAreaGuard={{
        current: parseSubItemsFromDescription(DESCRIPTION),
        previewFor: parseSubItemsFromDescription,
        isOverridden: false,
        onKeep,
      }}
      {...over}
    />
  );
  return { onRename, onKeep };
};

const retype = (value: string) =>
  fireEvent.change(screen.getByLabelText('New Name'), { target: { value } });

describe('rename guards a dot point’s focus areas', () => {
  it('says nothing while the wording still yields the same focus areas', () => {
    renderRename();
    expect(screen.queryByText(/This changes the focus areas/)).toBeNull();

    // Editing the verb leaves the "including …" list untouched, so no warning.
    retype('explore data structures including arrays, records and trees');
    expect(screen.queryByText(/This changes the focus areas/)).toBeNull();
  });

  it('warns, and shows before and after, when the rename would change them', () => {
    renderRename();

    retype('investigate data structures including arrays and hash tables');

    expect(screen.getByText(/This changes the focus areas/)).toBeTruthy();
    expect(screen.getByText(/hash tables/)).toBeTruthy();
  });

  it('pins the current focus areas before renaming, by default', () => {
    const { onRename, onKeep } = renderRename();

    retype('investigate data structures including arrays and hash tables');
    fireEvent.click(screen.getByText('Save Changes'));

    expect(onKeep).toHaveBeenCalledWith(parseSubItemsFromDescription(DESCRIPTION));
    expect(onRename).toHaveBeenCalledWith('investigate data structures including arrays and hash tables');
  });

  it('lets the teacher accept the new reading instead', () => {
    const { onRename, onKeep } = renderRename();

    retype('investigate data structures including arrays and hash tables');
    fireEvent.click(screen.getByText(/Keep the focus areas I have now/));
    fireEvent.click(screen.getByText('Save Changes'));

    expect(onKeep).not.toHaveBeenCalled();
    expect(onRename).toHaveBeenCalled();
  });

  it('stays silent when the focus areas are already hand-set', () => {
    // A hand-set list is immune to the rename, so there is nothing to warn about.
    renderRename({
      focusAreaGuard: {
        current: ['arrays', 'records and trees'],
        previewFor: parseSubItemsFromDescription,
        isOverridden: true,
        onKeep: vi.fn(),
      },
    });

    retype('something completely different');
    expect(screen.queryByText(/This changes the focus areas/)).toBeNull();
  });

  it('does not appear at all for other item types', () => {
    render(
      <RenameModal
        isOpen
        onClose={vi.fn()}
        onRename={vi.fn()}
        targetType="Topic"
        initialName="Programming Fundamentals"
      />
    );

    retype('Software Engineering including design and testing');
    expect(screen.queryByText(/This changes the focus areas/)).toBeNull();
  });
});
