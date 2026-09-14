/**
 * Tests for serving screenshots
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
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

const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

let uploadDir;

before(() => {
  uploadDir = mkdtempSync(path.join(tmpdir(), "standalone-uploads-"));
  writeFileSync(path.join(uploadDir, "aurora.png"), PNG);
  writeFileSync(path.join(uploadDir, "basalt.png"), PNG);
});

after(() => {
  rmSync(uploadDir, { recursive: true, force: true });
});

function appWith(entries = SAMPLE) {
  const config = loadConfig({ ...ADMIN, UPLOAD_DIR: uploadDir });
  const db = freshDb(entries);
  return createApp({
    config,
    themes: createThemeRepository(db),
    categories: createCategoryRepository(db),
  });
}

describe("GET /media/theme/:id", () => {
  it("serves the stored screenshot", async () => {
    const res = await request(appWith()).get("/media/theme/1").expect(200);
    assert.equal(res.headers["content-type"], "image/png");
    assert.equal(res.body.length, PNG.length);
  });

  it("lets a browser keep a screenshot for five minutes", async () => {
    const res = await request(appWith()).get("/media/theme/1").expect(200);
    assert.equal(res.headers["cache-control"], "public, max-age=300");
  });

  it("offers an entity tag and a modified date", async () => {
    const res = await request(appWith()).get("/media/theme/1").expect(200);
    assert.ok(res.headers.etag);
    assert.ok(res.headers["last-modified"]);
  });

  it("answers a conditional request with 304 and no body", async () => {
    const app = appWith();
    const first = await request(app).get("/media/theme/1").expect(200);
    const second = await request(app)
      .get("/media/theme/1")
      .set("If-None-Match", first.headers.etag)
      .expect(304);
    assert.deepEqual(second.body, {});
  });

  it("answers 404 for a theme it does not have", async () => {
    await request(appWith()).get("/media/theme/99").expect(404);
  });

  it("answers 404 for an identifier that is not a number", async () => {
    await request(appWith()).get("/media/theme/nonsense").expect(404);
  });

  it("serves the placeholder when the file is missing from disk", async () => {
    const res = await request(appWith()).get("/media/theme/3").expect(200);
    assert.ok(res.headers["content-type"].includes("image/svg+xml"));
    assert.equal(res.headers["cache-control"], "public, max-age=60");
  });

  it("refuses a file name trying to climb out of the upload directory", async () => {
    const db = freshDb([
      { title: "Evil", url: "https://evil.test", category: "Blog", imageFile: "../../package.json" },
    ]);
    const app = createApp({
      config: loadConfig({ ...ADMIN, UPLOAD_DIR: uploadDir }),
      themes: createThemeRepository(db),
      categories: createCategoryRepository(db),
    });
    const res = await request(app).get("/media/theme/1").expect(200);
    assert.ok(res.headers["content-type"].includes("image/svg+xml"));
  });
});
