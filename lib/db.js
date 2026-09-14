/**
 * Opens the SQLite database and import the schema
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const SCHEMA_VERSION = 2;

const MIGRATIONS = {
  2: "ALTER TABLE themes ADD COLUMN description TEXT NOT NULL DEFAULT ''",
};

/**
 * Opens the database, enabling foreign keys and applying the schema for a new db
 */
export function openDatabase(file) {
  if (file !== ":memory:") {
    fs.mkdirSync(path.dirname(path.resolve(rootDir, file)), { recursive: true });
  }

  const db = new Database(file === ":memory:" ? file : path.resolve(rootDir, file));
  db.pragma("foreign_keys = ON");

  const version = db.pragma("user_version", { simple: true });

  if (version === 0) {
    db.exec(fs.readFileSync(path.join(rootDir, "db", "schema.sql"), "utf8"));
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
    return db;
  }

  for (let next = version + 1; next <= SCHEMA_VERSION; next += 1) {
    const migration = MIGRATIONS[next];
    if (!migration) continue;

    db.transaction(() => {
      db.exec(migration);
      db.pragma(`user_version = ${next}`);
    })();
  }

  return db;
}
