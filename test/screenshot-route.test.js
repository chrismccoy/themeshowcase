/**
 * Tests for the capture route.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
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
let session;
let csrfCookie;
let token;
let captured;

async function build({ enabled = true, capture } = {}) {
  uploadDir = fs.mkdtempSync(path.join(tmpdir(), "standalone-capture-"));

  const config = loadConfig({
    ADMIN_USERNAME: "chris",
    ADMIN_PASSWORD_HASH: hashPassword(PASSWORD),
    SESSION_SECRET: "a-secret-for-tests",
    UPLOAD_DIR: uploadDir,
    SCREENSHOT_ENABLED: enabled ? "true" : "false",
  });

  const db = freshDb(SAMPLE);

  app = createApp({
    config,
    themes: createThemeRepository(db),
    categories: createCategoryRepository(db),
    capture:
      capture ??
      (async (url, destDir, name) => {
        captured.push({ url, destDir, name });
        fs.writeFileSync(path.join(destDir, name), PNG);
      }),
  });

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
}

const cookies = () => `${session}; ${csrfCookie}`;

function shoot(fields = {}) {
  const req = request(app)
    .post("/admin/themes/screenshot")
    .set("Cookie", cookies())
    .field("_csrf", token);

  const body = {
    title: "Aurora",
    url: "https://aurora.test",
    categoryId: "1",
    description: "",
    mode: "generate",
    captureUrl: "https://93.184.216.34/theme",
    ...fields,
  };

  for (const [key, value] of Object.entries(body)) req.field(key, String(value));
  return req;
}

beforeEach(() => {
  captured = [];
});

afterEach(() => {
  if (uploadDir) fs.rmSync(uploadDir, { recursive: true, force: true });
});

describe("POST /admin/themes/screenshot", () => {
  it("turns a signed out visitor away", async () => {
    await build();

    await request(app)
      .post("/admin/themes/screenshot")
      .set("Cookie", csrfCookie)
      .type("form")
      .send({ _csrf: token, mode: "generate", captureUrl: "https://93.184.216.34/" })
      .expect(302);
  });

  it("refuses a request without a token", async () => {
    await build();

    await request(app)
      .post("/admin/themes/screenshot")
      .set("Cookie", session)
      .type("form")
      .send({ mode: "generate", captureUrl: "https://93.184.216.34/" })
      .expect(403);
  });

  it("captures the address and answers with JSON when asked for JSON", async () => {
    await build();
    const res = await shoot().set("Accept", "application/json").expect(200);

    assert.equal(res.body.ok, true);
    assert.match(res.body.generatedFile, /^[0-9a-f]{32}\.png$/);
    assert.equal(res.body.preview, `/media/tmp/${res.body.generatedFile}`);
    assert.equal(captured.length, 1);
    assert.equal(captured[0].url, "https://93.184.216.34/theme");
    assert.equal(fs.existsSync(path.join(uploadDir, "tmp", res.body.generatedFile)), true);
  });

  it("re-renders the form with the capture kept when scripts are not running", async () => {
    await build();
    const res = await shoot().expect(200);

    assert.match(res.text, /name="generatedFile" value="[0-9a-f]{32}\.png"/);
    assert.match(res.text, /value="Aurora"/);
  });

  it("re-renders with the drop zone put away and the capture shown", async () => {
    await build();
    const res = await shoot().expect(200);
    const doc = new JSDOM(res.text).window.document;

    assert.equal(doc.getElementById("upload-panel").classList.contains("hidden"), true);
    assert.equal(doc.getElementById("generate-panel").classList.contains("hidden"), false);
    assert.equal(doc.getElementById("mode-generate").checked, true);
    assert.equal(doc.getElementById("image").hasAttribute("required"), false);

    const preview = doc.getElementById("capture-preview");
    assert.match(preview.getAttribute("src"), /^\/media\/tmp\/[0-9a-f]{32}\.png$/);
    assert.equal(preview.classList.contains("hidden"), false);
  });

  it("throws away the capture it took before", async () => {
    await build();
    const first = await shoot().set("Accept", "application/json").expect(200);

    await shoot({ generatedFile: first.body.generatedFile })
      .set("Accept", "application/json")
      .expect(200);

    assert.equal(fs.existsSync(path.join(uploadDir, "tmp", first.body.generatedFile)), false);
    assert.equal(fs.readdirSync(path.join(uploadDir, "tmp")).length, 1);
  });

  it("refuses an address inside this network", async () => {
    await build();
    const res = await shoot({ captureUrl: "http://127.0.0.1:3000/admin" })
      .set("Accept", "application/json")
      .expect(422);

    assert.equal(res.body.ok, false);
    assert.match(res.body.error, /inside this server's own network/);
    assert.equal(captured.length, 0);
  });

  it("refuses an address that is not http or https", async () => {
    await build();
    const res = await shoot({ captureUrl: "file:///etc/passwd" })
      .set("Accept", "application/json")
      .expect(422);

    assert.match(res.body.error, /must start with http or https/);
  });

  it("reports a capture that timed out", async () => {
    await build({
      capture: async () => {
        throw Object.assign(new Error("slow"), { code: "timeout" });
      },
    });

    const res = await shoot().set("Accept", "application/json").expect(422);
    assert.match(res.body.error, /took too long/);
  });

  it("reports a browser that will not run", async () => {
    await build({
      capture: async () => {
        throw Object.assign(new Error("no chrome"), { code: "engine" });
      },
    });

    const res = await shoot().set("Accept", "application/json").expect(422);
    assert.match(res.body.error, /not available on this server/);
  });

  it("throws away a capture that came out too large", async () => {
    await build({
      capture: async (url, destDir, name) => {
        fs.writeFileSync(path.join(destDir, name), Buffer.concat([PNG, Buffer.alloc(6 * 1024 * 1024)]));
      },
    });

    const res = await shoot().set("Accept", "application/json").expect(422);
    assert.match(res.body.error, /larger than the/);
    assert.equal(fs.readdirSync(path.join(uploadDir, "tmp")).length, 0);
  });

  it("throws away a capture that is not a picture", async () => {
    await build({
      capture: async (url, destDir, name) => {
        fs.writeFileSync(path.join(destDir, name), "not a picture at all");
      },
    });

    const res = await shoot().set("Accept", "application/json").expect(422);
    assert.match(res.body.error, /could not be read/);
    assert.equal(fs.readdirSync(path.join(uploadDir, "tmp")).length, 0);
  });

  it("is not there when the feature is turned off", async () => {
    await build({ enabled: false });
    await shoot().expect(404);
  });
});

describe("GET /media/tmp/:name", () => {
  it("serves a pending capture to a signed in admin", async () => {
    await build();
    const made = await shoot().set("Accept", "application/json").expect(200);

    const res = await request(app)
      .get(`/media/tmp/${made.body.generatedFile}`)
      .set("Cookie", cookies())
      .expect(200);

    assert.match(res.headers["content-type"], /image\/png/);
    assert.equal(res.headers["cache-control"], "no-store");
  });

  it("turns a signed out visitor away", async () => {
    await build();
    const made = await shoot().set("Accept", "application/json").expect(200);

    await request(app).get(`/media/tmp/${made.body.generatedFile}`).expect(302);
  });

  it("refuses a name that is not a pending capture", async () => {
    await build();
    await request(app).get("/media/tmp/notes.txt").set("Cookie", cookies()).expect(404);
  });
});
