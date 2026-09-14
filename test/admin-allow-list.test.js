/**
 * Tests for the allow list that keeps the admin area private
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { JSDOM } from "jsdom";
import { createApp } from "../lib/app.js";
import { createThemeRepository } from "../repositories/theme-repository.js";
import { createCategoryRepository } from "../repositories/category-repository.js";
import { loadConfig } from "../config/index.js";
import { freshDb, SAMPLE } from "./helpers/db.js";

const ADMIN = {
  ADMIN_USERNAME: "chris",
  ADMIN_PASSWORD_HASH: "scrypt$c2FsdA==$a2V5",
  SESSION_SECRET: "a-secret",
};

function appWith(env) {
  const db = freshDb(SAMPLE);
  return createApp({
    config: loadConfig({ ...ADMIN, ...env }),
    themes: createThemeRepository(db),
    categories: createCategoryRepository(db),
  });
}

describe("the allow list setting", () => {
  it("is empty when nothing is configured", () => {
    assert.deepEqual(loadConfig(ADMIN).adminAllowedIps, []);
  });

  it("reads a comma separated list, ignoring spacing and empty entries", () => {
    const cfg = loadConfig({
      ...ADMIN,
      TRUST_PROXY: "1",
      ADMIN_ALLOWED_IPS: " 203.0.113.4 ,, 198.51.100.7,",
    });
    assert.deepEqual(cfg.adminAllowedIps, ["203.0.113.4", "198.51.100.7"]);
  });

  it("lowercases an address written in capitals", () => {
    const cfg = loadConfig({ ...ADMIN, TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "2001:DB8::1" });
    assert.deepEqual(cfg.adminAllowedIps, ["2001:db8::1"]);
  });

  it("strips the IPv4 in IPv6 prefix, which is how Node reports such an address", () => {
    const cfg = loadConfig({
      ...ADMIN,
      TRUST_PROXY: "1",
      ADMIN_ALLOWED_IPS: "::ffff:203.0.113.4",
    });
    assert.deepEqual(cfg.adminAllowedIps, ["203.0.113.4"]);
  });

  it("keeps a range as written, with the covered parts cleared", () => {
    const cfg = loadConfig({
      ...ADMIN,
      TRUST_PROXY: "1",
      ADMIN_ALLOWED_IPS: "192.168.1.77/24, 2001:db8::/32",
    });
    assert.deepEqual(cfg.adminAllowedIps, ["192.168.1.0/24", "2001:db8::/32"]);
  });

  it("refuses to start on an entry that is not an address or a range", () => {
    assert.throws(
      () => loadConfig({ ...ADMIN, TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "203.0.113.4, nonsense" }),
      /ADMIN_ALLOWED_IPS/
    );
    assert.throws(
      () => loadConfig({ ...ADMIN, TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "192.168.1.0/33" }),
      /ADMIN_ALLOWED_IPS/
    );
  });

  it("refuses to start when the list is set without TRUST_PROXY", () => {
    assert.throws(
      () => loadConfig({ ...ADMIN, ADMIN_ALLOWED_IPS: "203.0.113.4" }),
      /TRUST_PROXY/
    );
  });

  it("allows TRUST_PROXY on its own, for the login attempt count", () => {
    assert.equal(loadConfig({ ...ADMIN, TRUST_PROXY: "1" }).trustProxy, 1);
  });

  it("reads a hop count as a number and anything else as it stands", () => {
    assert.equal(loadConfig({ ...ADMIN, TRUST_PROXY: "2" }).trustProxy, 2);
    assert.equal(loadConfig({ ...ADMIN, TRUST_PROXY: "loopback" }).trustProxy, "loopback");
    assert.equal(loadConfig(ADMIN).trustProxy, false);
  });
});

describe("with no allow list", () => {
  it("shows the login page to anybody", async () => {
    const res = await request(appWith({})).get("/admin/login").expect(200);
    assert.ok(res.text.includes("Sign in to the dashboard."));
  });
});

describe("with an allow list that names this address", () => {
  const env = { TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "203.0.113.4, 127.0.0.1" };

  it("shows the login page", async () => {
    const res = await request(appWith(env)).get("/admin/login").expect(200);
    assert.ok(res.text.includes("Sign in to the dashboard."));
  });

  it("matches an address Node reports in its IPv4 in IPv6 form", async () => {
    const app = appWith({ TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "198.51.100.7" });
    await request(app)
      .get("/admin/login")
      .set("X-Forwarded-For", "::ffff:198.51.100.7")
      .expect(200);
  });
});

describe("with a range in the allow list", () => {
  it("lets in an address inside the range", async () => {
    await request(appWith({ TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "127.0.0.0/8" }))
      .get("/admin/login")
      .expect(200);
  });

  it("turns away an address outside it", async () => {
    await request(appWith({ TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "10.0.0.0/8" }))
      .get("/admin/login")
      .expect(403);
  });

  it("reads the range the proxy's address is judged against", async () => {
    const app = appWith({ TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "203.0.113.0/24" });
    await request(app).get("/admin/login").set("X-Forwarded-For", "203.0.113.99").expect(200);
    await request(app).get("/admin/login").set("X-Forwarded-For", "203.0.114.1").expect(403);
  });

  it("covers an IPv6 range", async () => {
    const app = appWith({ TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "2001:db8::/32" });
    await request(app).get("/admin/login").set("X-Forwarded-For", "2001:db8:5::9").expect(200);
    await request(app).get("/admin/login").set("X-Forwarded-For", "2001:db9::9").expect(403);
  });

  it("mixes ranges and exact addresses in one list", async () => {
    const app = appWith({
      TRUST_PROXY: "1",
      ADMIN_ALLOWED_IPS: "198.51.100.7, 203.0.113.0/24",
    });
    await request(app).get("/admin/login").set("X-Forwarded-For", "198.51.100.7").expect(200);
    await request(app).get("/admin/login").set("X-Forwarded-For", "203.0.113.8").expect(200);
    await request(app).get("/admin/login").set("X-Forwarded-For", "198.51.100.8").expect(403);
  });
});

describe("with an allow list that does not name this address", () => {
  const env = { TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "203.0.113.4" };

  it("refuses with 403 and never shows the login form", async () => {
    const res = await request(appWith(env)).get("/admin/login").expect(403);
    assert.ok(!res.text.includes("Sign in to the dashboard."));
    assert.ok(!res.text.includes('name="password"'));
  });

  it("says what happened, and names the address that was turned away", async () => {
    const res = await request(appWith(env)).get("/admin/login").expect(403);
    const doc = new JSDOM(res.text).window.document;
    assert.match(doc.querySelector("h1").textContent, /forbidden/i);
    assert.ok(doc.body.textContent.includes("127.0.0.1"));
  });

  it("keeps the page out of caches and out of search results", async () => {
    const res = await request(appWith(env)).get("/admin/login").expect(403);
    assert.equal(res.headers["cache-control"], "no-store");
    assert.equal(res.headers["x-robots-tag"], "noindex");
  });

  it("refuses every route under /admin, the login attempt included", async () => {
    const app = appWith(env);
    await request(app).get("/admin").expect(403);
    await request(app).get("/admin/themes").expect(403);
    await request(app).get("/admin/categories").expect(403);
    await request(app).post("/admin/login").type("form").send({ username: "chris" }).expect(403);
    await request(app).post("/admin/logout").expect(403);
    await request(app).post("/admin/themes").expect(403);
  });

  it("leaves the public page alone", async () => {
    const app = appWith(env);
    await request(app).get("/").expect(200);
    await request(app).get("/health").expect(200);
    await request(app).get("/media/theme/1").expect(200);
  });

  it("lets in an address the proxy reports as allowed", async () => {
    await request(appWith(env))
      .get("/admin/login")
      .set("X-Forwarded-For", "203.0.113.4")
      .expect(200);
  });
});
