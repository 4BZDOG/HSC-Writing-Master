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
  const fetchMock = vi.fn(async () => ({ ok: true, status: 200, text: async () => html }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
};

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
