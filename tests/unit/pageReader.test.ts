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

import { fetchSyllabusContentFromUrl, fetchSyllabusPage } from '../../services/geminiService';
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

describe('reading a NESA page’s own structure', () => {
  // The shape the reader sends for a NESA focus area: the text, and the record it was built from.
  const nesa = {
    syllabus: 'Biology 11–12 (2025)',
    year: 'year11',
    title: 'Cells as the basis of life',
    outcomes: [
      {
        code: 'BI-11-01',
        description: 'explains how cell structures enable biological processes needed for life',
      },
    ],
    groups: [
      {
        title: 'Cell structures and functions',
        statements: [{ code: 'BI_1', text: 'Describe a cell', including: ['organelles'] }],
      },
    ],
    electives: [],
    siblings: [
      {
        path: 'https://curriculum.nsw.edu.au/learning-areas/science/biology-11-12-2025/content/year-11/fa42935d20',
        title: 'Working scientifically',
        year: 'year11',
      },
    ],
  };

  it('passes the structure through alongside the text', async () => {
    respondWith(200, { text: 'x'.repeat(400), nesa });

    const page = await fetchSyllabusPage(URL_UNDER_TEST);

    expect(page.text).toHaveLength(400);
    expect(page.nesa).toEqual(nesa);
    expect(generateContentWithRetry).not.toHaveBeenCalled();
  });

  it('drops a malformed structure and keeps the text', async () => {
    respondWith(200, { text: 'x'.repeat(400), nesa: { ...nesa, year: 'year13' } });

    const page = await fetchSyllabusPage(URL_UNDER_TEST);

    expect(page.text).toHaveLength(400);
    expect(page.nesa).toBeUndefined();
  });

  it('drops a structure whose sibling is not an https address', async () => {
    respondWith(200, {
      text: 'x'.repeat(400),
      nesa: { ...nesa, siblings: [{ path: 'javascript:alert(1)', title: 'x', year: 'year11' }] },
    });

    const page = await fetchSyllabusPage(URL_UNDER_TEST);

    expect(page.nesa).toBeUndefined();
  });

  it('has no structure when the AI fallback supplies the text', async () => {
    respondWith(404, {});
    vi.mocked(generateContentWithRetry).mockResolvedValue({
      text: 'syllabus text from the model'.repeat(10),
    } as never);

    const page = await fetchSyllabusPage(URL_UNDER_TEST);

    expect(page.text).toContain('syllabus text');
    expect(page.nesa).toBeUndefined();
  });

  it('leaves fetchSyllabusContentFromUrl returning only the text', async () => {
    respondWith(200, { text: 'x'.repeat(400), nesa });

    await expect(fetchSyllabusContentFromUrl(URL_UNDER_TEST)).resolves.toHaveLength(400);
  });
});
