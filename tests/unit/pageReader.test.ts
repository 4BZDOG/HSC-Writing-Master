import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Reading a web page is not an AI call, and must not report itself as one.
 *
 * `/api/fetch-url` reads the page server-side; asking the model to go and look
 * with googleSearch grounding is the fallback for deployments that have no such
 * endpoint, and it costs a separate quota that the free tier exhausts almost
 * immediately. Which of the two ran was decided by testing the error's *text*
 * for the word "fetch" — and the reader's own commonest message is "Failed to
 * fetch the URL: …". So every blocked page, DNS failure and TLS error the
 * reader reported was read as "there is no reader here", fell through to the
 * model, and came back to the user as an AI usage error about a call they never
 * asked for, with the real reason thrown away.
 */

vi.mock('../../services/aiCore', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/aiCore')>();
  return { ...actual, generateContentWithRetry: vi.fn() };
});

import { fetchSyllabusContentFromUrl } from '../../services/geminiService';
import { generateContentWithRetry } from '../../services/aiCore';

const URL_UNDER_TEST = 'https://curriculum.nsw.edu.au/biology';

const respondWith = (status: number, body: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    }))
  );
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('reading a syllabus page', () => {
  it('returns the text the reader extracted', async () => {
    respondWith(200, { text: 'x'.repeat(400) });
    await expect(fetchSyllabusContentFromUrl(URL_UNDER_TEST)).resolves.toHaveLength(400);
    expect(generateContentWithRetry).not.toHaveBeenCalled();
  });

  it('surfaces the reader’s own reason — even when it contains the word "fetch"', async () => {
    // The exact body api/fetch-url returns for a page it could not load. This
    // is the case that used to become an AI usage error.
    respondWith(502, { error: 'Failed to fetch the URL: certificate has expired' });

    await expect(fetchSyllabusContentFromUrl(URL_UNDER_TEST)).rejects.toThrow(
      /certificate has expired/
    );
    expect(generateContentWithRetry).not.toHaveBeenCalled();
  });

  it('surfaces a refusal about the host without asking an AI instead', async () => {
    respondWith(400, { error: 'Only NESA/NSW Education syllabus URLs are supported.' });

    await expect(fetchSyllabusContentFromUrl(URL_UNDER_TEST)).rejects.toThrow(/Only NESA/);
    expect(generateContentWithRetry).not.toHaveBeenCalled();
  });

  it('treats a page with no readable text as an answer, not as a missing reader', async () => {
    respondWith(200, { text: 'tiny' });

    await expect(fetchSyllabusContentFromUrl(URL_UNDER_TEST)).rejects.toThrow(
      /almost no readable text/
    );
    expect(generateContentWithRetry).not.toHaveBeenCalled();
  });

  it('falls back to the AI only when there is no reader deployed', async () => {
    // Static hosting serves the SPA for an unknown path — 404 is the one status
    // that means "this deployment has no page reader".
    respondWith(404, {});
    vi.mocked(generateContentWithRetry).mockResolvedValue({
      text: 'syllabus text from the model'.repeat(10),
    } as never);

    await expect(fetchSyllabusContentFromUrl(URL_UNDER_TEST)).resolves.toContain('syllabus text');
    expect(generateContentWithRetry).toHaveBeenCalledTimes(1);
  });

  it('falls back when the endpoint cannot be reached at all', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch');
      })
    );
    vi.mocked(generateContentWithRetry).mockResolvedValue({
      text: 'syllabus text from the model'.repeat(10),
    } as never);

    await expect(fetchSyllabusContentFromUrl(URL_UNDER_TEST)).resolves.toContain('syllabus text');
    expect(generateContentWithRetry).toHaveBeenCalledTimes(1);
  });

  it('says what it was attempting when the AI fallback is the thing that fails', async () => {
    respondWith(404, {});
    vi.mocked(generateContentWithRetry).mockRejectedValue(
      new Error('Daily AI limit reached for your plan.')
    );

    // On its own, "daily AI limit reached" after pressing Fetch reads as though
    // reading a page costs an AI call by design. It does not.
    await expect(fetchSyllabusContentFromUrl(URL_UNDER_TEST)).rejects.toThrow(
      /no page reader.*Daily AI limit reached/s
    );
  });
});
