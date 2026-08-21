import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * `scenarioImageStorage` is a thin wrapper over the shared `getDB()` handle
 * in `utils/storageUtils.ts`. This repo has no fake-indexeddb test harness
 * set up (confirmed: no such dependency in package.json, and the existing
 * `idbTransactions.test.ts` hand-mocks the `IDBPDatabase` object rather than
 * exercising a real IndexedDB) — so, matching that existing pattern, `getDB`
 * is mocked here to return a fake db exposing `put`/`get`/`delete` spies.
 */

const mockPut = vi.fn();
const mockGet = vi.fn();
const mockDelete = vi.fn();

vi.mock('../../utils/storageUtils', () => ({
  getDB: () => Promise.resolve({ put: mockPut, get: mockGet, delete: mockDelete }),
  STORE_SCENARIO_IMAGES: 'scenario_images_store',
}));

import {
  saveScenarioImage,
  loadScenarioImage,
  deleteScenarioImage,
} from '../../utils/scenarioImageStorage';

describe('scenarioImageStorage', () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockGet.mockReset();
    mockDelete.mockReset();
  });

  describe('saveScenarioImage', () => {
    it('writes a row to scenario_images_store keyed by promptId', async () => {
      await saveScenarioImage('p1', 'data:image/jpeg;base64,xyz', 'A labelled diagram');

      expect(mockPut).toHaveBeenCalledTimes(1);
      const [store, value, key] = mockPut.mock.calls[0];
      expect(store).toBe('scenario_images_store');
      expect(key).toBe('p1');
      expect(value).toMatchObject({
        promptId: 'p1',
        dataUrl: 'data:image/jpeg;base64,xyz',
        alt: 'A labelled diagram',
      });
      expect(typeof value.updatedAt).toBe('number');
    });

    it('stores no alt when none is given', async () => {
      await saveScenarioImage('p2', 'data:image/png;base64,abc');

      const [, value] = mockPut.mock.calls[0];
      expect(value.alt).toBeUndefined();
    });
  });

  describe('loadScenarioImage', () => {
    it('returns the dataUrl and alt for a stored row', async () => {
      mockGet.mockResolvedValue({
        promptId: 'p1',
        dataUrl: 'data:image/jpeg;base64,xyz',
        alt: 'A diagram',
        updatedAt: 12345,
      });

      const result = await loadScenarioImage('p1');

      expect(mockGet).toHaveBeenCalledWith('scenario_images_store', 'p1');
      expect(result).toEqual({ dataUrl: 'data:image/jpeg;base64,xyz', alt: 'A diagram' });
    });

    it('returns null when nothing is stored for that prompt', async () => {
      mockGet.mockResolvedValue(undefined);

      const result = await loadScenarioImage('missing');

      expect(result).toBeNull();
    });
  });

  describe('deleteScenarioImage', () => {
    it('removes the row for the given promptId', async () => {
      await deleteScenarioImage('p1');

      expect(mockDelete).toHaveBeenCalledWith('scenario_images_store', 'p1');
    });
  });

  describe('round trip', () => {
    it('save then load returns what was saved', async () => {
      let stored: any;
      mockPut.mockImplementation((_store, value) => {
        stored = value;
        return Promise.resolve();
      });
      mockGet.mockImplementation(() => Promise.resolve(stored));

      await saveScenarioImage('p1', 'data:image/jpeg;base64,round-trip', 'Round trip alt');
      const loaded = await loadScenarioImage('p1');

      expect(loaded).toEqual({
        dataUrl: 'data:image/jpeg;base64,round-trip',
        alt: 'Round trip alt',
      });
    });
  });
});
