/**
 * Tests for signing in and out.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../lib/app.js";
import { createThemeRepository } from "../repositories/theme-repository.js";
import { createCategoryRepository } from "../repositories/category-repository.js";
import { loadConfig } from "../config/index.js";
import { hashPassword } from "../lib/password.js";
import { freshDb, SAMPLE } from "./helpers/db.js";

const PASSWORD = "correct horse battery staple";

const CONFIG = loadConfig({
  ADMIN_USERNAME: "chris",
  ADMIN_PASSWORD_HASH: hashPassword(PASSWORD),
  SESSION_SECRET: "a-secret-for-tests",
});

function app(config = CONFIG) {
  const db = freshDb(SAMPLE);
  return createApp({
    config,
    themes: createThemeRepository(db),
    categories: createCategoryRepository(db),
  });
}

async function loginPage(a) {
  const res = await request(a).get("/admin/login").expect(200);
  const cookie = (res.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
  const token = /name="_csrf" value="([^"]+)"/.exec(res.text)[1];
  return { cookie, token };
}

const sessionCookieFrom = (res) =>
  (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("admin_session="));

async function signIn(a) {
  const { cookie, token } = await loginPage(a);
  const res = await request(a)
    .post("/admin/login")
    .set("Cookie", cookie)
    .type("form")
    .send({ _csrf: token, username: "chris", password: PASSWORD })
    .expect(302);
  return { session: sessionCookieFrom(res).split(";")[0], cookie, token };
}

describe("GET /admin/login", () => {
  it("renders the login panel", async () => {
    const res = await request(app()).get("/admin/login").expect(200);
    assert.ok(res.text.includes("Sign in"));
    assert.ok(res.text.includes('name="username"'));
    assert.ok(res.text.includes('name="password"'));
  });

  it("carries a forgery token and asks not to be indexed", async () => {
    const res = await request(app()).get("/admin/login").expect(200);
    assert.match(res.text, /name="_csrf" value="[^"]+"/);
    assert.ok(res.text.includes('content="noindex, nofollow"'));
  });
});

describe("POST /admin/login", () => {
  it("signs in with the right credentials", async () => {
    const a = app();
    const { cookie, token } = await loginPage(a);
    const res = await request(a)
      .post("/admin/login")
      .set("Cookie", cookie)
      .type("form")
      .send({ _csrf: token, username: "chris", password: PASSWORD })
      .expect(302);
    assert.equal(res.headers.location, "/admin");
    assert.ok(sessionCookieFrom(res));
  });

  it("refuses a wrong password, and sets no session", async () => {
    const a = app();
    const { cookie, token } = await loginPage(a);
    const res = await request(a)
      .post("/admin/login")
      .set("Cookie", cookie)
      .type("form")
      .send({ _csrf: token, username: "chris", password: "wrong" })
      .expect(401);
    assert.equal(sessionCookieFrom(res), undefined);
    assert.ok(res.text.includes("Username or password is incorrect"));
  });

  it("refuses a wrong username with exactly the same message", async () => {
    const a = app();
    const { cookie, token } = await loginPage(a);
    const res = await request(a)
      .post("/admin/login")
      .set("Cookie", cookie)
      .type("form")
      .send({ _csrf: token, username: "someone", password: PASSWORD })
      .expect(401);
    assert.ok(res.text.includes("Username or password is incorrect"));
    assert.ok(!res.text.toLowerCase().includes("no such user"));
  });

  it("refuses a login carrying no forgery token", async () => {
    await request(app())
      .post("/admin/login")
      .type("form")
      .send({ username: "chris", password: PASSWORD })
      .expect(403);
  });

  it("stops answering after too many failures", async () => {
    const a = app();
    const { cookie, token } = await loginPage(a);
    const attempt = () =>
      request(a)
        .post("/admin/login")
        .set("Cookie", cookie)
        .type("form")
        .send({ _csrf: token, username: "chris", password: "wrong" });

    for (let i = 0; i < 5; i += 1) await attempt().expect(401);
    await attempt().expect(429);
  });
});

describe("the guard", () => {
  it("sends a signed out visitor from /admin to the login page", async () => {
    const res = await request(app()).get("/admin").expect(302);
    assert.equal(res.headers.location, "/admin/login");
  });

  it("lets a signed in visitor through", async () => {
    const a = app();
    const { session } = await signIn(a);
    await request(a).get("/admin").set("Cookie", session).expect(200);
  });

  it("treats an altered session cookie as signed out", async () => {
    const a = app();
    const { session } = await signIn(a);
    const tampered = session.replace(/\.(.)/, (match, c) => `.${c === "a" ? "b" : "a"}`);
    const res = await request(a).get("/admin").set("Cookie", tampered).expect(302);
    assert.equal(res.headers.location, "/admin/login");
  });

  it("sends a signed in visitor away from the login page", async () => {
    const a = app();
    const { session } = await signIn(a);
    const res = await request(a).get("/admin/login").set("Cookie", session).expect(302);
    assert.equal(res.headers.location, "/admin");
  });
});

describe("POST /admin/logout", () => {
  it("clears the session", async () => {
    const a = app();
    const { session, cookie, token } = await signIn(a);
    const res = await request(a)
      .post("/admin/logout")
      .set("Cookie", `${session}; ${cookie}`)
      .type("form")
      .send({ _csrf: token })
      .expect(302);

    assert.equal(res.headers.location, "/admin/login");
    assert.match(sessionCookieFrom(res), /Max-Age=0/);
  });
});

describe("the public page", () => {
  it("is untouched by any of this", async () => {
    await request(app()).get("/").expect(200);
    await request(app()).get("/health").expect(200);
  });
});
