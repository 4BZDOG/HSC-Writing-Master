// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import type { IncomingMessage, ServerResponse } from 'http';
import { guardDevHandler } from '../../vite.config';

/**
 * The dev server's API handlers are async, and Connect does not catch a rejected
 * promise: Node exits on it. A Mobile Safari e2e test that timed out closed its
 * page while a POST to /api/gemini was still uploading, the body read threw
 * `aborted`, and the dev server died, so every later test in the shard failed
 * with "Connection refused". The guard keeps the server up.
 */

const fakeRes = () => {
  const res = {
    statusCode: 200,
    headersSent: false,
    writableEnded: false,
    setHeader: vi.fn(),
    end: vi.fn(),
  };
  return res as unknown as ServerResponse & typeof res;
};
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('guardDevHandler', () => {
  it('swallows a request whose client went away mid-upload', async () => {
    const aborted = Object.assign(new Error('aborted'), { code: 'ECONNRESET' });
    const res = fakeRes();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    guardDevHandler('/gemini', async () => {
      throw aborted;
    })({ destroyed: true } as IncomingMessage, res);
    await settle();
    expect(res.end).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    error.mockRestore();
  });

  it('answers 500 for any other failure, rather than letting it escape', async () => {
    const res = fakeRes();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    guardDevHandler('/gemini', async () => {
      throw new Error('provider exploded');
    })({ destroyed: false } as IncomingMessage, res);
    await settle();
    expect(res.statusCode).toBe(500);
    expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'Dev proxy error.' }));
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it('leaves a handler that succeeds alone', async () => {
    const res = fakeRes();
    guardDevHandler('/gemini', async (_req, r) => {
      r.end('ok');
    })({ destroyed: false } as IncomingMessage, res);
    await settle();
    expect(res.end).toHaveBeenCalledWith('ok');
    expect(res.statusCode).toBe(200);
  });
});
