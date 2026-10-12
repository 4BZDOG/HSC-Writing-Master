import { describe, it, expect, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup } from '@testing-library/react';
import HscResultsCard from '../../components/HscResultsCard';
import { HSC_BAND_SHARES, HSC_RESULTS_CHART } from '../../data/hscResultsFacts';
import { getBandHex } from '../../utils/renderUtils';

/**
 * The results chart, as a screen reader and a sighted reader meet it.
 *
 * It must read as a picture of all students' results and nothing about the
 * reader: the caption says so, its figures are read from a visually-hidden
 * list, its segments come from the app's own band palette in band order, and
 * it never announces itself on a live region.
 */

afterEach(cleanup);

/** jsdom reports a hex colour back as `rgb(r, g, b)`; compare in that form. */
const hexToRgb = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

const renderCard = () => render(<HscResultsCard />);

describe('HscResultsCard', () => {
  it('is a named figure titled for the year', () => {
    renderCard();
    expect(screen.getByRole('figure', { name: 'How 2025 HSC results fell' })).toBeTruthy();
  });

  it('draws one segment per band, Band 1 to Band 6 left to right, in the band palette', () => {
    const { container } = renderCard();
    const segments = Array.from(container.querySelectorAll<HTMLElement>('[data-band]'));
    expect(segments.map((el) => Number(el.dataset.band))).toEqual([1, 2, 3, 4, 5, 6]);
    segments.forEach((el, i) => {
      const band = i + 1;
      expect(el.style.backgroundColor).toBe(hexToRgb(getBandHex(band)));
    });
  });

  it('sizes each segment to its pooled share', () => {
    const { container } = renderCard();
    const segments = Array.from(container.querySelectorAll<HTMLElement>('[data-band]'));
    segments.forEach((el, i) => {
      expect(Number(el.style.flexGrow)).toBe(HSC_BAND_SHARES[i].share);
    });
  });

  it('gives a screen reader the six figures as a list, one for each band', () => {
    const { container } = renderCard();
    const list = container.querySelector('ul.sr-only');
    expect(list).not.toBeNull();
    const items = Array.from(list?.querySelectorAll('li') ?? []).map((li) => li.textContent);
    expect(items).toEqual(
      HSC_BAND_SHARES.map(({ band, share }) => `Band ${band}: ${share}% of results`)
    );
  });

  it('hides the strip and its visible legend from assistive tech, since the list says the same', () => {
    const { container } = renderCard();
    const strip = container.querySelector('[data-band]')?.parentElement;
    expect(strip?.getAttribute('aria-hidden')).toBe('true');
    const legend = container.querySelector('ul[aria-hidden="true"]');
    expect(legend).not.toBeNull();
    expect(legend?.textContent).toContain('Band 6');
    expect(legend?.textContent).toContain('10.4%');
  });

  it('says whose results these are, and that they are not a mark or a prediction', () => {
    renderCard();
    expect(screen.getByText(HSC_RESULTS_CHART.caption)).toBeTruthy();
    expect(HSC_RESULTS_CHART.caption).toMatch(/not anyone’s mark/);
    expect(HSC_RESULTS_CHART.caption).toMatch(/does not predict one/);
  });

  it('names its source, opens it in a new tab safely, and says so for a screen reader', () => {
    renderCard();
    const link = screen.getByRole('link', { name: /NESA, 2025 performance band data/ });
    expect(link.getAttribute('href')).toBe(HSC_RESULTS_CHART.sources[0].url);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.textContent).toContain('(opens in a new tab)');
  });

  it('is never a live region, so it is not announced on a timer', () => {
    const { container } = renderCard();
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
