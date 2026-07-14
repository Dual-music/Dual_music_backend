/**
 * @file Server-side sanitizer for user-generated **plain-text** content
 * (chat messages, dedications, etc.).
 *
 * Dependency-free (no registry access). Strategy for plain text: strip active
 * HTML so nothing renders as markup, while preserving ordinary text —
 * `<script>`/`<style>` blocks are removed with their content, remaining HTML
 * tags are stripped (their inner text kept), and control characters are dropped.
 * Non-tag uses of `<` (e.g. `a < b`, `3<5`) are preserved because only
 * letter-initial tags are removed. This neutralizes stored-XSS vectors
 * regardless of how a client renders the value (web HTML or native).
 *
 * @module utils/sanitize
 */

// <script>…</script> / <style>…</style> with their content (case-insensitive).
const SCRIPT_STYLE_BLOCK = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
// A dangling, unclosed <script>/<style> running to end of input.
const SCRIPT_STYLE_OPEN = /<(script|style)\b[^>]*>[\s\S]*$/gi;
// Any remaining letter-initial HTML tag (opening or closing).
const HTML_TAG = /<\/?[a-zA-Z][^>]*>/g;

/**
 * Removes control characters, keeping only tab (9), newline (10) and carriage
 * return (13). Uses a codepoint filter to avoid embedding control bytes in
 * source.
 * @param {string} s
 * @returns {string}
 */
function stripControlChars(s) {
  let out = '';
  for (const ch of s) {
    const c = ch.codePointAt(0);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) out += ch;
  }
  return out;
}

/**
 * Sanitizes a plain-text string: removes active HTML + control characters,
 * trims, and caps the length.
 *
 * @param {unknown} input
 * @param {object} [opts]
 * @param {number} [opts.maxLength=4000]
 * @returns {string} The sanitized text (empty string for null/undefined).
 */
export function sanitizeText(input, { maxLength = 4000 } = {}) {
  if (input == null) return '';
  let s = String(input);
  s = stripControlChars(s);
  s = s.replace(SCRIPT_STYLE_BLOCK, '');
  s = s.replace(SCRIPT_STYLE_OPEN, '');
  s = s.replace(HTML_TAG, '');
  s = s.trim();
  if (s.length > maxLength) s = s.slice(0, maxLength);
  return s;
}

export default { sanitizeText };
