/**
 * Tests for the signed session cookie.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createSessions } from "../lib/session.js";

const NOW = 1_700_000_000_000;

function sessions(overrides = {}) {
  return createSessions({
    secret: "a-secret",
    ttlHours: 1,
    isProduction: false,
    ...overrides,
  });
}

describe("createSessions.issue and verify", () => {
  it("accepts a value it issued", () => {
    const s = sessions();
    assert.equal(s.verify(s.issue(NOW), NOW), true);
  });

  it("refuses a value whose expiry has been moved", () => {
    const s = sessions();
    const issued = s.issue(NOW);
    const [expiry, signature] = issued.split(".");
    const later = `${Number(expiry) + 60_000}.${signature}`;
    assert.equal(s.verify(later, NOW), false);
  });

  it("refuses a value signed with a different secret", () => {
    const mine = sessions();
    const theirs = sessions({ secret: "another-secret" });
    assert.equal(mine.verify(theirs.issue(NOW), NOW), false);
  });

  it("refuses a value that has expired", () => {
    const s = sessions();
    const issued = s.issue(NOW);
    assert.equal(s.verify(issued, NOW + 61 * 60 * 1000), false);
  });

  it("still accepts a value a moment before it expires", () => {
    const s = sessions();
    const issued = s.issue(NOW);
    assert.equal(s.verify(issued, NOW + 59 * 60 * 1000), true);
  });

  it("refuses rubbish rather than throwing", () => {
    const s = sessions();
    for (const bad of ["", "nonsense", "1.2.3", `${NOW}.`, ".abc", undefined, null]) {
      assert.equal(s.verify(bad, NOW), false);
    }
  });

  it("does not extend a session just because it was used", () => {
    const s = sessions();
    const first = s.issue(NOW);
    assert.equal(s.verify(first, NOW + 30 * 60 * 1000), true);
    assert.equal(s.verify(first, NOW + 61 * 60 * 1000), false);
  });
});

describe("createSessions cookie headers", () => {
  it("keeps the cookie away from scripts and from other sites", () => {
    const header = sessions().setCookieHeader("value");
    assert.ok(header.startsWith("admin_session=value"));
    assert.ok(header.includes("HttpOnly"));
    assert.ok(header.includes("SameSite=Lax"));
    assert.ok(header.includes("Path=/"));
    assert.ok(header.includes("Max-Age=3600"));
  });

  it("asks for a secure connection only in production", () => {
    assert.ok(!sessions().setCookieHeader("value").includes("Secure"));
    assert.ok(sessions({ isProduction: true }).setCookieHeader("value").includes("Secure"));
  });

  it("clears the cookie by expiring it immediately", () => {
    const header = sessions().clearCookieHeader();
    assert.ok(header.startsWith("admin_session=;"));
    assert.ok(header.includes("Max-Age=0"));
    assert.ok(header.includes("HttpOnly"));
  });
});
