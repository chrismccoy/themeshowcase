import { parseCookies } from "../lib/cookies.js";

export function isSignedIn(sessions, req) {
  const cookies = parseCookies(req.headers.cookie);
  return sessions.verify(cookies[sessions.COOKIE_NAME]);
}

export function requireAdmin(sessions) {
  return function guard(req, res, next) {
    if (isSignedIn(sessions, req)) return next();
    return res.redirect("/admin/login");
  };
}
