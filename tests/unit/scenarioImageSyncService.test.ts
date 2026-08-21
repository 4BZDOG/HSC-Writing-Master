import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `scenarioImageSyncService` sits between the local IDB cache
 * (`utils/scenarioImageStorage.ts`) and Supabase Storage. Both exported
 * functions must be fail-soft: no Supabase configured, no local bytes, a
 * network error, or a permission error (the RLS-still-a-draft path, see
 * `projectDocs/Plan-P0Followups.md` item 1) must all resolve gracefully
 * rather than throw. `supabase` is exported as a mutable getter here so
 * individual tests can flip it to `null` to exercise the "not configured"
 * branch, matching how the real module is `null` until env vars are set.
 */

const uploadMock = vi.fn();
const downloadMock = vi.fn();
const removeMock = vi.fn();
const fromMock = vi.fn(() => ({ upload: uploadMock, download: downloadMock, remove: removeMock }));

let mockSupabase: { storage: { from: typeof fromMock } } | null = {
  storage: { from: fromMock },
};

vi.mock('../../services/supabaseClient', () => ({
  get supabase() {
    return mockSupabase;
  },
}));

const mockLoadScenarioImage = vi.fn();
const mockSaveScenarioImage = vi.fn();
vi.mock('../../utils/scenarioImageStorage', () => ({
  loadScenarioImage: (...args: unknown[]) => mockLoadScenarioImage(...args),
  saveScenarioImage: (...args: unknown[]) => mockSaveScenarioImage(...args),
}));

import {
  syncScenarioImageUp,
  syncScenarioImageDown,
  deleteScenarioImageFromStorage,
} from '../../services/scenarioImageSyncService';
import { ScenarioImageRef } from '../../types';

