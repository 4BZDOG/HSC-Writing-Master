import { verifyRequestAuth } from './_lib/auth';
import { corsHeadersFor } from './_lib/cors';

/**
 * Vercel serverless function: POST /api/fetch-url
 *
 * Fetches a public URL server-side and returns the extracted text content.
 * This replaces the previous Gemini `googleSearch` grounding approach which
 * consumed a separate (often tiny) quota. The server fetches the page, strips
 * HTML to plain text, and returns it to the client for AI parsing.
 */

interface RequestLike {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
}
interface ResponseLike {
  status: (code: number) => ResponseLike;
  json: (data: unknown) => void;
  setHeader?: (name: string, value: string) => void;
  end?: () => void;
}

const headerValue = (raw: string | string[] | undefined): string | undefined =>
  Array.isArray(raw) ? raw[0] : raw;

const ALLOWED_HOSTS = [
  'educationstandards.nsw.edu.au',
  'curriculum.nsw.edu.au',
  'syllabus.nesa.nsw.edu.au',
  'www.boardofstudies.nsw.edu.au',
];

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ALLOWED_HOSTS.some((h) => parsed.hostname === h || parsed.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

function stripHtmlToText(html: string): string {
  let text = html;
  // Remove script/style blocks
  text = text.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<nav[\s\S]*?<\/nav>/gi, '');
  text = text.replace(/<footer[\s\S]*?<\/footer>/gi, '');
  text = text.replace(/<header[\s\S]*?<\/header>/gi, '');
  // Convert list items and headings to newlines
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n');
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, ' ');
  // Decode entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&rsquo;/g, '’');
  text = text.replace(/&lsquo;/g, '‘');
  text = text.replace(/&rdquo;/g, '”');
  text = text.replace(/&ldquo;/g, '“');
  text = text.replace(/&ndash;/g, '–');
  text = text.replace(/&mdash;/g, '—');
  text = text.replace(/&#\d+;/g, '');
  // Collapse whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n\s*\n/g, '\n');
  return text.trim();
}

export default async function handler(req: RequestLike, res: ResponseLike): Promise<void> {
  const cors = corsHeadersFor(headerValue(req.headers?.origin), process.env.ALLOWED_ORIGIN);
  if (cors && res.setHeader) {
    for (const [name, value] of Object.entries(cors)) res.setHeader(name, value);
  }
  if (req.method === 'OPTIONS') {
    if (cors && res.end) {
      res.status(204);
      res.end();
    } else {
      res.status(403).json({ error: 'Cross-origin access is not enabled for this origin.' });
    }
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  const authHeader = headerValue(req.headers?.authorization);
  const auth = await verifyRequestAuth(authHeader);
  if (!auth.ok) {
    res.status(auth.status ?? 401).json({ error: auth.error ?? 'Unauthorized.' });
    return;
  }

  const { url } = (req.body || {}) as { url?: string };
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'Missing `url` in request body.' });
    return;
  }

  if (!isAllowedUrl(url)) {
    res.status(400).json({
      error:
        'Only NESA/NSW Education syllabus URLs are supported. Paste the page URL from educationstandards.nsw.edu.au or curriculum.nsw.edu.au.',
    });
    return;
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; HSCWritingMaster/1.0; +https://github.com/4BZDOG/HSC-Writing-Master)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      res
        .status(502)
        .json({ error: `The syllabus page returned HTTP ${response.status}. Try again later.` });
      return;
    }

    const html = await response.text();
    const text = stripHtmlToText(html);

    if (text.length < 50) {
      res.status(502).json({
        error:
          "Couldn't extract meaningful text from that page. The page may require JavaScript or be structured differently. Try pasting the content manually.",
      });
      return;
    }

    // Cap at 100k chars to avoid absurdly large responses
    res.status(200).json({ text: text.slice(0, 100000) });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg.includes('timeout') || msg.includes('abort')) {
      res.status(504).json({ error: 'The syllabus page took too long to respond.' });
    } else {
      res.status(502).json({ error: `Failed to fetch the URL: ${msg}` });
    }
  }
}
