/**
 * Deciding whether an address may be fetched by this server.
 */

import dns from "node:dns/promises";
import { toBytes, parseEntry, inRange } from "./ip-range.js";

/**
 * Ranges that live inside a network rather than out on the internet.
 */
const BLOCKED = [
  "0.0.0.0/8",
  "10.0.0.0/8",
  "127.0.0.0/8",
  "169.254.0.0/16",
  "172.16.0.0/12",
  "192.168.0.0/16",
  "::1/128",
  "fc00::/7",
  "fe80::/10",
].map(parseEntry);

/**
 * True when an address belongs to this server or its network
 */
export function isBlockedAddress(ip) {
  const bytes = toBytes(ip);
  if (!bytes) return true;
  return BLOCKED.some((entry) => inRange(entry, bytes));
}

/**
 * Strips the brackets an IPv6 host wears inside a URL.
 */
function bareHost(hostname) {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

/**
 * Builds the guard. The resolver is handed in so tests never touch the network.
 */
export function createUrlGuard({ lookup = (host) => dns.lookup(host, { all: true }) } = {}) {
  /**
   * Checks one address.
   */
  async function check(value) {
    let url;
    try {
      url = new URL(String(value ?? ""));
    } catch {
      return { ok: false, reason: "scheme", url: null };
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return { ok: false, reason: "scheme", url: null };
    }

    const host = bareHost(url.hostname);

    if (toBytes(host)) {
      return isBlockedAddress(host)
        ? { ok: false, reason: "private", url: null }
        : { ok: true, reason: null, url: url.href };
    }

    let addresses;
    try {
      addresses = await lookup(host);
    } catch {
      return { ok: false, reason: "unresolvable", url: null };
    }

    if (!addresses?.length) return { ok: false, reason: "unresolvable", url: null };

    if (addresses.some((entry) => isBlockedAddress(entry.address))) {
      return { ok: false, reason: "private", url: null };
    }

    return { ok: true, reason: null, url: url.href };
  }

  return { check };
}
