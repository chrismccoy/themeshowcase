/**
 * Tests that the configured screenshot size limit
 */

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
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

after(() => {
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
});

beforeEach(async () => {
  uploadDir = mkdtempSync(path.join(tmpdir(), "standalone-limit-"));

  const config = loadConfig({
    ADMIN_USERNAME: "chris",
    ADMIN_PASSWORD_HASH: hashPassword(PASSWORD),
    SESSION_SECRET: "a-secret-for-tests",
    UPLOAD_DIR: uploadDir,
    MAX_IMAGE_BYTES: "2048",
  });

  const db = freshDb(SAMPLE);
  app = createApp({
    config,
    themes: createThemeRepository(db),
    categories: createCategoryRepository(db),
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
});

const filesIn = () => readdirSync(uploadDir);

function send(bytes) {
  const contents = Buffer.concat([PNG, Buffer.alloc(Math.max(0, bytes - PNG.length))]);
  return request(app)
    .post("/admin/themes")
    .set("Cookie", `${session}; ${csrfCookie}`)
    .field("_csrf", token)
    .field("title", "Too big")
    .field("url", "https://toobig.test")
    .field("categoryId", "1")
    .field("description", "")
    .attach("image", contents, "shot.png");
}

describe("the configured screenshot size limit", () => {
  it("refuses a screenshot over it, and says how large it may be", async () => {
    const res = await send(4096);
    assert.equal(res.status, 200);
    assert.match(res.text, /larger than the 2 KB limit/);
    assert.ok(!res.text.includes("NaN"), "the limit must be a number in the message");
  });

  it("leaves nothing behind when it refuses", async () => {
    await send(4096);
    assert.deepEqual(filesIn(), []);
  });

  it("accepts a screenshot under it", async () => {
    const res = await send(1024);
    assert.equal(res.status, 302);
    assert.equal(filesIn().length, 1);
  });
});
