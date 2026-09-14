/**
 * Reading the Cookie header.
 */

/**
 * Reads a Cookie header into an object.
 */
export function parseCookies(header) {
  if (typeof header !== "string" || !header.trim()) return {};

  const out = {};

  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 1) continue;

    const name = part.slice(0, at).trim();
    if (!name) continue;

    const raw = part.slice(at + 1).trim();
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }

  return out;
}
