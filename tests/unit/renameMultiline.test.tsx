import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RenameModal from '../../components/RenameModal';
import { parseSubItemsFromDescription } from '../../utils/dataManagerUtils';

/**
 * Editing a dot point has to survive the shape a dot point is actually written
 * in: a statement, an "Including:" lead-in, and a bulleted list underneath.
 *
 * A single-line `<input>` cannot hold that — the browser's value sanitiser
 * strips CR/LF — so a teacher who changed one word silently flattened the whole
 * dot point and the edit did not come back looking like what they typed.
 */
afterEach(cleanup);

const DOT_POINT = [
  'Influences on the global economic activity',
  'Including:',
  '   * biophysical',
  '   * economic',
  '   * technological',
  '   * political/organisational',
].join('\n');

const renderRename = (over: Partial<React.ComponentProps<typeof RenameModal>> = {}) => {
  const onRename = vi.fn();
  const onKeep = vi.fn();
  render(
    <RenameModal
      isOpen
      onClose={vi.fn()}
      onRename={onRename}
      targetType="Dot point"
      initialName={DOT_POINT}
      multiline
      focusAreaGuard={{
        current: parseSubItemsFromDescription(DOT_POINT),
        previewFor: parseSubItemsFromDescription,
        isOverridden: false,
        onKeep,
      }}
      {...over}
    />
  );
  return { onRename, onKeep, field: screen.getByLabelText('New Name') };
};

describe('renaming a multi-line dot point', () => {
  it('edits in a textarea, not a single-line input', () => {
    const { field } = renderRename();
    expect(field.tagName).toBe('TEXTAREA');
  });

  it('opens on the dot point verbatim, newlines and all', () => {
    const { field } = renderRename();
    expect((field as HTMLTextAreaElement).value).toBe(DOT_POINT);
  });

  it('saves the edited wording with its line structure intact', () => {
    const { onRename, field } = renderRename();

    const edited = DOT_POINT.replace('Influences on', 'Influences upon');
    fireEvent.change(field, { target: { value: edited } });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(onRename).toHaveBeenCalledWith(edited);
    expect(onRename.mock.calls[0][0].split('\n')).toHaveLength(6);
  });

  it('lets a teacher move the list off the statement without losing the focus areas', () => {
    // The point of the exercise: trim the dot point down to its statement and
    // keep the four focus areas, which then live only in the Active Focus menu.
    const { onRename, onKeep, field } = renderRename();

    fireEvent.change(field, { target: { value: 'Influences on the global economic activity' } });
    fireEvent.click(screen.getByText('Save Changes'));

    expect(onKeep).toHaveBeenCalledWith([
      'biophysical',
      'economic',
      'technological',
      'political/organisational',
    ]);
    expect(onRename).toHaveBeenCalledWith('Influences on the global economic activity');
  });

  it('saves on Cmd/Ctrl+Enter, since plain Enter is how the list gets its lines', () => {
    const { onRename, field } = renderRename();

    fireEvent.keyDown(field, { key: 'Enter' });
    expect(onRename).not.toHaveBeenCalled();

    fireEvent.keyDown(field, { key: 'Enter', ctrlKey: true });
    expect(onRename).toHaveBeenCalledWith(DOT_POINT);
  });

  it('still uses a single-line input for a course or topic', () => {
    render(
      <RenameModal
        isOpen
        onClose={vi.fn()}
        onRename={vi.fn()}
        targetType="Topic"
        initialName="Programming Fundamentals"
      />
    );
    expect(screen.getByLabelText('New Name').tagName).toBe('INPUT');
  });
});
