import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ContentAuditModal, { estimateRemaining } from '../../components/admin/ContentAuditModal';
import type { Course } from '../../types';

/**
 * The tree has said `role="tree"` since it was built, which is a promise about
 * arrow keys. Nothing kept it, and the DOM underneath was worse than silent:
 * two buttons per row meant Tab walked a keyboard user through three thousand
 * stops to cross the shipped library, with no other way in.
 */

const fixture: Course[] = [
  {
    id: 'c1',
    name: 'HSC Biology',
    outcomes: [{ code: 'BI-1', description: 'An outcome' }],
    topics: [
      {
        id: 't1',
        name: 'Heredity',
        subTopics: [
          {
            id: 'st1',
            name: 'DNA',
            dotPoints: [
              {
                id: 'dp1',
                description: 'explain replication',
                prompts: [
                  {
                    id: 'pr1',
                    question: 'Explain DNA replication.',
                    totalMarks: 4,
                    verb: 'Explain',
                    linkedOutcomes: ['BI-1'],
                    keywords: [],
                    sampleAnswers: [],
                  },
                ],
              },
            ],
          },
        ],
      },
      { id: 't2', name: 'Genetics', subTopics: [] },
    ],
  },
] as unknown as Course[];

const renderStudio = () =>
  render(
    <ContentAuditModal
      isOpen={true}
      onClose={vi.fn()}
      courses={fixture}
      updateCourses={vi.fn()}
      showToast={vi.fn()}
    />
  );

/** The one row Tab can reach — the tree's single stop. */
const tabbable = () =>
  document.querySelector('[role="treeitem"][tabindex="0"]')?.getAttribute('aria-label');

const press = (key: string, init: object = {}) =>
  fireEvent.keyDown(screen.getByRole('tree'), { key, ...init });

afterEach(cleanup);

describe('the audit tree as a keyboard widget', () => {
  it('is one tab stop, not two per row', () => {
    renderStudio();

    // Exactly one row is reachable by Tab, and every control inside the rows
    // is out of the tab order — the arrow keys reach them instead.
    expect(document.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1);
    const rowButtons = Array.from(
      document.querySelectorAll<HTMLElement>('[role="treeitem"] button')
    );
    expect(rowButtons.length).toBeGreaterThan(4);
    expect(rowButtons.every((b) => b.getAttribute('tabindex') === '-1')).toBe(true);
  });

  it('moves down and up the rows that are actually on screen', () => {
    renderStudio();
    expect(tabbable()).toBe('Science');

    press('ArrowDown');
    expect(tabbable()).toBe('HSC Biology');
    press('ArrowDown');
    expect(tabbable()).toBe('Heredity');
    press('ArrowUp');
    expect(tabbable()).toBe('HSC Biology');
  });

  it('takes Home and End to the ends of the visible tree', () => {
    renderStudio();
    press('End');
    // The last row on screen with the tree opened to courses: the second topic.
    expect(tabbable()).toBe('Genetics');
    press('Home');
    expect(tabbable()).toBe('Science');
  });

  it('opens a branch with Right and folds it with Left', () => {
    renderStudio();
    press('ArrowDown');
    press('ArrowDown'); // on "Heredity", which is collapsed
    expect(screen.queryByText('DNA')).toBeNull();

    press('ArrowRight');
    expect(screen.getByText('DNA')).toBeTruthy();

    press('ArrowLeft');
    expect(screen.queryByText('DNA')).toBeNull();
  });

  it('takes Left out to the parent when there is nothing left to fold', () => {
    renderStudio();
    press('ArrowDown');
    press('ArrowDown'); // "Heredity", collapsed
    press('ArrowLeft');
    expect(tabbable()).toBe('HSC Biology');
  });

  it('ticks the active row with Space, and extends with Shift+Space', () => {
    renderStudio();
    press('ArrowDown'); // the course
    press(' ');
    // The course, its two topics, and the sub-topic, dot point and question
    // under the first of them.
    expect(screen.getByRole('button', { name: /clear selection \(6\)/i })).toBeTruthy();

    // Nothing is lost by extending into rows already taken.
    press('ArrowDown');
    press(' ', { shiftKey: true });
    expect(screen.getByRole('button', { name: /clear selection \(6\)/i })).toBeTruthy();
  });
});

describe('a control inside a row keeps its own keys', () => {
  it('does not tick the row when Enter is pressed on one of its buttons', () => {
    renderStudio();
    press('ArrowDown'); // the course row
    const button = document.querySelector<HTMLElement>('[role="treeitem"] button');
    expect(button).toBeTruthy();

    // A row's buttons are out of the tab order, but a click still focuses them,
    // and this handler sits on the tree. Without the guard, Enter meant for
    // "run this again" was swallowed here and flipped the row's tick instead.
    fireEvent.keyDown(button!, { key: 'Enter' });
    expect(screen.queryByRole('button', { name: /clear selection/i })).toBeNull();
  });
});

describe('estimateRemaining', () => {
  it('says nothing until two tasks have finished', () => {
    // One sample is not an average, and a figure that swings between wild
    // numbers on every update is worse than no figure.
    expect(estimateRemaining(1000, 0, 100)).toBeNull();
    expect(estimateRemaining(1000, 1, 100)).toBeNull();
    expect(estimateRemaining(1000, 2, 100)).not.toBeNull();
  });

  it('says nothing once there is nothing left', () => {
    expect(estimateRemaining(10000, 10, 10)).toBeNull();
  });

  it('reads in seconds under a minute and a half, and in minutes above it', () => {
    // 2 done in 2s → 1s each; 40 left → ~40s.
    expect(estimateRemaining(2000, 2, 42)).toBe('~40s left');
    // 2 done in 4s → 2s each; 100 left → 200s → ~3 min.
    expect(estimateRemaining(4000, 2, 102)).toBe('~3 min left');
  });
});
