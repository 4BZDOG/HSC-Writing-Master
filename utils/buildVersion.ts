/**
 * Detecting a newer deploy of the app.
 *
 * Each production build writes `version.json` ({ build }) next to index.html
 * and bakes the same id into the bundle as `__BUILD_ID__`. A tab that has been
 * open since before a deploy therefore holds an older id than the server, and
 * can say so. There is deliberately no service worker: nothing here caches
 * pages, it only reads one tiny file with `no-store`.
 */

export const CURRENT_BUILD_ID: string = typeof __BUILD_ID__ !== 'undefined' ? __BUILD_ID__ : 'dev';

/** Dev servers and unit tests have no real deploy to compare against. */
export const isUpdateCheckEnabled = (currentBuild: string = CURRENT_BUILD_ID): boolean =>
  currentBuild !== 'dev' && currentBuild !== 'test-build';

/** True when the server reports a build id that differs from the running one. */
export const isNewerBuild = (current: string, remote: string | null): boolean =>
  !!remote && remote !== current;

/**
 * Reads the deployed build id. Resolves to null on any failure (offline, a 404
 * from a host with no version file, an HTML fallback page): "unknown" must
 * never be mistaken for "newer", so the banner stays away.
 */
export const fetchDeployedBuildId = async (
  fetchImpl: typeof fetch = fetch,
  baseUrl: string = import.meta.env.BASE_URL ?? '/'
): Promise<string | null> => {
  try {
    const res = await fetchImpl(`${baseUrl}version.json?t=${Date.now()}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data: unknown = await res.json();
    const build = (data as { build?: unknown } | null)?.build;
    return typeof build === 'string' && build.length > 0 ? build : null;
  } catch {
    return null;
  }
};
