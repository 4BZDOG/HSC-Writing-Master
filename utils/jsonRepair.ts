/**
 * Best-effort repair of malformed JSON that teachers paste or export from
 * tools that don't produce strict JSON (trailing commas, single quotes,
 * semicolons instead of commas, unquoted keys, JS-style comments, missing
 * closing brackets).
 *
 * Returns `{ data, repaired }` — `repaired` is true when the raw text
 * failed `JSON.parse` but the patched version succeeded, so callers can
 * surface a "we fixed some issues" notice.
 *
 * The repair is deliberately conservative: it only applies transformations
 * that are unambiguous in a JSON context. If repair still fails, `data` is
 * null and the caller should show the parse error.
 */
export const parseJsonWithRepair = (
  raw: string
): { data: unknown; repaired: boolean; error?: string } => {
  // Fast path — valid JSON, no repair needed.
  try {
    return { data: JSON.parse(raw), repaired: false };
  } catch {
    // fall through to repair
  }

  let text = raw.trim();

  // 1. Strip JS-style comments (// line and /* block */).
  //    Done first because comments can mask other issues.
  text = text.replace(/\/\*[\s\S]*?\*\//g, '');
  text = text.replace(/\/\/[^\n]*/g, '');

  // 2. Replace semicolons used as value separators with commas.
  //    Only target semicolons that sit between a value-end token
  //    and a value-start token (to avoid mangling strings).
  //    Includes ' because single→double quote conversion runs later.
  text = text.replace(/(["\d\]}\w'])\s*;\s*(?=["\d[{A-Za-z_'-])/g, '$1,');

  // 3. Single-quoted strings → double-quoted strings.
  //    Walk character-by-character to avoid mangling apostrophes
  //    inside double-quoted strings.
  text = replaceSingleQuotes(text);

  // 4. Unquoted keys: { key: "value" } → { "key": "value" }
  text = text.replace(/([{,]\s*)([A-Za-z_$][A-Za-z0-9_$]*)\s*:/g, '$1"$2":');

  // 5. Trailing commas before } or ].
  text = text.replace(/,\s*([}\]])/g, '$1');

  // 6. Missing commas between values.
  //    A closing quote/digit/bracket immediately followed (after optional
  //    whitespace that includes a newline) by an opening quote/digit/bracket
  //    or a key — with no comma between them.
  text = text.replace(/(["\d\]}\w])\s*\n\s*(?=["{[\dA-Za-z_-])/g, '$1,\n');

  // 7. Missing closing brackets — count unmatched openers outside strings
  //    and append the needed closers.
  text = balanceBrackets(text);

  try {
    return { data: JSON.parse(text), repaired: true };
  } catch (e) {
    return {
      data: null,
      repaired: false,
      error: e instanceof Error ? e.message : 'Failed to parse JSON file.',
    };
  }
};

/**
 * Replace single-quoted string literals with double-quoted ones, handling
 * escaped single quotes inside them and leaving apostrophes inside
 * double-quoted strings untouched.
 */
const replaceSingleQuotes = (text: string): string => {
  const chars: string[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i];

    // Skip double-quoted strings entirely (they might contain apostrophes).
    if (ch === '"') {
      chars.push(ch);
      i++;
      while (i < text.length && text[i] !== '"') {
        if (text[i] === '\\') {
          chars.push(text[i], text[i + 1] ?? '');
          i += 2;
        } else {
          chars.push(text[i]);
          i++;
        }
      }
      if (i < text.length) {
        chars.push(text[i]); // closing "
        i++;
      }
      continue;
    }

    // Single-quoted string → convert to double-quoted.
    if (ch === "'") {
      chars.push('"');
      i++;
      while (i < text.length && text[i] !== "'") {
        if (text[i] === '\\' && text[i + 1] === "'") {
          // \' inside single-quoted string → just '
          chars.push("'");
          i += 2;
        } else if (text[i] === '"') {
          // Unescaped double quote inside a single-quoted string needs escaping.
          chars.push('\\"');
          i++;
        } else if (text[i] === '\\') {
          chars.push(text[i], text[i + 1] ?? '');
          i += 2;
        } else {
          chars.push(text[i]);
          i++;
        }
      }
      chars.push('"'); // closing converted quote
      if (i < text.length) i++; // skip closing '
      continue;
    }

    chars.push(ch);
    i++;
  }
  return chars.join('');
};

/**
 * Count unmatched `[`/`{` and append the needed `]`/`}` closers.
 * Only considers characters outside string literals.
 */
const balanceBrackets = (text: string): string => {
  const stack: string[] = [];
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '[' || ch === '{') {
      stack.push(ch === '[' ? ']' : '}');
    } else if (ch === ']' || ch === '}') {
      if (stack.length > 0 && stack[stack.length - 1] === ch) {
        stack.pop();
      }
    }
  }

  // Append closers in reverse (innermost first).
  return text + stack.reverse().join('');
};
