/**
 * Operator alerts: a short message to the platform operator when something needs a
 * person to act on it (an invoice request waiting for approval, a billing incident).
 * The message goes to an incoming webhook (Slack, Discord or Mattermost style), set in
 * BILLING_ALERT_WEBHOOK_URL. Unset, nothing is sent and nothing else changes.
 *
 * Best effort, and it never throws. Callers await it, because a serverless function is
 * frozen once it has responded and a fire-and-forget request would be lost. The timeout
 * bounds the wait. A failed or slow alert must never change the caller's answer.
 *
 * PII rule: lines may carry the school name, seat count, PO number, kind and amounts.
 * Never the billing email, ABN, address, free-text note, or a person's name or email.
 * The webhook URL is a secret, so it is never logged.
 */

export type OperatorAlertKind = 'invoice_request' | 'billing_incident' | 'dispute' | 'refund';

export interface OperatorAlert {
  kind: OperatorAlertKind;
  title: string;
  lines?: string[];
}

export type OperatorAlertOutcome = 'sent' | 'skipped' | 'failed';

/** How long the alert may hold up the caller. */
const TIMEOUT_MS = 4000;

/** Longest message sent. Slack and Discord both refuse much longer bodies. */
const MESSAGE_MAX = 1800;

/**
 * https only. Plain http is allowed for localhost and 127.0.0.1, so a developer can point
 * it at a local receiver. Anything else (including an unparseable value) is refused.
 */
const isAllowedUrl = (raw: string): boolean => {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1');
};

/** The error's class name only. The message can carry the host, so it is not logged. */
const errorName = (e: unknown): string => (e instanceof Error ? e.name : 'unknown error');

const buildMessage = (alert: OperatorAlert): string => {
  const text = [`[HSC billing] ${alert.title}`, ...(alert.lines ?? [])].join('\n');
  return text.length > MESSAGE_MAX ? `${text.slice(0, MESSAGE_MAX - 1)}…` : text;
};

/**
 * Posts the alert. Returns 'skipped' when no valid webhook is configured, 'sent' on a 2xx,
 * and 'failed' for anything else. The error text is not logged in full, because a network
 * error can name the host, and the host is part of the secret URL.
 */
export async function notifyOperator(alert: OperatorAlert): Promise<OperatorAlertOutcome> {
  const url = process.env.BILLING_ALERT_WEBHOOK_URL?.trim();
  if (!url) return 'skipped';
  if (!isAllowedUrl(url)) {
    console.warn(
      '[operator-alert] BILLING_ALERT_WEBHOOK_URL must be an https:// URL. No alert was sent.'
    );
    return 'skipped';
  }

  const message = buildMessage(alert);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message, content: message }),
      signal: controller.signal,
    });
    if (!response.ok) {
      console.error(`[operator-alert] ${alert.kind} alert refused with HTTP ${response.status}.`);
      return 'failed';
    }
    return 'sent';
  } catch (e) {
    const reason = controller.signal.aborted ? `timed out after ${TIMEOUT_MS} ms` : errorName(e);
    console.error(`[operator-alert] ${alert.kind} alert not sent: ${reason}.`);
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}
