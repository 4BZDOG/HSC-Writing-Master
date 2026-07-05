import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  observeQuota,
  subscribeQuotaWarnings,
  _resetQuotaListeners,
} from '../../services/quotaNotifier';
import { STORAGE_KEYS } from '../../utils/storageUtils';

describe('quotaNotifier', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetQuotaListeners();
  });

  it('notifies subscribers when a threshold is crossed', () => {
    const seen = vi.fn();
    subscribeQuotaWarnings(seen);
    observeQuota({ used: 48, limit: 60 }); // 80%
    expect(seen).toHaveBeenCalledTimes(1);
    expect(seen.mock.calls[0][0].threshold).toBe(80);
  });

  it('fires a threshold at most once per day', () => {
    const seen = vi.fn();
    subscribeQuotaWarnings(seen);
    observeQuota({ used: 50, limit: 60 }); // 83% → 80 fires
    observeQuota({ used: 52, limit: 60 }); // 86% → 80 already fired, silent
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('still escalates to 100% after 80% has fired', () => {
    const seen = vi.fn();
    subscribeQuotaWarnings(seen);
    observeQuota({ used: 50, limit: 60 }); // 80 fires
    observeQuota({ used: 60, limit: 60 }); // 100 fires
    expect(seen).toHaveBeenCalledTimes(2);
    expect(seen.mock.calls[1][0].level).toBe('reached');
  });

  it('resets the dedupe when the stored day is stale', () => {
    // Simulate yesterday's record already having fired both thresholds.
    localStorage.setItem(
      STORAGE_KEYS.QUOTA_WARNINGS,
      JSON.stringify({ day: '2000-01-01', fired: [80, 100] })
    );
    const seen = vi.fn();
    subscribeQuotaWarnings(seen);
    observeQuota({ used: 48, limit: 60 }); // 80% — should fire because day rolled
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('ignores malformed snapshots', () => {
    const seen = vi.fn();
    subscribeQuotaWarnings(seen);
    observeQuota(null);
    observeQuota(undefined);
    observeQuota({ used: 5 } as never);
    expect(seen).not.toHaveBeenCalled();
  });

  it('stops notifying after unsubscribe', () => {
    const seen = vi.fn();
    const off = subscribeQuotaWarnings(seen);
    off();
    observeQuota({ used: 60, limit: 60 });
    expect(seen).not.toHaveBeenCalled();
  });
});
