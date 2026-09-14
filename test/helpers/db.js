/**
 * Builds a seeded in-memory database for tests.
 */

import { openDatabase } from "../../lib/db.js";

export function freshDb(entries = []) {
  const db = openDatabase(":memory:");

  const insertCategory = db.prepare("INSERT INTO categories (name, position) VALUES (?, ?)");
  const insertTheme = db.prepare(
    "INSERT INTO themes (title, url, category_id, image_file, description, position, created_at)" +
      " VALUES (?, ?, ?, ?, ?, ?, ?)"
  );

  const categoryIds = new Map();

  entries.forEach((entry, index) => {
    if (!categoryIds.has(entry.category)) {
      const info = insertCategory.run(entry.category, categoryIds.size + 1);
      categoryIds.set(entry.category, Number(info.lastInsertRowid));
    }
    insertTheme.run(
      entry.title,
      entry.url,
      categoryIds.get(entry.category),
      entry.imageFile ?? `${entry.title.toLowerCase()}.png`,
      entry.description ?? "",
      index + 1,
      "2026-01-01T00:00:00Z"
    );
  });

  return db;
}

export const SAMPLE = [
  { title: "Aurora", url: "https://aurora.test", category: "Blog", imageFile: "aurora.png" },
  { title: "Basalt", url: "https://basalt.test", category: "Portfolio", imageFile: "basalt.png" },
  { title: "Cinder", url: "https://cinder.test", category: "Blog", imageFile: "cinder.png" },
];
