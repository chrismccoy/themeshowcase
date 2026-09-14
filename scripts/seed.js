/**
 * Fills an empty database with sample categories and themes
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig, loadEnvFileIfPresent } from "../config/index.js";
import { openDatabase } from "../lib/db.js";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

loadEnvFileIfPresent(rootDir);

const config = loadConfig();
const db = openDatabase(config.databaseFile);
const uploadDir = path.resolve(rootDir, config.uploadDir);

fs.mkdirSync(uploadDir, { recursive: true });

const CATEGORIES = ["Portfolio", "Blog", "Gallery"];

const THEMES = [
  { title: "Aurora", url: "https://aurora.test", category: "Portfolio" },
  { title: "Basalt", url: "https://basalt.test", category: "Portfolio" },
  { title: "Cinder", url: "https://cinder.test", category: "Blog" },
  { title: "Dune", url: "https://dune.test", category: "Blog" },
  { title: "Ember", url: "https://ember.test", category: "Gallery" },
];

const existing = db.prepare("SELECT COUNT(*) AS count FROM themes").get().count;
if (existing > 0) {
  console.log(`Database already holds ${existing} themes. Nothing seeded.`);
  process.exit(0);
}

const placeholder = fs.readFileSync(path.join(rootDir, "public", "img", "placeholder.svg"));

const insertCategory = db.prepare("INSERT INTO categories (name, position) VALUES (?, ?)");
const insertTheme = db.prepare(
  "INSERT INTO themes (title, url, category_id, image_file, position, created_at)" +
    " VALUES (?, ?, ?, ?, ?, ?)"
);

const seed = db.transaction(() => {
  const ids = new Map();
  CATEGORIES.forEach((name, index) => {
    ids.set(name, Number(insertCategory.run(name, index + 1).lastInsertRowid));
  });

  THEMES.forEach((theme, index) => {
    const file = `${theme.title.toLowerCase()}.svg`;
    fs.writeFileSync(path.join(uploadDir, file), placeholder);
    insertTheme.run(
      theme.title,
      theme.url,
      ids.get(theme.category),
      file,
      index + 1,
      new Date().toISOString()
    );
  });
});

seed();

console.log(`Seeded ${CATEGORIES.length} categories and ${THEMES.length} themes.`);
