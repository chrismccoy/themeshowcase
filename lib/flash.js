/**
 * The message shown once after a save
 */

import crypto from "node:crypto";
import { safeEqual } from "./password.js";

export const COOKIE_NAME = "flash";

/**
 * Parse the cookie from the Cookie header.
 */
function parseOne(header) {
  if (typeof header !== "string") return null;

  for (const part of header.split(";")) {
    const at = part.indexOf("=");
    if (at < 1) continue;
    if (part.slice(0, at).trim() !== COOKIE_NAME) continue;

    try {
      return decodeURIComponent(part.slice(at + 1).trim());
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Builds the message
 */
export function createFlash(secret) {
  /**
   * Signs a message.
   */
  function sign(message) {
    return crypto.createHmac("sha256", secret).update(message).digest("base64url");
  }

  /**
   * The Set-Cookie header carrying a message.
   */
  function setCookieHeader(message, kind = "ok") {
    const payload = `${kind}:${message}`;
    const value = encodeURIComponent(`${payload}.${sign(payload)}`);
    return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=30`;
  }

  /**
   * The Set-Cookie header that removes the message.
   */
  function clearCookieHeader() {
    return `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
  }

  function read(cookieHeader) {
    const raw = parseOne(cookieHeader);
    if (!raw) return null;

    const at = raw.lastIndexOf(".");
    if (at < 1) return null;

    const payload = raw.slice(0, at);
    const signature = raw.slice(at + 1);
    if (!safeEqual(signature, sign(payload))) return null;

    const colon = payload.indexOf(":");
    if (colon < 1) return null;

    return { kind: payload.slice(0, colon), message: payload.slice(colon + 1) };
  }

  return { setCookieHeader, clearCookieHeader, read, COOKIE_NAME };
}
