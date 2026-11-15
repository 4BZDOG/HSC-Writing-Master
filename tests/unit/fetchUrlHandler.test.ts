/**
 * @vitest-environment node
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * The page reader's host rules and its NESA branch, exercised with `fetch` mocked so
 * no test reaches the network. The NESA case uses the real Health and Movement Science
 * page, cut down to the records the parser reads.
 */

vi.mock('../../api/_lib/auth', () => ({
  verifyRequestAuth: vi.fn(async () => ({ ok: true })),
}));

import handler from '../../api/fetch-url';

class FakeResponse {
  statusCode?: number;
  body?: unknown;
  status(code: number) {
    this.statusCode = code;
    return this;
  }
  json(data: unknown) {
    this.body = data;
  }
}

const call = async (url: string) => {
  const res = new FakeResponse();
  await handler({ method: 'POST', body: { url }, headers: {} }, res);
  return res;
};

const stubPage = (html: string) => {
  const fetchMock = vi.fn(async () => new Response(html, { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

/** A fetch stub that answers each exact URL from a route, and fails loudly on any other. */
const stubRoutes = (routes: Record<string, () => Response>) => {
  const fetchMock = vi.fn(async (input: string | URL | Request) => {
    const make = routes[String(input)];
    if (!make) throw new Error(`unexpected fetch of ${String(input)}`);
    return make();
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

const redirect = (location: string) => new Response(null, { status: 302, headers: { location } });

const ALLOWED_PAGE = `<html><body><p>${'Syllabus words. '.repeat(20)}</p></body></html>`;
const ALLOWED_URL = 'https://educationstandards.nsw.edu.au/wps/portal/a';

const hmsFixture = readFileSync(resolve(__dirname, '../fixtures/nesa/hms-year-12.html'), 'utf8');
const HMS_URL =
  'https://curriculum.nsw.edu.au/learning-areas/pdhpe/health-and-movement-science-11-12-2023/content/year-12/fa544450d1';

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('which hosts the reader will fetch', () => {
  it('allows the NESA section of www.nsw.gov.au', async () => {
    const fetchMock = stubPage(`<html><body><p>${'Syllabus words. '.repeat(20)}</p></body></html>`);

    const res = await call(
      'https://www.nsw.gov.au/education-and-training/nesa/curriculum/syllabus'
    );

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses other pages on www.nsw.gov.au without fetching them', async () => {
    const fetchMock = stubPage('');

    const res = await call('https://www.nsw.gov.au/other');

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a path that climbs out of the NESA section', async () => {
    const fetchMock = stubPage('');

    const res = await call('https://www.nsw.gov.au/education-and-training/nesa/../other');

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still allows the hosts it always did', async () => {
    stubPage(`<html><body><p>${'Syllabus words. '.repeat(20)}</p></body></html>`);

    const res = await call(
      'https://curriculum.nsw.edu.au/learning-areas/pdhpe/x/content/year-12/fa1'
    );

    expect(res.statusCode).toBe(200);
  });
});

describe('reading a curriculum.nsw.edu.au page', () => {
  it('returns the structure and a plain-text rendering of it', async () => {
    stubPage(hmsFixture);

    const res = await call(HMS_URL);

    expect(res.statusCode).toBe(200);
    const body = res.body as { text: string; nesa?: { title: string; groups: unknown[] } };
    expect(body.nesa?.title).toBe('Health in an Australian and global context');
    expect(body.nesa?.groups).toHaveLength(4);
    expect(body.text).toContain('HM-12-01');
    expect(body.text).toContain('Analyse the current health status of Australians');
  });

  it('keeps the generic text path for a page with no embedded record', async () => {
    stubPage(`<html><body><p>${'Some syllabus words. '.repeat(20)}</p></body></html>`);

    const res = await call(
      'https://curriculum.nsw.edu.au/learning-areas/pdhpe/x/content/year-12/fa1'
    );

    expect(res.statusCode).toBe(200);
    const body = res.body as { text: string; nesa?: unknown };
    expect(body.text).toContain('Some syllabus words.');
    expect(body.nesa).toBeUndefined();
  });
});

describe('following redirects', () => {
  it('refuses a redirect from an allowed host to the cloud metadata address, and never fetches it', async () => {
    const fetchMock = stubRoutes({
      [ALLOWED_URL]: () => redirect('http://169.254.169.254/latest/meta-data/'),
    });

    const res = await call(ALLOWED_URL);

    expect(res.statusCode).toBe(400);
    expect(res.body).toEqual({
      error: expect.stringContaining('Only NESA/NSW Education syllabus URLs'),
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([ALLOWED_URL]);
  });

  it('refuses a redirect to a host the reader does not allow, even over HTTPS', async () => {
    const fetchMock = stubRoutes({
      [ALLOWED_URL]: () => redirect('https://evil.example.com/page'),
    });

    const res = await call(ALLOWED_URL);

    expect(res.statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('follows a redirect that stays on an allowed host, checking it first', async () => {
    const fetchMock = stubRoutes({
      [ALLOWED_URL]: () => redirect('/wps/portal/b'),
      'https://educationstandards.nsw.edu.au/wps/portal/b': () => new Response(ALLOWED_PAGE),
    });

    const res = await call(ALLOWED_URL);

    expect(res.statusCode).toBe(200);
    expect(fetchMock.mock.calls.map((c) => String(c[0]))).toEqual([
      ALLOWED_URL,
      'https://educationstandards.nsw.edu.au/wps/portal/b',
    ]);
    // Redirects are followed by the reader, not the runtime.
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
  });

  it('gives up after five redirects', async () => {
    const fetchMock = stubRoutes({
      [ALLOWED_URL]: () => redirect(ALLOWED_URL),
    });

    const res = await call(ALLOWED_URL);

    expect(res.statusCode).toBe(400);
    expect(fetchMock).toHaveBeenCalledTimes(6);
  });
});

describe('which URLs the reader will fetch at all', () => {
  it.each([
    ['plain http', 'http://educationstandards.nsw.edu.au/wps/portal/a'],
    ['a non-default port', 'https://educationstandards.nsw.edu.au:8443/wps/portal/a'],
    ['credentials', 'https://user:pass@educationstandards.nsw.edu.au/wps/portal/a'],
    ['a username alone', 'https://user@educationstandards.nsw.edu.au/wps/portal/a'],
  ])('refuses %s without fetching', async (_label, url) => {
    const fetchMock = stubPage(ALLOWED_PAGE);

    const res = await call(url);

    expect(res.statusCode).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('accepts an explicit default HTTPS port', async () => {
    stubPage(ALLOWED_PAGE);
    const res = await call('https://educationstandards.nsw.edu.au:443/wps/portal/a');
    expect(res.statusCode).toBe(200);
  });
});

describe('page size', () => {
  it('refuses a page whose body runs past the cap, with a clear message', async () => {
    stubPage('a'.repeat(8 * 1024 * 1024 + 1));

    const res = await call(ALLOWED_URL);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: expect.stringContaining('too large') });
  });

  it('refuses a page that declares a size over the cap without reading it', async () => {
    stubRoutes({
      [ALLOWED_URL]: () =>
        new Response(ALLOWED_PAGE, { status: 200, headers: { 'content-length': '99999999' } }),
    });

    const res = await call(ALLOWED_URL);

    expect(res.statusCode).toBe(502);
    expect(res.body).toEqual({ error: expect.stringContaining('too large') });
  });

  it('reads a normal page in full', async () => {
    stubPage(ALLOWED_PAGE);
    const res = await call(ALLOWED_URL);
    expect(res.statusCode).toBe(200);
    expect((res.body as { text: string }).text).toContain('Syllabus words.');
  });
});
