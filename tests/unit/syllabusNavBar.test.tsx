import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import SyllabusNavBar from '../../components/SyllabusNavBar';
import type { Prompt } from '../../types';

/**
 * The collapsed bar's right-hand cluster drops the marks and band below `xl`,
 * because the path needs the width and the Writing Prompt card repeats both.
 * Their words are kept in the verb chip's title so nothing is lost on hover.
 */

beforeAll(() => {
  // jsdom has no layout; the breadcrumb scrolls its list on mount.
  Element.prototype.scrollTo = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
});

const prompt = (totalMarks: number): Prompt =>
  ({ id: 'q1', question: 'Describe the role of the peace conference.', totalMarks, verb: 'DESCRIBE' }) as Prompt;

const crumbs = [
  { label: 'Modern History', onClick: vi.fn() },
  { label: 'Democracy and dictatorship 1919–1939', onClick: vi.fn() },
  { label: 'Context', onClick: vi.fn() },
  { label: 'The Paris Peace Conference and its consequences' },
];

const renderBar = (totalMarks: number) =>
  render(
    <SyllabusNavBar crumbs={crumbs} prompt={prompt(totalMarks)} onExpand={vi.fn()} />
  );

describe('the syllabus nav bar', () => {
  it('puts the marks and band into the verb chip title', () => {
    renderBar(3);

    const chip = screen.getByText('DESCRIBE');
    expect(chip.getAttribute('title')).toMatch(/^DESCRIBE · 3 marks · Band \d+$/);
  });

  it('keeps the visible marks and band in the DOM for the wide layout', () => {
    renderBar(3);

    expect(screen.getByText('3 marks')).toBeTruthy();
    expect(screen.getByText(/^Band \d+$/)).toBeTruthy();
  });

  it('says "1 mark" in the singular, both visibly and in the title', () => {
    renderBar(1);

    expect(screen.getByText('1 mark')).toBeTruthy();
    expect(screen.queryByText('1 marks')).toBeNull();
    expect(screen.getByText('DESCRIBE').getAttribute('title')).toMatch(
      /^DESCRIBE · 1 mark · Band \d+$/
    );
  });

  it('hides the marks and band below xl, and never hides the path', () => {
    const { container } = renderBar(3);

    const group = screen.getByText('3 marks').parentElement as HTMLElement;
    expect(group.className).toContain('hidden');
    expect(group.className).toContain('xl:flex');
    expect(group.className).not.toContain('md:flex');
    expect(container.querySelector('nav[aria-label="Syllabus path"]')).not.toBeNull();
  });
});
