import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Operator alerts (api/_lib/operatorAlert.ts). The alert is best effort: it is skipped
 * when no webhook is configured, it never throws, and it gives up after four seconds.
 * The webhook URL is a secret, so no log line may carry it. fetch is stubbed; nothing
 * here reaches the network.
 */

import { notifyOperator } from '../../api/_lib/operatorAlert';

const HOOK = 'https://hooks.example.com/services/T000/B000/SECRETTOKEN';

const alert = {
  kind: 'invoice_request' as const,
  title: 'New invoice request',
  lines: ['School: Parramatta High School', '30 seats', 'Open Admin → Billing overview.'],
};

let fetchMock: ReturnType<typeof vi.fn>;

const postedBody = (call = 0) =>
  JSON.parse((fetchMock.mock.calls[call][1] as RequestInit).body as string) as {
    text: string;
    content: string;
  };

beforeEach(() => {
  process.env.BILLING_ALERT_WEBHOOK_URL = HOOK;
  fetchMock = vi.fn(async () => ({ ok: true, status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  delete process.env.BILLING_ALERT_WEBHOOK_URL;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('notifyOperator: configuration', () => {
  it('is skipped, with no network call, when BILLING_ALERT_WEBHOOK_URL is unset', async () => {
    delete process.env.BILLING_ALERT_WEBHOOK_URL;
    await expect(notifyOperator(alert)).resolves.toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is skipped when the URL is only whitespace', async () => {
    process.env.BILLING_ALERT_WEBHOOK_URL = '   ';
    await expect(notifyOperator(alert)).resolves.toBe('skipped');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(['http://hooks.example.com/services/T000', 'ftp://hooks.example.com/x', 'not a url'])(
    'is skipped with a warning when the URL is not https (%s)',
    async (bad) => {
      process.env.BILLING_ALERT_WEBHOOK_URL = bad;
      await expect(notifyOperator(alert)).resolves.toBe('skipped');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(console.warn).toHaveBeenCalled();
      expect(String(vi.mocked(console.warn).mock.calls[0][0])).not.toContain(bad);
    }
  );

  it('allows plain http to localhost for development', async () => {
    process.env.BILLING_ALERT_WEBHOOK_URL = 'http://localhost:9999/hook';
    await expect(notifyOperator(alert)).resolves.toBe('sent');
    expect(fetchMock).toHaveBeenCalledWith('http://localhost:9999/hook', expect.any(Object));
  });
});

describe('notifyOperator: the message', () => {
  it('posts the same text in both text and content, under the billing prefix', async () => {
    await expect(notifyOperator(alert)).resolves.toBe('sent');

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(HOOK);
    expect(init.method).toBe('POST');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });

    const expected =
      '[HSC billing] New invoice request\n' +
      'School: Parramatta High School\n30 seats\nOpen Admin → Billing overview.';
    expect(postedBody()).toEqual({ text: expected, content: expected });
  });

  it('sends a title alone when there are no lines', async () => {
    await notifyOperator({ kind: 'refund', title: 'Refund issued' });
    expect(postedBody().text).toBe('[HSC billing] Refund issued');
  });

  it('truncates a long message to 1800 characters', async () => {
    const long = Array.from({ length: 6 }, () => 'x'.repeat(400));
    await notifyOperator({ kind: 'billing_incident', title: 'Long', lines: long });

    const { text, content } = postedBody();
    expect(text).toHaveLength(1800);
    expect(text.endsWith('…')).toBe(true);
    expect(content).toBe(text);
  });

  it('leaves a message of exactly 1800 characters untouched', async () => {
    const line = 'y'.repeat(1800 - '[HSC billing] T\n'.length);
    await notifyOperator({ kind: 'dispute', title: 'T', lines: [line] });
    expect(postedBody().text).toHaveLength(1800);
    expect(postedBody().text.endsWith('…')).toBe(false);
  });
});

describe('notifyOperator: failure never throws', () => {
  it('reports failed on a 500, and logs without the URL', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });

    await expect(notifyOperator(alert)).resolves.toBe('failed');
    expect(console.error).toHaveBeenCalledTimes(1);
    const logged = String(vi.mocked(console.error).mock.calls[0][0]);
    expect(logged).toContain('500');
    expect(logged).not.toContain('SECRETTOKEN');
    expect(logged).not.toContain('hooks.example.com');
  });

  it('reports failed when the request rejects, and does not log the host', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('getaddrinfo ENOTFOUND hooks.example.com'));

    await expect(notifyOperator(alert)).resolves.toBe('failed');
    const logged = String(vi.mocked(console.error).mock.calls[0][0]);
    expect(logged).toContain('TypeError');
    expect(logged).not.toContain('hooks.example.com');
    expect(logged).not.toContain('SECRETTOKEN');
  });

  it('gives up after four seconds and reports failed', async () => {
    vi.useFakeTimers();
    // A receiver that never answers: the request only ends when its signal aborts.
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        })
    );

    const pending = notifyOperator(alert);
    const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;

    await vi.advanceTimersByTimeAsync(3999);
    expect(signal.aborted).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toBe('failed');
    expect(signal.aborted).toBe(true);
    expect(String(vi.mocked(console.error).mock.calls[0][0])).toContain('timed out after 4000');
  });

  it('clears its timer on a fast answer, so nothing is left pending', async () => {
    vi.useFakeTimers();
    await expect(notifyOperator(alert)).resolves.toBe('sent');
    expect(vi.getTimerCount()).toBe(0);
  });
});
