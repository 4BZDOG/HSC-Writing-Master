import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FocusAreaEditorModal from '../../components/FocusAreaEditorModal';
import { getFocusAreas, parseSubItemsFromDescription } from '../../utils/dataManagerUtils';
import type { DotPoint } from '../../types';

/**
 * `parseSubItemsFromDescription` is a heuristic over syllabus prose, so it
 * sometimes splits a single named concept in two or finds nothing at all. A
 * teacher's hand-set list has to win over it everywhere — and "no focus areas"
 * has to be something they can actually say.
 */
afterEach(cleanup);

const dotPoint = (over: Partial<DotPoint> = {}): DotPoint =>
  ({
    id: 'dp1',
    description: 'investigate data structures including arrays, records and trees',
    prompts: [],
    ...over,
  }) as DotPoint;

describe('getFocusAreas', () => {
  it('parses the description when nothing has been set by hand', () => {
    const dp = dotPoint();
    expect(getFocusAreas(dp)).toEqual(parseSubItemsFromDescription(dp.description));
    expect(getFocusAreas(dp).length).toBeGreaterThan(0);
  });

  it('prefers the hand-set list over the parser', () => {
    const dp = dotPoint({ focusAreas: ['arrays', 'records and trees'] });
    expect(getFocusAreas(dp)).toEqual(['arrays', 'records and trees']);
  });

  it('treats an empty hand-set list as "this dot point has none"', () => {
    // Not the same as "no override" — this is how a teacher silences a bad parse.
    expect(getFocusAreas(dotPoint({ focusAreas: [] }))).toEqual([]);
  });

  it('is safe on a missing dot point', () => {
    expect(getFocusAreas(undefined)).toEqual([]);
  });
});

describe('FocusAreaEditorModal', () => {
  const renderEditor = (props: Partial<React.ComponentProps<typeof FocusAreaEditorModal>> = {}) => {
    const onSave = vi.fn();
    const onReset = vi.fn();
    render(
      <FocusAreaEditorModal
        isOpen
        onClose={vi.fn()}
        description={dotPoint().description}
        focusAreas={['arrays', 'records', 'trees']}
        isOverridden={false}
        onSave={onSave}
        onReset={onReset}
        {...props}
      />
    );
    return { onSave, onReset };
  };

  it('saves an edited list', () => {
    const { onSave } = renderEditor();

    fireEvent.change(screen.getByLabelText('Focus area 2'), {
      target: { value: 'records and trees' },
    });
    fireEvent.click(screen.getByLabelText('Remove "trees"'));
    fireEvent.click(screen.getByText('Save Focus Areas'));

    expect(onSave).toHaveBeenCalledWith(['arrays', 'records and trees']);
  });

  it('adds a focus area the parser missed', () => {
    const { onSave } = renderEditor({ focusAreas: [] });

    fireEvent.change(screen.getByPlaceholderText('Add a focus area…'), {
      target: { value: 'linked lists' },
    });
    fireEvent.click(screen.getByText('Add'));
    fireEvent.click(screen.getByText('Save Focus Areas'));

    expect(onSave).toHaveBeenCalledWith(['linked lists']);
  });

  it('lets a teacher save an empty list to silence a bad parse', () => {
    const { onSave } = renderEditor({ focusAreas: ['arrays'] });

    fireEvent.click(screen.getByLabelText('Remove "arrays"'));
    expect(screen.getByText(/No focus areas/)).toBeTruthy();
    fireEvent.click(screen.getByText('Save Focus Areas'));

    expect(onSave).toHaveBeenCalledWith([]);
  });

  it('only offers "reset to automatic" when there is an override to drop', () => {
    renderEditor({ isOverridden: false });
    expect(screen.getByText(/Reset to automatic/).closest('button')?.disabled).toBe(true);

    cleanup();
    const { onReset } = renderEditor({ isOverridden: true });
    fireEvent.click(screen.getByText(/Reset to automatic/));
    expect(onReset).toHaveBeenCalled();
  });
});
