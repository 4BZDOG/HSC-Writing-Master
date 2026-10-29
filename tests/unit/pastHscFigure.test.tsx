import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import PastHscScenario from '../../components/PastHscScenario';
import { splitPastHscScenario } from '../../utils/pastHscScenario';
import { shippedImageUrl } from '../../hooks/useScenarioImage';

/**
 * A past paper's table, dashboard or slideshow ships as a screenshot under
 * `public/` (`ScenarioImageRef.src`) beside the text the marker reads. The
 * screenshot is drawn where the stimulus sits, and the text folds away.
 */
describe('PastHscScenario with a shipped stimulus image', () => {
  const parts = splitPastHscScenario(
    'Below is the Issues table.\n\nStimulus: | JobID | Status |\n| --- | --- |\n| 0001 | Pending |'
  );
  const image = {
    id: 'prompt-se-hsc-2025-21',
    src: 'courseData/images/se-2025-21.png',
    alt: 'The Issues table',
    updatedAt: 0,
  };

  it('draws the screenshot from the app, with the text under "Read as text"', () => {
    render(<PastHscScenario parts={parts} image={image} fontSize={16} />);
    const img = screen.getByRole('img', { name: 'The Issues table' }) as HTMLImageElement;
    expect(img.getAttribute('src')).toBe(shippedImageUrl(image.src));
    expect(screen.getByText('Read as text')).toBeTruthy();
    expect(screen.getByText('Below is the Issues table.')).toBeTruthy();
  });

  it('draws the stimulus as text when there is no image', () => {
    render(<PastHscScenario parts={parts} fontSize={16} />);
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.getByText('Stimulus')).toBeTruthy();
  });

  it('resolves a shipped path against the base URL', () => {
    expect(shippedImageUrl('/courseData/images/x.png')).toMatch(/courseData\/images\/x\.png$/);
    expect(shippedImageUrl('/courseData/images/x.png')).not.toContain('//courseData');
  });
});