describe('scenarioImageSyncService', () => {
  beforeEach(() => {
    mockSupabase = { storage: { from: fromMock } };
    fromMock.mockClear();
    uploadMock.mockReset();
    downloadMock.mockReset();
    removeMock.mockReset();
    mockLoadScenarioImage.mockReset();
    mockSaveScenarioImage.mockReset();
  });

  describe('syncScenarioImageUp', () => {
    const ref: ScenarioImageRef = { id: 'p1', updatedAt: 1000 };

    it('no-ops when Supabase is not configured', async () => {
      mockSupabase = null;
      const result = await syncScenarioImageUp('p1', ref);
      expect(result).toBe(ref);
      expect(mockLoadScenarioImage).not.toHaveBeenCalled();
    });

    it('returns undefined unchanged when there is no ref at all', async () => {
      const result = await syncScenarioImageUp('p1', undefined);
      expect(result).toBeUndefined();
    });

    it('no-ops when already synced (storagePath already set)', async () => {
      const synced: ScenarioImageRef = { ...ref, storagePath: 'p1/p1' };
      const result = await syncScenarioImageUp('p1', synced);
      expect(result).toBe(synced);
      expect(mockLoadScenarioImage).not.toHaveBeenCalled();
      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('no-ops when there are no local bytes cached for this prompt', async () => {
      mockLoadScenarioImage.mockResolvedValue(null);
      const result = await syncScenarioImageUp('p1', ref);
      expect(result).toBe(ref);
      expect(uploadMock).not.toHaveBeenCalled();
    });

    it('uploads the cached image and resolves storagePath on success', async () => {
      mockLoadScenarioImage.mockResolvedValue({
        dataUrl: 'data:image/png;base64,AAAA',
        alt: 'Alt text',
      });
      uploadMock.mockResolvedValue({ error: null });

      const result = await syncScenarioImageUp('p1', ref);

      expect(fromMock).toHaveBeenCalledWith('scenario-images');
      expect(uploadMock).toHaveBeenCalledWith(
        'p1/p1',
        expect.any(Blob),
        expect.objectContaining({ contentType: 'image/png', upsert: true })
      );
      expect(result).toEqual({ ...ref, storagePath: 'p1/p1' });
    });

    it('resolves gracefully (warns, does not throw) on an upload error response — the RLS-draft path', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockLoadScenarioImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' });
      uploadMock.mockResolvedValue({
        error: { message: 'new row violates row-level security policy' },
      });

      const result = await syncScenarioImageUp('p1', ref);

      expect(result).toBe(ref);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('resolves gracefully (warns, does not throw) when the upload call itself rejects', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockLoadScenarioImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,AAAA' });
      uploadMock.mockRejectedValue(new Error('network down'));

      const result = await syncScenarioImageUp('p1', ref);

      expect(result).toBe(ref);
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('syncScenarioImageDown', () => {
    const ref: ScenarioImageRef = { id: 'p1', updatedAt: 1000, storagePath: 'p1/p1' };

    it('no-ops when Supabase is not configured', async () => {
      mockSupabase = null;
      await syncScenarioImageDown('p1', ref);
      expect(mockLoadScenarioImage).not.toHaveBeenCalled();
      expect(downloadMock).not.toHaveBeenCalled();
    });

    it('no-ops when the ref has no storagePath yet', async () => {
      await syncScenarioImageDown('p1', { id: 'p1', updatedAt: 1000 });
      expect(mockLoadScenarioImage).not.toHaveBeenCalled();
      expect(downloadMock).not.toHaveBeenCalled();
    });

    it('no-ops when already cached locally', async () => {
      mockLoadScenarioImage.mockResolvedValue({ dataUrl: 'data:image/png;base64,X' });
      await syncScenarioImageDown('p1', ref);
      expect(downloadMock).not.toHaveBeenCalled();
    });

    it('downloads and caches the image on success', async () => {
      mockLoadScenarioImage.mockResolvedValue(null);
      const blob = new Blob(['fake bytes'], { type: 'image/jpeg' });
      downloadMock.mockResolvedValue({ data: blob, error: null });

      await syncScenarioImageDown('p1', ref);

      expect(fromMock).toHaveBeenCalledWith('scenario-images');
      expect(downloadMock).toHaveBeenCalledWith('p1/p1');
      expect(mockSaveScenarioImage).toHaveBeenCalledTimes(1);
      const [promptId, dataUrl, alt] = mockSaveScenarioImage.mock.calls[0];
      expect(promptId).toBe('p1');
      expect(typeof dataUrl).toBe('string');
      expect(alt).toBeUndefined();
    });

    it('resolves gracefully (warns, does not throw, does not save) on a download error response', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockLoadScenarioImage.mockResolvedValue(null);
      downloadMock.mockResolvedValue({ data: null, error: { message: 'permission denied' } });

      await expect(syncScenarioImageDown('p1', ref)).resolves.toBeUndefined();

      expect(mockSaveScenarioImage).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('resolves gracefully (warns, does not throw) when the download call itself rejects', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      mockLoadScenarioImage.mockResolvedValue(null);
      downloadMock.mockRejectedValue(new Error('network down'));

      await expect(syncScenarioImageDown('p1', ref)).resolves.toBeUndefined();

      expect(mockSaveScenarioImage).not.toHaveBeenCalled();
      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });

  describe('deleteScenarioImageFromStorage', () => {
    it('no-ops when there is no storagePath (never uploaded)', async () => {
      await deleteScenarioImageFromStorage(undefined);
      expect(fromMock).not.toHaveBeenCalled();
      expect(removeMock).not.toHaveBeenCalled();
    });

    it('no-ops when Supabase is not configured', async () => {
      mockSupabase = null;
      await deleteScenarioImageFromStorage('p1/p1');
      expect(removeMock).not.toHaveBeenCalled();
    });

    it('removes the object on success', async () => {
      removeMock.mockResolvedValue({ error: null });
      await deleteScenarioImageFromStorage('p1/p1');
      expect(fromMock).toHaveBeenCalledWith('scenario-images');
      expect(removeMock).toHaveBeenCalledWith(['p1/p1']);
    });

    it('resolves gracefully (warns, does not throw) on a delete error response', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      removeMock.mockResolvedValue({ error: { message: 'permission denied' } });

      await expect(deleteScenarioImageFromStorage('p1/p1')).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('resolves gracefully (warns, does not throw) when the remove call itself rejects', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      removeMock.mockRejectedValue(new Error('network down'));

      await expect(deleteScenarioImageFromStorage('p1/p1')).resolves.toBeUndefined();

      expect(warnSpy).toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});
