import { verifyRequestAuth } from './_lib/auth';
import { corsHeadersFor } from './_lib/cors';
import { nesaPageToText, nesaStartPage, parseNesaPage } from './_lib/nesaCurriculum';

/**
 * Vercel serverless function: POST /api/fetch-url
 *
 * Fetches a public URL server-side and returns the extracted text content.
 * This replaces the previous Gemini `googleSearch` grounding approach which
 * consumed a separate (often tiny) quota. The server fetches the page, strips
 * HTML to plain text, and returns it to the client for AI parsing.
 *
 * A NESA syllabus page on curriculum.nsw.edu.au is read from the CMS record the
 * page embeds instead, which carries the exact wording. Its structured form is
 * returned as `nesa` alongside the text, so the client need not ask an AI to
 * re-read the text.
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

// NESA's syllabus pages moved under www.nsw.gov.au. Only that section is a syllabus
// source; the rest of the NSW government site is not something this reader should fetch.
const NESA_ON_NSW_GOV = { host: 'www.nsw.gov.au', pathPrefix: '/education-and-training/nesa/' };

const USER_AGENT =
  'Mozilla/5.0 (compatible; HSCWritingMaster/1.0; +https://github.com/4BZDOG/HSC-Writing-Master)';

function isAllowedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === NESA_ON_NSW_GOV.host) {
      // The path is checked after URL normalisation, so a "../" cannot climb out of the section.
      return parsed.pathname.startsWith(NESA_ON_NSW_GOV.pathPrefix);
    }
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
        'User-Agent': USER_AGENT,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      // 401/403/429 is the page refusing an automated reader, which is what
      // most NESA pages do behind their CDN. "Try again later" is wrong for
      // those — waiting changes nothing, and the person is left retrying a
      // thing that cannot start working. Say what to do instead.
      const refused = [401, 403, 429].includes(response.status);
      res.status(502).json({
        error: refused
          ? `That page refused an automated reader (HTTP ${response.status}). Open it in your browser, select the syllabus text and paste it in below.`
          : `The syllabus page returned HTTP ${response.status}. Try again in a moment.`,
      });
      return;
    }

    // The whole document goes to the parser: the CMS record is most of a 2–3 MB page,
    // and slicing first could cut it off before the end.
    let html = await response.text();
    let pageUrl = url;

    if (new URL(url).hostname === 'curriculum.nsw.edu.au') {
      // A syllabus's own address holds no content; follow it, once, to the first focus
      // area, whose sibling list then offers the rest of the syllabus.
      const start = nesaStartPage(html, url);
      if (start && isAllowedUrl(start)) {
        const next = await fetch(start, {
          headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
          redirect: 'follow',
          signal: AbortSignal.timeout(15000),
        }).catch(() => null);
        if (next?.ok) {
          html = await next.text();
          pageUrl = start;
        }
      }
      const nesa = parseNesaPage(html, pageUrl);
      // Only a page that yields statements or outcomes counts. Anything else, such as a
      // landing page or an unfamiliar layout, keeps the generic path below.
      if (nesa && (nesa.outcomes.length > 0 || nesa.groups.some((g) => g.statements.length > 0))) {
        res.status(200).json({ text: nesaPageToText(nesa).slice(0, 100000), nesa });
        return;
      }
    }

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
