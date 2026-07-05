import { describe, it, expect } from 'vitest';
import { evaluateQuotaWarning, QUOTA_WARNING_THRESHOLDS } from '../../utils/quotaWarnings';

describe('evaluateQuotaWarning', () => {
  it('is silent below the first threshold', () => {
    expect(evaluateQuotaWarning({ used: 40, limit: 60 }, [])).toBeNull(); // 66%
  });

  it('warns "approaching" when crossing 80%', () => {
    const w = evaluateQuotaWarning({ used: 48, limit: 60 }, []); // exactly 80%
    expect(w).not.toBeNull();
    expect(w!.level).toBe('approaching');
    expect(w!.threshold).toBe(80);
    expect(w!.pct).toBe(80);
    expect(w!.message).toContain('80%');
  });

  it('warns "reached" at 100%', () => {
    const w = evaluateQuotaWarning({ used: 60, limit: 60 }, []);
    expect(w!.level).toBe('reached');
    expect(w!.threshold).toBe(100);
    expect(w!.message).toMatch(/limit reached/i);
  });

  it('surfaces the highest crossed threshold when both are fresh (jump past 100)', () => {
    const w = evaluateQuotaWarning({ used: 70, limit: 60 }, []); // over limit
    expect(w!.threshold).toBe(100);
    expect(w!.pct).toBe(100); // clamped for display
  });

  it('does not repeat a threshold already fired', () => {
    expect(evaluateQuotaWarning({ used: 50, limit: 60 }, [80])).toBeNull(); // 83%, 80 fired
  });

  it('still raises 100% even when 80% was already fired', () => {
    const w = evaluateQuotaWarning({ used: 60, limit: 60 }, [80]);
    expect(w!.threshold).toBe(100);
  });

  it('is silent for an unlimited/zero or malformed limit', () => {
    expect(evaluateQuotaWarning({ used: 5, limit: 0 }, [])).toBeNull();
    expect(evaluateQuotaWarning({ used: 5, limit: -1 }, [])).toBeNull();
    expect(evaluateQuotaWarning({ used: NaN, limit: 60 }, [])).toBeNull();
  });

  it('exposes thresholds in ascending order', () => {
    expect([...QUOTA_WARNING_THRESHOLDS]).toEqual([80, 100]);
  });
});
