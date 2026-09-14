/**
 * Tests for a not found address
 */

import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { JSDOM } from "jsdom";
import { createApp } from "../lib/app.js";
import { createThemeRepository } from "../repositories/theme-repository.js";
import { createCategoryRepository } from "../repositories/category-repository.js";
import { loadConfig } from "../config/index.js";
import { hashPassword } from "../lib/password.js";
import { freshDb, SAMPLE } from "./helpers/db.js";

const PASSWORD = "correct horse battery staple";

function appWith(env = {}) {
  const db = freshDb(SAMPLE);
  return createApp({
    config: loadConfig({
      ADMIN_USERNAME: "chris",
      ADMIN_PASSWORD_HASH: hashPassword(PASSWORD),
      SESSION_SECRET: "a-secret-for-tests",
      ...env,
    }),
    themes: createThemeRepository(db),
    categories: createCategoryRepository(db),
  });
}

let app;

beforeEach(() => {
  app = appWith();
});

async function signIn(target = app) {
  const page = await request(target).get("/admin/login").expect(200);
  const csrfCookie = (page.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
  const token = /name="_csrf" value="([^"]+)"/.exec(page.text)[1];

  const res = await request(target)
    .post("/admin/login")
    .set("Cookie", csrfCookie)
    .type("form")
    .send({ _csrf: token, username: "chris", password: PASSWORD })
    .expect(302);

  const session = (res.headers["set-cookie"] ?? [])
    .find((c) => c.startsWith("admin_session="))
    .split(";")[0];

  return `${session}; ${csrfCookie}`;
}

describe("an address nobody serves", () => {
  it("answers 404 rather than anything else", async () => {
    await request(app).get("/laksslaksakl").expect(404);
  });

  it("is a real page, not the bare one the framework falls back to", async () => {
    const res = await request(app).get("/laksslaksakl").expect(404);
    const doc = new JSDOM(res.text).window.document;
    assert.match(doc.querySelector("h1").textContent, /not found/i);
    assert.ok(!res.text.includes("Cannot GET"));
  });

  it("offers the way back to the previewer", async () => {
    const res = await request(app).get("/laksslaksakl").expect(404);
    const doc = new JSDOM(res.text).window.document;
    const home = [...doc.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/");
    assert.ok(home, "there should be a link home");
  });

  it("does not repeat the address back", async () => {
    const res = await request(app).get("/laksslaksakl").expect(404);
    assert.ok(!res.text.includes("laksslaksakl"));
  });

  it("is not kept by any cache", async () => {
    const res = await request(app).get("/laksslaksakl").expect(404);
    assert.equal(res.headers["cache-control"], "no-store");
  });

  it("answers a post to nowhere the same way", async () => {
    await request(app).post("/laksslaksakl").type("form").send({ a: "b" }).expect(404);
  });

  it("keeps the answer short for anything that did not ask for a page", async () => {
    const res = await request(app)
      .get("/js/there-is-no-such-script.js")
      .set("Accept", "text/javascript")
      .expect(404);
    assert.match(res.headers["content-type"], /text\/plain/);
    assert.ok(!res.text.includes("<html"));
  });
});

describe("an address nobody serves under the dashboard", () => {
  it("answers 404 in the dashboard's own language", async () => {
    const res = await request(app)
      .get("/admin/nope")
      .set("Cookie", await signIn())
      .expect(404);
    const doc = new JSDOM(res.text).window.document;
    assert.match(doc.querySelector("h1").textContent, /not found/i);
    assert.ok(!res.text.includes("Cannot GET"));
  });

  it("offers the way back to the dashboard when signed in", async () => {
    const res = await request(app)
      .get("/admin/nope")
      .set("Cookie", await signIn())
      .expect(404);
    const doc = new JSDOM(res.text).window.document;
    const back = [...doc.querySelectorAll("a")].find((a) => a.getAttribute("href") === "/admin");
    assert.ok(back, "there should be a link to the dashboard");
  });

  it("offers the sign in page instead when signed out", async () => {
    const res = await request(app).get("/admin/nope").expect(404);
    const doc = new JSDOM(res.text).window.document;
    const back = [...doc.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    assert.ok(back.includes("/admin/login"));
    assert.ok(!back.includes("/admin"), "a signed out visitor has no dashboard to go back to");
  });

  it("tells nobody outside the allow list even that much", async () => {
    const guarded = appWith({ TRUST_PROXY: "1", ADMIN_ALLOWED_IPS: "203.0.113.4" });
    await request(guarded).get("/admin/nope").expect(403);
  });
});
