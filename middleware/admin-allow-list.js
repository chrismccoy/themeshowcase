/**
 * Keeps the admin area to a list of known addresses.
 */

import { normalizeIp } from "../config/index.js";
import { parseEntry, matchesAny } from "../lib/ip-range.js";

export function adminAllowList(allowed) {
  const entries = allowed.map(parseEntry);

  return function guard(req, res, next) {
    if (!entries.length) return next();

    const address = normalizeIp(req.ip);
    if (matchesAny(entries, address)) return next();

    res.status(403);
    res.set("Cache-Control", "no-store");
    res.set("X-Robots-Tag", "noindex");
    return res.render("admin/forbidden", { title: "Forbidden", address });
  };
}
