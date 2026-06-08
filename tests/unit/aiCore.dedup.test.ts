import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateContentWithRetry } from '../../services/aiCore';

// The AI core now talks to the server-side proxy via fetch, so we mock fetch
// and observe how many times the underlying network call is actually made.
const okJson = { candidates: [{ finishReason: 'STOP' }], text: '{}' };

const makeResponse = (body: unknown, ok = true, status = 200) =>
  ({
    ok,
    status,
    json: async () => body,
  }) as unknown as Response;

describe('generateContentWithRetry — request de-duplication', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('collapses concurrent identical requests into a single API call', async () => {
    let resolveCall: () => void = () => {};
    fetchMock.mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveCall = () => resolve(makeResponse(okJson));
        })
    );

    const request = { model: 'gemini', contents: 'hello' };
    const p1 = generateContentWithRetry(request);
    const p2 = generateContentWithRetry(request);

    // Flush microtasks so both calls register as in-flight before resolving.
    await Promise.resolve();
    resolveCall();

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(r1).toBe(r2);
  });

  it('does not de-duplicate distinct requests', async () => {
    fetchMock.mockResolvedValue(makeResponse(okJson));

    await Promise.all([
      generateContentWithRetry({ model: 'gemini', contents: 'a' }),
      generateContentWithRetry({ model: 'gemini', contents: 'b' }),
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('clears the in-flight entry so a later identical request still calls the API', async () => {
    fetchMock.mockResolvedValue(makeResponse(okJson));

    const request = { model: 'gemini', contents: 'again' };
    await generateContentWithRetry(request);
    await generateContentWithRetry(request);

    // Sequential (not concurrent) calls are real calls, not de-duplicated.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
