import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { fetchDeployedBuildId, isNewerBuild, isUpdateCheckEnabled } from '../../utils/buildVersion';
import { useUpdateAvailable } from '../../hooks/useUpdateAvailable';

const reply = (body: unknown, ok = true) =>
  vi.fn().mockResolvedValue({ ok, json: async () => body }) as unknown as typeof fetch;

afterEach(() => vi.unstubAllGlobals());

describe('build version helpers', () => {
  it('only a different, known id counts as newer', () => {
    expect(isNewerBuild('abc', 'def')).toBe(true);
    expect(isNewerBuild('abc', 'abc')).toBe(false);
    expect(isNewerBuild('abc', null)).toBe(false);
  });

  it('is switched off for dev and test builds', () => {
    expect(isUpdateCheckEnabled('dev')).toBe(false);
    expect(isUpdateCheckEnabled('test-build')).toBe(false);
    expect(isUpdateCheckEnabled('9f3c2a1b7d40')).toBe(true);
  });

  it('reads the deployed id with no-store and the base path', async () => {
    const f = reply({ build: 'new1' });
    expect(await fetchDeployedBuildId(f, '/repo/')).toBe('new1');
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(url)).toMatch(/^\/repo\/version\.json\?t=\d+$/);
    expect(init).toMatchObject({ cache: 'no-store' });
  });

  it('treats a 404, bad JSON, a missing field or a network error as unknown', async () => {
    expect(await fetchDeployedBuildId(reply({}, false), '/')).toBeNull();
    expect(await fetchDeployedBuildId(reply({ nope: 1 }), '/')).toBeNull();
    expect(await fetchDeployedBuildId(reply({ build: '' }), '/')).toBeNull();
    const boom = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch;
    expect(await fetchDeployedBuildId(boom, '/')).toBeNull();
  });
});

describe('useUpdateAvailable', () => {
  it('stays quiet when the check is disabled', async () => {
    const f = reply({ build: 'zzz' });
    vi.stubGlobal('fetch', f);
    const { result } = renderHook(() => useUpdateAvailable('dev'));
    await act(async () => {});
    expect(f).not.toHaveBeenCalled();
    expect(result.current.updateAvailable).toBe(false);
  });

  it('reports a newer deploy and lets the user dismiss that one deploy', async () => {
    let deployed = 'new1';
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ build: deployed }) }))
    );
    const { result } = renderHook(() => useUpdateAvailable('old0', 60_000));
    await waitFor(() => expect(result.current.updateAvailable).toBe(true));

    act(() => result.current.dismiss());
    expect(result.current.updateAvailable).toBe(false);

    // A still-newer deploy brings the notice back.
    deployed = 'new2';
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await waitFor(() => expect(result.current.updateAvailable).toBe(true));
  });

  it('is quiet when the server is on the same build', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ build: 'same' }) }))
    );
    const { result } = renderHook(() => useUpdateAvailable('same'));
    await act(async () => {});
    expect(result.current.updateAvailable).toBe(false);
  });
});
