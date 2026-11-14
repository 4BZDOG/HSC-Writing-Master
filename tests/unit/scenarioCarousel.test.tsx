import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ScenarioCarousel from '../../components/ScenarioCarousel';
import { PromptVerb, ScenarioImageRef } from '../../types';

const mockLoadScenarioImage = vi.fn();

vi.mock('../../utils/scenarioImageStorage', () => ({
  loadScenarioImage: (...args: unknown[]) => mockLoadScenarioImage(...args),
}));

afterEach(() => {
  cleanup();
  mockLoadScenarioImage.mockReset();
});

const makeImageRef = (overrides: Partial<ScenarioImageRef> = {}): ScenarioImageRef => ({
  id: 'p1',
  updatedAt: 1000,
  ...overrides,
});

describe('ScenarioCarousel', () => {
  it('renders only the text slide, with no toggle, when there is no image', () => {
    render(
      <ScenarioCarousel
        scenarioText="A lab is sequencing a genome."
        keywords={[]}
        verb={'DESCRIBE' as PromptVerb}
        fontSize={18}
      />
    );

    expect(screen.getByText(/sequencing a genome/i)).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Scenario slide' })).toBeNull();
  });

  it('renders only the image slide, with no toggle, when there is no text', async () => {
    mockLoadScenarioImage.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,xyz' });

    render(<ScenarioCarousel scenarioImage={makeImageRef()} fontSize={18} />);

    expect(screen.queryByRole('group', { name: 'Scenario slide' })).toBeNull();
    await waitFor(() => expect(screen.getByAltText('Scenario diagram')).toBeTruthy());
  });

  it('shows a loading state before the image resolves, then the image', async () => {
    let resolveLoad: (value: { dataUrl: string } | null) => void = () => {};
    mockLoadScenarioImage.mockReturnValue(
      new Promise((resolve) => {
        resolveLoad = resolve;
      })
    );

    render(
      <ScenarioCarousel scenarioText="Some context." scenarioImage={makeImageRef()} fontSize={18} />
    );

    // Text slide is active by default; switch to the image slide to see the
    // loading state resolve into the image.
    fireEvent.click(screen.getByRole('button', { name: /image/i }));
    expect(screen.getByText(/loading image/i)).toBeTruthy();

    resolveLoad({ dataUrl: 'data:image/jpeg;base64,abc' });
    await waitFor(() => expect(screen.getByAltText('Scenario diagram')).toBeTruthy());
  });

  it('toggles between the text and image slides via the tab controls', async () => {
    mockLoadScenarioImage.mockResolvedValue({ dataUrl: 'data:image/jpeg;base64,xyz' });

    render(
      <ScenarioCarousel
        scenarioText="A lab is sequencing a genome."
        scenarioImage={makeImageRef({ alt: 'Genome sequencing diagram' })}
        keywords={[]}
        verb={'DESCRIBE' as PromptVerb}
        fontSize={18}
      />
    );

    // Text slide shown first, toggle visible because both exist.
    expect(screen.getByText(/sequencing a genome/i)).toBeTruthy();
    const toggle = screen.getByRole('group', { name: 'Scenario slide' });
    expect(toggle).toBeTruthy();
    expect(screen.getByRole('button', { name: /text/i }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: /image/i }).getAttribute('aria-pressed')).toBe(
      'false'
    );

    fireEvent.click(screen.getByRole('button', { name: /image/i }));
    await waitFor(() => expect(screen.getByAltText('Genome sequencing diagram')).toBeTruthy());
    expect(screen.queryByText(/sequencing a genome/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /text/i }));
    expect(screen.getByText(/sequencing a genome/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /text/i }).getAttribute('aria-pressed')).toBe('true');
  });

  it('shows an unavailable message if the image failed to load', async () => {
    mockLoadScenarioImage.mockResolvedValue(null);

    render(<ScenarioCarousel scenarioImage={makeImageRef()} fontSize={18} />);

    await waitFor(() => expect(screen.getByText(/image unavailable/i)).toBeTruthy());
  });
});
