/**
 * Pulls the first complete JSON object out of an LLM reply. Models wrap JSON in
 * ```json fences or add a sentence before/after it often enough that a bare
 * JSON.parse is not safe to rely on. Throws if no parseable object is found —
 * callers must treat that as a failure, never as a default answer.
 */
export function extractJsonObject(text: string): unknown {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    // fall through to scanning
  }

  for (let start = trimmed.indexOf('{'); start !== -1; start = trimmed.indexOf('{', start + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < trimmed.length; i++) {
      const ch = trimmed[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}' && --depth === 0) {
        try {
          return JSON.parse(trimmed.slice(start, i + 1));
        } catch {
          break; // not valid from this '{' — try the next one
        }
      }
    }
  }
  throw new Error('Model reply did not contain a valid JSON object.');
}
