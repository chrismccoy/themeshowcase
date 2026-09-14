/**
 * Matched pair forgery protection.
 */

import crypto from "node:crypto";
import { parseCookies } from "../lib/cookies.js";
import { safeEqual } from "../lib/password.js";

const COOKIE_NAME = "csrf";

const TOKEN_BYTES = 32;

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function carriesCsrfToken(req) {
  const cookies = parseCookies(req.headers.cookie);
  const expected = cookies[COOKIE_NAME];
  const sent = req.body?._csrf;

  return Boolean(expected) && Boolean(sent) && safeEqual(sent, expected);
}

export function requireCsrf(req, res, next) {
  if (carriesCsrfToken(req)) return next();
  return res.status(403).type("txt").send("Request could not be verified. Please try again.");
}

export function csrf({ isProduction = false } = {}) {
  return function checkForgery(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    let token = cookies[COOKIE_NAME];

    if (!token) {
      token = crypto.randomBytes(TOKEN_BYTES).toString("base64url");
      const parts = [`${COOKIE_NAME}=${token}`, "Path=/", "HttpOnly", "SameSite=Lax"];
      if (isProduction) parts.push("Secure");
      res.append("Set-Cookie", parts.join("; "));
    }

    res.locals.csrfToken = token;

    if (READ_METHODS.has(req.method.toUpperCase())) return next();

    if ((req.get("content-type") ?? "").startsWith("multipart/form-data")) return next();

    if (carriesCsrfToken(req)) return next();

    return res.status(403).type("txt").send("Request could not be verified. Please try again.");
  };
}
