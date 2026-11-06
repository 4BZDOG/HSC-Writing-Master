import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, render, waitFor } from '@testing-library/react';
import type { ScenarioImageRef } from '../../types';

/**
 * A scenario image that cannot be read from IndexedDB must not leave the image area
 * spinning forever ("Loading image..." while `loading` is true), nor surface as an
 * unhandled promise rejection from the hook or the uploader.
 */

vi.mock('../../utils/scenarioImageStorage', () => ({
  loadScenarioImage: vi.fn(),
  saveScenarioImage: vi.fn(),
  deleteScenarioImage: vi.fn(),
}));

vi.mock('../../services/scenarioImageSyncService', () => ({
  syncScenarioImageDown: vi.fn(),
  syncScenarioImageUp: vi.fn(),
  deleteScenarioImageFromStorage: vi.fn(),
}));

import { useScenarioImage } from '../../hooks/useScenarioImage';
import ScenarioImageUploader from '../../components/ScenarioImageUploader';
import { loadScenarioImage } from '../../utils/scenarioImageStorage';

const loadMock = loadScenarioImage as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  loadMock.mockRejectedValue(new Error('IndexedDB is blocked'));
});

describe('useScenarioImage when the stored image cannot be read', () => {
  it('stops loading and shows no image', async () => {
    const ref: ScenarioImageRef = { id: 'p1', updatedAt: 1 };

    const { result } = renderHook(() => useScenarioImage(ref));

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.url).toBeNull();
  });
});

describe('ScenarioImageUploader when the stored image cannot be read', () => {
  it('does not leave an unhandled rejection behind', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      render(
        <ScenarioImageUploader
          promptId="p1"
          existingImage={{ id: 'p1', updatedAt: 1 }}
          onImageChange={vi.fn()}
        />
      );
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(loadMock).toHaveBeenCalledWith('p1');
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});
