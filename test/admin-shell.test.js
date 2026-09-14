/**
 * Tests for the dashboard shell.
 */

import { describe, it, before } from "node:test";
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
  BRAND_NAME: "Theme Previewer",
});

const db = freshDb(SAMPLE);
const app = createApp({
  config: CONFIG,
  themes: createThemeRepository(db),
  categories: createCategoryRepository(db),
});

let session;

before(async () => {
  const page = await request(app).get("/admin/login").expect(200);
  const cookie = (page.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
  const token = /name="_csrf" value="([^"]+)"/.exec(page.text)[1];

  const res = await request(app)
    .post("/admin/login")
    .set("Cookie", cookie)
    .type("form")
    .send({ _csrf: token, username: "chris", password: PASSWORD })
    .expect(302);

  session = (res.headers["set-cookie"] ?? [])
    .find((c) => c.startsWith("admin_session="))
    .split(";")[0];
});

const dashboard = () => request(app).get("/admin").set("Cookie", session);

describe("GET /admin", () => {
  it("renders the shell", async () => {
    const res = await dashboard().expect(200);
    assert.ok(res.text.includes("Dashboard"));
    assert.ok(res.text.includes("Theme Previewer"));
  });

  it("shows the navigation, dead links included", async () => {
    const res = await dashboard().expect(200);
    assert.ok(res.text.includes('href="/admin/themes"'));
    assert.ok(res.text.includes('href="/admin/categories"'));
  });

  it("shows who is signed in", async () => {
    const res = await dashboard().expect(200);
    assert.ok(res.text.includes("chris"));
  });

  it("offers a log out form carrying a forgery token", async () => {
    const res = await dashboard().expect(200);
    assert.match(res.text, /action="\/admin\/logout"[\s\S]*?name="_csrf" value="[^"]+"/);
  });

  it("asks not to be indexed", async () => {
    const res = await dashboard().expect(200);
    assert.ok(res.text.includes('content="noindex, nofollow"'));
  });

  it("counts the themes and the categories", async () => {
    const res = await dashboard().expect(200);
    assert.match(res.text, /kpi-label">\s*Themes\s*<\/p>\s*<p class="kpi-value">\s*3\s*</);
    assert.match(res.text, /kpi-label">\s*Categories\s*<\/p>\s*<p class="kpi-value">\s*2\s*</);
  });

  it("offers a way back to the public page", async () => {
    const res = await dashboard().expect(200);
    assert.match(res.text, /href="\/"[^>]*target="_blank"/);
    assert.ok(res.text.includes("View site"));
  });

  it("opens the public page safely in its new tab", async () => {
    const res = await dashboard().expect(200);
    assert.match(res.text, /href="\/"[^>]*rel="noopener noreferrer"/);
  });

  it("links to both screens", async () => {
    const res = await dashboard().expect(200);
    assert.ok(res.text.includes('href="/admin/themes"'));
    assert.ok(res.text.includes('href="/admin/categories"'));
  });
});
