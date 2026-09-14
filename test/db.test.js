/**
 * Tests for opening the database and applying the schema.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { openDatabase } from "../lib/db.js";

const tableNames = (db) =>
  db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);

describe("openDatabase", () => {
  it("creates both tables in a new database", () => {
    const db = openDatabase(":memory:");
    assert.deepEqual(tableNames(db), ["categories", "themes"]);
  });

  it("records that the schema has been applied", () => {
    const db = openDatabase(":memory:");
    assert.equal(db.pragma("user_version", { simple: true }), 2);
  });

  it("gives themes a description column", () => {
    const db = openDatabase(":memory:");
    const columns = db.pragma("table_info(themes)").map((column) => column.name);
    assert.ok(columns.includes("description"));
  });

  it("defaults a description to nothing, so a theme need not carry one", () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO categories (name, position) VALUES (?, ?)").run("Blog", 1);
    db.prepare(
      "INSERT INTO themes (title, url, category_id, image_file, position, created_at)" +
        " VALUES (?, ?, ?, ?, ?, ?)"
    ).run("Aurora", "https://aurora.test", 1, "a.png", 1, "2026-01-01T00:00:00Z");

    assert.equal(db.prepare("SELECT description FROM themes WHERE id = 1").get().description, "");
});

  it("turns on foreign key checking, which SQLite leaves off by default", () => {
    const db = openDatabase(":memory:");
    assert.equal(db.pragma("foreign_keys", { simple: true }), 1);
  });

  it("refuses a theme pointing at a category that does not exist", () => {
    const db = openDatabase(":memory:");
    assert.throws(
      () =>
        db
          .prepare(
            "INSERT INTO themes (title, url, category_id, image_file, position, created_at)" +
              " VALUES (?, ?, ?, ?, ?, ?)"
          )
          .run("Aurora", "https://aurora.test", 999, "a.png", 1, "2026-01-01T00:00:00Z"),
      /FOREIGN KEY/
    );
  });

  it("refuses to delete a category that still holds themes", () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO categories (name, position) VALUES (?, ?)").run("Blog", 1);
    db.prepare(
      "INSERT INTO themes (title, url, category_id, image_file, position, created_at)" +
        " VALUES (?, ?, ?, ?, ?, ?)"
    ).run("Aurora", "https://aurora.test", 1, "a.png", 1, "2026-01-01T00:00:00Z");

    assert.throws(() => db.prepare("DELETE FROM categories WHERE id = 1").run(), /FOREIGN KEY/);
  });

  it("refuses two categories with the same name", () => {
    const db = openDatabase(":memory:");
    db.prepare("INSERT INTO categories (name, position) VALUES (?, ?)").run("Blog", 1);
    assert.throws(
      () => db.prepare("INSERT INTO categories (name, position) VALUES (?, ?)").run("Blog", 2),
      /UNIQUE/
    );
  });
});

describe("openDatabase migrations", () => {
  function version1() {
    const file = path.join(
      mkdtempSync(path.join(tmpdir(), "standalone-migrate-")),
      "themes.db"
    );
    const db = new Database(file);
    db.exec(`
      CREATE TABLE categories (
        id       INTEGER PRIMARY KEY,
        name     TEXT    NOT NULL UNIQUE,
        position INTEGER NOT NULL
      );
      CREATE TABLE themes (
        id          INTEGER PRIMARY KEY,
        title       TEXT    NOT NULL,
        url         TEXT    NOT NULL,
        category_id INTEGER NOT NULL REFERENCES categories(id),
        image_file  TEXT    NOT NULL,
        position    INTEGER NOT NULL,
        created_at  TEXT    NOT NULL
      );
      CREATE INDEX themes_category ON themes(category_id);
    `);
    db.prepare("INSERT INTO categories (name, position) VALUES (?, ?)").run("Blog", 1);
    db.prepare(
      "INSERT INTO themes (title, url, category_id, image_file, position, created_at)" +
        " VALUES (?, ?, ?, ?, ?, ?)"
    ).run("Aurora", "https://aurora.test", 1, "aurora.png", 1, "2026-01-01T00:00:00Z");
    db.pragma("user_version = 1");
    db.close();
    return file;
  }

  it("adds the description column to a database that predates it", () => {
    const db = openDatabase(version1());
    const columns = db.pragma("table_info(themes)").map((column) => column.name);
    assert.ok(columns.includes("description"));
    assert.equal(db.pragma("user_version", { simple: true }), 2);
  });

  it("keeps every row that was already there", () => {
    const db = openDatabase(version1());
    const theme = db.prepare("SELECT title, url, image_file, description FROM themes").get();
    assert.equal(theme.title, "Aurora");
    assert.equal(theme.url, "https://aurora.test");
    assert.equal(theme.image_file, "aurora.png");
    assert.equal(theme.description, "");
  });

  it("can be opened twice without trying to migrate again", () => {
    const file = version1();
    openDatabase(file).close();
    const db = openDatabase(file);
    assert.equal(db.pragma("user_version", { simple: true }), 2);
    assert.equal(db.prepare("SELECT COUNT(*) AS count FROM themes").get().count, 1);
  });
});
