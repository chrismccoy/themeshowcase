/**
 * Tests for the themes screen.
 */

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, writeFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { JSDOM } from "jsdom";
import { createApp } from "../lib/app.js";
import { createThemeRepository } from "../repositories/theme-repository.js";
import { createCategoryRepository } from "../repositories/category-repository.js";
import { loadConfig } from "../config/index.js";
import { hashPassword } from "../lib/password.js";
import { freshDb, SAMPLE } from "./helpers/db.js";

const PASSWORD = "correct horse battery staple";

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

let uploadDir;
let app;
let themes;
let categories;
let session;
let csrfCookie;
let token;

after(() => {
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  uploadDir = mkdtempSync(path.join(tmpdir(), "standalone-themes-"));
  for (const entry of SAMPLE) writeFileSync(path.join(uploadDir, entry.imageFile), PNG);

  const config = loadConfig({
    ADMIN_USERNAME: "chris",
    ADMIN_PASSWORD_HASH: hashPassword(PASSWORD),
    SESSION_SECRET: "a-secret-for-tests",
    UPLOAD_DIR: uploadDir,
  });

  const db = freshDb(SAMPLE);
  themes = createThemeRepository(db);
  categories = createCategoryRepository(db);
  app = createApp({ config, themes, categories });

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

const cookies = () => `${session}; ${csrfCookie}`;
const get = (url) => request(app).get(url).set("Cookie", cookies());
const post = (url, body = {}) =>
  request(app).post(url).set("Cookie", cookies()).type("form").send({ _csrf: token, ...body });

function upload(url, fields, file = PNG, filename = "shot.png") {
  const req = request(app).post(url).set("Cookie", cookies()).field("_csrf", token);
  for (const [key, value] of Object.entries(fields)) req.field(key, String(value));
  return file ? req.attach("image", file, filename) : req;
}

const names = () => themes.list().map((theme) => theme.name);

describe("GET /admin/themes", () => {
  it("lists every theme in order", async () => {
    const res = await get("/admin/themes").expect(200);
    for (const name of ["Aurora", "Basalt", "Cinder"]) assert.ok(res.text.includes(name));
  });

  it("shows each screenshot through the media route", async () => {
    const res = await get("/admin/themes").expect(200);
    assert.ok(res.text.includes("/media/theme/1"));
  });

  it("offers an add button, edit links and move buttons", async () => {
    const res = await get("/admin/themes").expect(200);
    assert.ok(res.text.includes('href="/admin/themes/new"'));
    assert.ok(res.text.includes('href="/admin/themes/1/edit"'));
    assert.ok(res.text.includes("/admin/themes/1/move"));
  });

  it("turns one row into a confirm strip when asked", async () => {
    const res = await get("/admin/themes?confirm=2").expect(200);
    assert.ok(res.text.includes("/admin/themes/2/delete"));
    assert.match(res.text, /Delete[\s\S]{0,40}Basalt/);
  });
});

describe("GET /admin/themes/new and /:id/edit", () => {
  it("offers an empty form", async () => {
    const res = await get("/admin/themes/new").expect(200);
    assert.ok(res.text.includes('name="title"'));
    assert.ok(res.text.includes('name="url"'));
    assert.ok(res.text.includes('name="categoryId"'));
    assert.ok(res.text.includes('type="file"'));
  });

  it("fills the form in when editing", async () => {
    const res = await get("/admin/themes/1/edit").expect(200);
    assert.ok(res.text.includes('value="Aurora"'));
    assert.ok(res.text.includes('value="https://aurora.test"'));
    assert.ok(res.text.includes("/media/theme/1"));
  });

  it("offers a drop zone that still holds the real file chooser", async () => {
    const res = await get("/admin/themes/new").expect(200);
    const doc = new JSDOM(res.text).window.document;
    const zone = doc.getElementById("drop-zone");
    assert.ok(zone, "there should be a drop zone");
    const input = zone.querySelector('input[type="file"]#image');
    assert.ok(input, "the real chooser must live inside it, so the form works without scripts");
    assert.equal(input.getAttribute("name"), "image");
    assert.ok(input.hasAttribute("required"));
    assert.match(input.getAttribute("accept"), /image\/png/);
  });

  it("says the size limit and the formats before anything is chosen", async () => {
    const res = await get("/admin/themes/new").expect(200);
    const text = new JSDOM(res.text).window.document.getElementById("drop-zone").textContent;
    assert.match(text, /5 MB/);
    assert.match(text, /PNG/);
    assert.match(text, /GIF/);
  });

  it("shows the current screenshot as the starting preview when editing", async () => {
    const res = await get("/admin/themes/1/edit").expect(200);
    const preview = new JSDOM(res.text).window.document.getElementById("drop-preview");
    assert.equal(preview.getAttribute("src"), "/media/theme/1");
    assert.equal(preview.classList.contains("hidden"), false);
  });

  it("starts with no preview when adding", async () => {
    const res = await get("/admin/themes/new").expect(200);
    const preview = new JSDOM(res.text).window.document.getElementById("drop-preview");
    assert.equal(preview.classList.contains("hidden"), true);
  });

  it("does not require a new screenshot when editing", async () => {
    const res = await get("/admin/themes/1/edit").expect(200);
    const input = new JSDOM(res.text).window.document.getElementById("image");
    assert.equal(input.hasAttribute("required"), false);
  });

  it("answers 404 for a theme that does not exist", async () => {
    await get("/admin/themes/99/edit").expect(404);
  });
});

describe("POST /admin/themes", () => {
  it("creates a theme with its screenshot", async () => {
    const res = await upload("/admin/themes", {
      title: "Dune",
      url: "https://dune.test",
      categoryId: 1,
    });
    assert.equal(res.status, 302);
    assert.ok(names().includes("Dune"));

    const created = themes.list().find((theme) => theme.name === "Dune");
    assert.ok(existsSync(path.join(uploadDir, themes.findById(created.id).imageFile)));
  });

  it("refuses a blank title", async () => {
    await upload("/admin/themes", { title: "   ", url: "https://dune.test", categoryId: 1 });
    assert.equal(themes.list().length, 3);
  });

  it("refuses an address that is not http or https", async () => {
    await upload("/admin/themes", {
      title: "Dune",
      url: "javascript:alert(1)",
      categoryId: 1,
    });
    assert.equal(themes.list().length, 3);
  });

  it("refuses a category that does not exist", async () => {
    await upload("/admin/themes", { title: "Dune", url: "https://dune.test", categoryId: 99 });
    assert.equal(themes.list().length, 3);
  });

  it("refuses a creation with no screenshot", async () => {
    await upload("/admin/themes", { title: "Dune", url: "https://dune.test", categoryId: 1 }, null);
    assert.equal(themes.list().length, 3);
  });

  it("leaves nothing on disk when it refuses", async () => {
    const before = readdirSync(uploadDir).length;
    await upload("/admin/themes", { title: "", url: "https://dune.test", categoryId: 1 });
    assert.equal(readdirSync(uploadDir).length, before);
  });
});

describe("POST /admin/themes/:id", () => {
  it("updates the fields without a new screenshot", async () => {
    const before = themes.findById(1).imageFile;
    await post("/admin/themes/1", {
      title: "Aurora Two",
      url: "https://aurora2.test",
      categoryId: 2,
    }).expect(302);

    const theme = themes.findById(1);
    assert.equal(theme.title, "Aurora Two");
    assert.equal(theme.categoryId, 2);
    assert.equal(theme.imageFile, before);
  });

  it("replaces the screenshot and deletes the old file", async () => {
    const before = themes.findById(1).imageFile;
    await upload("/admin/themes/1", {
      title: "Aurora",
      url: "https://aurora.test",
      categoryId: 1,
    });

    const after = themes.findById(1).imageFile;
    assert.notEqual(after, before);
    assert.ok(existsSync(path.join(uploadDir, after)));
    assert.ok(!existsSync(path.join(uploadDir, before)), "the replaced file must be deleted");
  });

  it("refuses a bad address and changes nothing", async () => {
    await post("/admin/themes/1", {
      title: "Aurora",
      url: "javascript:alert(1)",
      categoryId: 1,
    });
    assert.equal(themes.findById(1).url, "https://aurora.test");
  });
});

describe("descriptions", () => {
  it("offers a description field on the form", async () => {
    const res = await get("/admin/themes/new").expect(200);
    assert.ok(res.text.includes('name="description"'));
  });

  it("saves one given at creation", async () => {
    await upload("/admin/themes", {
      title: "Dune",
      url: "https://dune.test",
      categoryId: 1,
      description: "A spare theme for long reads.",
    });
    const created = themes.list().find((theme) => theme.name === "Dune");
    assert.equal(themes.findById(created.id).description, "A spare theme for long reads.");
  });

  it("accepts a theme with no description at all", async () => {
    await upload("/admin/themes", { title: "Dune", url: "https://dune.test", categoryId: 1 });
    const created = themes.list().find((theme) => theme.name === "Dune");
    assert.equal(themes.findById(created.id).description, "");
  });

  it("trims what was typed", async () => {
    await upload("/admin/themes", {
      title: "Dune",
      url: "https://dune.test",
      categoryId: 1,
      description: "   Spare and quiet.   ",
    });
    const created = themes.list().find((theme) => theme.name === "Dune");
    assert.equal(themes.findById(created.id).description, "Spare and quiet.");
  });

  it("shows the description when editing", async () => {
    themes.update(1, {
      title: "Aurora",
      url: "https://aurora.test",
      categoryId: 1,
      description: "Bright and roomy.",
    });
    const res = await get("/admin/themes/1/edit").expect(200);
    assert.ok(res.text.includes("Bright and roomy."));
  });

  it("changes one on update, and clears it when emptied", async () => {
    await post("/admin/themes/1", {
      title: "Aurora",
      url: "https://aurora.test",
      categoryId: 1,
      description: "Bright and roomy.",
    }).expect(302);
    assert.equal(themes.findById(1).description, "Bright and roomy.");

    await post("/admin/themes/1", {
      title: "Aurora",
      url: "https://aurora.test",
      categoryId: 1,
      description: "",
    }).expect(302);
    assert.equal(themes.findById(1).description, "");
  });

  it("refuses one that runs too long, keeping what was typed", async () => {
    const tooLong = "x".repeat(301);
    const res = await upload("/admin/themes", {
      title: "Dune",
      url: "https://dune.test",
      categoryId: 1,
      description: tooLong,
    });
    assert.equal(themes.list().length, 3);
    assert.match(res.text, /300/);
    assert.ok(res.text.includes(tooLong));
  });

  it("accepts one of exactly the limit", async () => {
    await upload("/admin/themes", {
      title: "Dune",
      url: "https://dune.test",
      categoryId: 1,
      description: "x".repeat(300),
    });
    assert.ok(themes.list().some((theme) => theme.name === "Dune"));
  });
});

describe("POST /admin/themes/:id/delete", () => {
  it("deletes the theme and its file", async () => {
    const file = themes.findById(2).imageFile;
    await post("/admin/themes/2/delete").expect(302);
    assert.equal(themes.findById(2), undefined);
    assert.ok(!existsSync(path.join(uploadDir, file)), "the screenshot must be deleted too");
  });
});

describe("POST /admin/themes/:id/move", () => {
  it("moves a theme up", async () => {
    await post("/admin/themes/2/move", { direction: "up" }).expect(302);
    assert.deepEqual(names(), ["Basalt", "Aurora", "Cinder"]);
  });

  it("moves a theme down", async () => {
    await post("/admin/themes/2/move", { direction: "down" }).expect(302);
    assert.deepEqual(names(), ["Aurora", "Cinder", "Basalt"]);
  });

  it("does nothing at the ends", async () => {
    await post("/admin/themes/1/move", { direction: "up" }).expect(302);
    await post("/admin/themes/3/move", { direction: "down" }).expect(302);
    assert.deepEqual(names(), ["Aurora", "Basalt", "Cinder"]);
  });

  it("ignores a direction it does not know", async () => {
    await post("/admin/themes/2/move", { direction: "sideways" }).expect(302);
    assert.deepEqual(names(), ["Aurora", "Basalt", "Cinder"]);
  });
});

describe("the guard", () => {
  it("keeps every theme route to whoever is signed in", async () => {
    await request(app).get("/admin/themes").expect(302);
    await request(app).get("/admin/themes/new").expect(302);
    await request(app).get("/admin/themes/1/edit").expect(302);
    await request(app).post("/admin/themes").type("form").send({ title: "Sneaky" }).expect(403);
    await request(app).post("/admin/themes/1").type("form").send({ title: "Sneaky" }).expect(403);
    await request(app).post("/admin/themes/1/delete").type("form").send({}).expect(403);
    await request(app)
      .post("/admin/themes/1/move")
      .type("form")
      .send({ direction: "up" })
      .expect(403);

    assert.deepEqual(names(), ["Aurora", "Basalt", "Cinder"]);
    assert.equal(themes.findById(1).title, "Aurora");
  });
});

describe("what the public page shows", () => {
  it("shows a theme created through the dashboard", async () => {
    await upload("/admin/themes", { title: "Dune", url: "https://dune.test", categoryId: 1 });
    const res = await request(app).get("/").expect(200);
    assert.ok(res.text.includes("Dune"));
  });
});
