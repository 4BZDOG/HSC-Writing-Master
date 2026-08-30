import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import ReadinessMeter from '../../components/ReadinessMeter';
import type { ReadinessResult } from '../../utils/draftReadiness';

afterEach(cleanup);

const result = (over: Partial<ReadinessResult>): ReadinessResult => {
  const base = {
    score: 0,
    level: 0 as ReadinessResult['level'],
    isNeutral: true,
    label: 'Start writing',
    subscores: { length: 0, structure: 0, keywords: 0, variety: 0 },
    ...over,
  };
  // Colour follows chromaLevel; default it to the (uncapped) level unless a
  // test overrides it to exercise the target-band colour cap.
  return { chromaLevel: over.chromaLevel ?? base.level, ...base };
};

// The progressbar's inner fill div is the element the band gradient lands on.
const fillOf = (bar: HTMLElement): Element => bar.firstElementChild as Element;

describe('ReadinessMeter', () => {
  it('shows the percentage and the completeness label for a mid-level draft', () => {
    render(
      <ReadinessMeter readiness={result({ score: 62, level: 4, isNeutral: false, label: 'Getting there' })} />
    );
    expect(screen.getByText('62%')).toBeTruthy();
    expect(screen.getByText('Getting there')).toBeTruthy();
  });

  it('exposes an accessible progressbar carrying the score', () => {
    render(
      <ReadinessMeter readiness={result({ score: 62, level: 4, isNeutral: false, label: 'Getting there' })} />
    );
    const bar = screen.getByRole('progressbar');
    expect(bar.getAttribute('aria-valuenow')).toBe('62');
    expect(bar.getAttribute('aria-valuemin')).toBe('0');
    expect(bar.getAttribute('aria-valuemax')).toBe('100');
    // Colour is never alone: the label rides in the accessible name too.
    expect(bar.getAttribute('aria-label')).toMatch(/Draft readiness/i);
  });

  it('applies the band palette gradient for a non-neutral level', () => {
    render(
      <ReadinessMeter readiness={result({ score: 62, level: 4, isNeutral: false, label: 'Getting there' })} />
    );
    // Band 4 is green in the canonical palette.
    expect(fillOf(screen.getByRole('progressbar')).className).toMatch(/from-green-/);
  });

  it('colours by chromaLevel (capped), not by the uncapped completeness level', () => {
    // A complete draft on a Band-4 (green) question: level 6 drives the label
    // ("Ready to submit") but chromaLevel is capped at 4, so the fill is green,
    // never blue/purple.
    render(
      <ReadinessMeter
        readiness={result({ score: 95, level: 6, chromaLevel: 4, isNeutral: false, label: 'Ready to submit' })}
      />
    );
    expect(screen.getByText('Ready to submit')).toBeTruthy();
    const fill = fillOf(screen.getByRole('progressbar')).className;
    expect(fill).toMatch(/from-green-/); // band 4
    expect(fill).not.toMatch(/from-blue-/); // band 5
    expect(fill).not.toMatch(/from-purple-/); // band 6
  });

  it('renders the neutral slate state for an empty draft, never band-1 red', () => {
    render(<ReadinessMeter readiness={result({})} />);
    expect(screen.getByText('Start writing')).toBeTruthy();
    const fill = fillOf(screen.getByRole('progressbar')).className;
    // Slate, not a band colour — an empty box must not read as "failing".
    expect(fill).toMatch(/from-slate-/);
    expect(fill).not.toMatch(/from-red-/);
    expect(fill).not.toMatch(/from-green-/);
  });

  it('drops the word label in compact mode but keeps the number and bar', () => {
    render(
      <ReadinessMeter
        compact
        readiness={result({ score: 40, level: 2, isNeutral: false, label: 'Taking shape' })}
      />
    );
    expect(screen.queryByText('Taking shape')).toBeNull();
    expect(screen.getByText('40%')).toBeTruthy();
    expect(screen.getByRole('progressbar')).toBeTruthy();
  });
});
