/**
 * The signed session cookie. Nothing is stored on the server
 */

import crypto from "node:crypto";
import { safeEqual } from "./password.js";

/**
 * The cookie's name.
 */
export const COOKIE_NAME = "admin_session";

/**
 * Builds the session for a secret and a lifetime.
 */
export function createSessions({ secret, ttlHours, isProduction }) {
  const ttlMs = ttlHours * 60 * 60 * 1000;

  /**
   * Set an expiry.
   */
  function sign(expiry) {
    return crypto.createHmac("sha256", secret).update(String(expiry)).digest("base64url");
  }

  /**
   * The cookie value for a session starting
   */
  function issue(now = Date.now()) {
    const expiry = now + ttlMs;
    return `${expiry}.${sign(expiry)}`;
  }

  /**
   * Check if a cookie was issued
   */
  function verify(value, now = Date.now()) {
    if (typeof value !== "string") return false;

    const at = value.indexOf(".");
    if (at < 1) return false;

    const expiry = value.slice(0, at);
    const signature = value.slice(at + 1);
    if (!signature) return false;

    if (!safeEqual(signature, sign(expiry))) return false;

    const expiresAt = Number(expiry);
    return Number.isFinite(expiresAt) && now < expiresAt;
  }

  /**
   * Set a session
   */
  function setCookieHeader(value) {
    const parts = [
      `${COOKIE_NAME}=${value}`,
      "Path=/",
      "HttpOnly",
      "SameSite=Lax",
      `Max-Age=${Math.floor(ttlMs / 1000)}`,
    ];
    if (isProduction) parts.push("Secure");
    return parts.join("; ");
  }

  /**
   * Remove a session
   */
  function clearCookieHeader() {
    const parts = [`${COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
    if (isProduction) parts.push("Secure");
    return parts.join("; ");
  }

  return { issue, verify, setCookieHeader, clearCookieHeader, COOKIE_NAME };
}
