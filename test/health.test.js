/**
 * Tests for the health report.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
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


const CONFIG = loadConfig(ADMIN);

function appWith(themes, categories) {
  return createApp({ config: CONFIG, themes, categories });
}

describe("GET /health", () => {
  it("reports the database and what it holds", async () => {
    const db = freshDb(SAMPLE);
    const app = appWith(createThemeRepository(db), createCategoryRepository(db));
    const res = await request(app).get("/health").expect(200);
    assert.deepEqual(res.body, { status: "ok", themes: 3, categories: 2 });
  });

  it("is never cached", async () => {
    const db = freshDb(SAMPLE);
    const app = appWith(createThemeRepository(db), createCategoryRepository(db));
    const res = await request(app).get("/health").expect(200);
    assert.equal(res.headers["cache-control"], "no-store");
  });

  it("reports an empty database as healthy", async () => {
    const db = freshDb([]);
    const app = appWith(createThemeRepository(db), createCategoryRepository(db));
    const res = await request(app).get("/health").expect(200);
    assert.deepEqual(res.body, { status: "ok", themes: 0, categories: 0 });
  });

  it("answers 503 and names the fault when the database cannot be read", async () => {
    const db = freshDb(SAMPLE);
    const broken = {
      list() {
        throw new Error("database is locked");
      },
    };
    const app = appWith(broken, createCategoryRepository(db));
    const res = await request(app).get("/health").expect(503);
    assert.equal(res.body.status, "degraded");
    assert.match(res.body.error, /database is locked/);
  });
});
