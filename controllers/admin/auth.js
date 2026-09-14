/**
 * Signing in and out.
 */

import { verifyPassword, safeEqual } from "../../lib/password.js";
import { isSignedIn } from "../../middleware/require-admin.js";

const REFUSAL = "Username or password is incorrect.";

/**
 * Builds the login and logout handlers.
 */
export function createAuthController({ config, sessions, rateLimit }) {
  /**
   * Shows the login page.
   */
  function showLogin(req, res) {
    if (isSignedIn(sessions, req)) return res.redirect("/admin");
    return res.render("admin/login", { title: "Log in", error: null });
  }

  /**
   * Checks the login/password
   */
  function login(req, res) {
    const username = String(req.body?.username ?? "");
    const password = String(req.body?.password ?? "");

    const userOk = safeEqual(username, config.adminUsername);
    const passOk = verifyPassword(password, config.adminPasswordHash);

    if (userOk && passOk) {
      rateLimit.clear(req);
      res.append("Set-Cookie", sessions.setCookieHeader(sessions.issue()));
      return res.redirect("/admin");
    }

    rateLimit.recordFailure(req);
    return res.status(401).render("admin/login", { title: "Log in", error: REFUSAL });
  }

  /**
   * Clears the session.
   */
  function logout(req, res) {
    res.append("Set-Cookie", sessions.clearCookieHeader());
    return res.redirect("/admin/login");
  }

  return { showLogin, login, logout };
}
