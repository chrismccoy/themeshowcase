/**
 * Embedding JSON inside a `<script>` element.
 */

/**
 * Serializes state for the inlined `<script type="application/json">` block.
 */
export function safeJson(value) {
  const replacements = {
    "<": "\\u003c",
    ">": "\\u003e",
    "&": "\\u0026",
    "\u2028": "\\u2028",
    "\u2029": "\\u2029",
  };
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (c) => replacements[c]);
}
