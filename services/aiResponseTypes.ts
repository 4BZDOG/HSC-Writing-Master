/**
 * The two things the browser needed from `@google/genai`, without the SDK.
 *
 * The client never talks to a provider directly — every call goes through the
 * `/api/gemini` proxy (see aiCore.ts), which is where the real SDK lives and
 * where the API key is. Yet the whole 266 kB client SDK was being bundled and
 * eagerly preloaded on first paint, for exactly two imports:
 *
 *   - `Type`, an eight-value string enum used to describe response schemas.
 *   - `GenerateContentResponse`, used only in type positions.
 *
 * Both are reproduced here. `Type`'s values are the strings the REST API
 * expects on the wire, so they are the contract rather than an implementation
 * detail of the SDK — copying them changes nothing about what is sent. The
 * response shape is declared structurally, covering the fields this app reads.
 *
 * `api/_lib/generate.ts` still imports the real SDK; that runs server-side and
 * is never bundled for the browser.
 */

/** Schema value types, matching the Gemini REST API's `Type` enum on the wire. */
export const Type = {
  TYPE_UNSPECIFIED: 'TYPE_UNSPECIFIED',
  STRING: 'STRING',
  NUMBER: 'NUMBER',
  INTEGER: 'INTEGER',
  BOOLEAN: 'BOOLEAN',
  ARRAY: 'ARRAY',
  OBJECT: 'OBJECT',
  NULL: 'NULL',
} as const;

export type Type = (typeof Type)[keyof typeof Type];

/**
 * What the proxy returns, as far as this app reads it. Deliberately loose about
 * everything else: the response travels as JSON over our own endpoint, so
 * anything not listed here is passed through untouched.
 */
export interface GenerateContentResponse {
  text?: string;
  candidates?: {
    finishReason?: string;
    content?: { parts?: { text?: string }[] };
    [key: string]: unknown;
  }[];
  usageMetadata?: {
    totalTokenCount?: number;
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}
