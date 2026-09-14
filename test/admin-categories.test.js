/**
 * Tests for the categories screen.
 */

import { describe, it, beforeEach } from "node:test";
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

let app;
let categories;
let session;
let csrfCookie;
let token;

beforeEach(async () => {
  const db = freshDb(SAMPLE);
  categories = createCategoryRepository(db);
  app = createApp({ config: CONFIG, themes: createThemeRepository(db), categories });

  const page = await request(app).get("/admin/login").expect(200);
  csrfCookie = (page.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
  token = /name="_csrf" value="([^"]+)"/.exec(page.text)[1];

  const res = await request(app)
    .post("/admin/login")
    .set("Cookie", csrfCookie)
    .type("form")
    .send({ _csrf: token, username: "chris", password: PASSWORD })
    .expect(302);

  session = (res.headers["set-cookie"] ?? [])
    .find((c) => c.startsWith("admin_session="))
    .split(";")[0];
});

const signedIn = (method, path) =>
  request(app)[method](path).set("Cookie", `${session}; ${csrfCookie}`);

const post = (path, body) => signedIn("post", path).type("form").send({ _csrf: token, ...body });

describe("GET /admin/categories", () => {
  it("lists every category with how many themes it holds", async () => {
    const res = await signedIn("get", "/admin/categories").expect(200);
    assert.ok(res.text.includes("Blog"));
    assert.ok(res.text.includes("Portfolio"));
  });

  it("offers a form for adding one", async () => {
    const res = await signedIn("get", "/admin/categories").expect(200);
    assert.match(res.text, /action="\/admin\/categories"[\s\S]*?name="name"/);
  });

  it("turns one row into a confirm strip when asked", async () => {
    const res = await signedIn("get", "/admin/categories?confirm=2").expect(200);
    assert.ok(res.text.includes("/admin/categories/2/delete"));
    assert.match(res.text, /Delete[\s\S]{0,40}Portfolio/);
  });

  it("shows no confirm strip otherwise", async () => {
    const res = await signedIn("get", "/admin/categories").expect(200);
    assert.ok(!res.text.includes("/delete"));
  });
});

describe("POST /admin/categories", () => {
  it("creates one and says so", async () => {
    const res = await post("/admin/categories", { name: "Gallery" }).expect(302);
    assert.equal(res.headers.location, "/admin/categories");
    assert.ok(categories.list().some((c) => c.name === "Gallery"));

    const flash = (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("flash="));
    const after = await request(app)
      .get("/admin/categories")
      .set("Cookie", `${session}; ${csrfCookie}; ${flash.split(";")[0]}`)
      .expect(200);
    assert.match(after.text, /Gallery[\s\S]{0,20}(added|created|saved)/i);
  });

  it("refuses an empty name", async () => {
    await post("/admin/categories", { name: "   " }).expect(302);
    assert.equal(categories.list().length, 2);
  });

  it("refuses a name already in use, without a stack trace", async () => {
    const res = await post("/admin/categories", { name: "Blog" }).expect(302);
    assert.equal(categories.list().length, 2);
    const flash = (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("flash="));
    assert.ok(flash);
  });
});

describe("POST /admin/categories/:id", () => {
  it("renames one", async () => {
    await post("/admin/categories/1", { name: "Writing" }).expect(302);
    assert.equal(categories.findById(1).name, "Writing");
  });

  it("refuses a rename onto a name already in use", async () => {
    await post("/admin/categories/1", { name: "Portfolio" }).expect(302);
    assert.equal(categories.findById(1).name, "Blog");
  });
});

describe("POST /admin/categories/:id/delete", () => {
  it("deletes an empty one", async () => {
    const id = categories.create("Gallery");
    await post(`/admin/categories/${id}/delete`, {}).expect(302);
    assert.equal(categories.findById(id), undefined);
  });

  it("refuses to delete one that still holds themes", async () => {
    await post("/admin/categories/1/delete", {}).expect(302);
    assert.ok(categories.findById(1));
  });

  it("says how many themes are in the way", async () => {
    const res = await post("/admin/categories/1/delete", {}).expect(302);
    const flash = (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("flash="));
    assert.match(decodeURIComponent(flash), /2/);
  });

  it("shows the refusal as a warning rather than as a success", async () => {
    const res = await post("/admin/categories/1/delete", {}).expect(302);
    const flash = (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("flash="));
    assert.match(decodeURIComponent(flash), /^flash=warn:/);

    const after = await request(app)
      .get("/admin/categories")
      .set("Cookie", `${session}; ${csrfCookie}; ${flash.split(";")[0]}`)
      .expect(200);
    assert.ok(after.text.includes("notice-warn"));
    assert.ok(!after.text.includes("notice-ok"));
  });

  it("shows a success as a success", async () => {
    const res = await post("/admin/categories", { name: "Gallery" }).expect(302);
    const flash = (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("flash="));
    assert.match(decodeURIComponent(flash), /^flash=ok:/);

    const after = await request(app)
      .get("/admin/categories")
      .set("Cookie", `${session}; ${csrfCookie}; ${flash.split(";")[0]}`)
      .expect(200);
    assert.ok(after.text.includes("notice-ok"));
  });
});

describe("the guard", () => {
  it("keeps every category route to whoever is signed in", async () => {
    await request(app).get("/admin/categories").expect(302);
    await request(app).post("/admin/categories").type("form").send({ name: "Sneaky" }).expect(403);
    await request(app).post("/admin/categories/1").type("form").send({ name: "Sneaky" }).expect(403);
    await request(app).post("/admin/categories/1/delete").type("form").send({}).expect(403);
    assert.equal(categories.list().length, 2);
    assert.equal(categories.findById(1).name, "Blog");
  });
});
