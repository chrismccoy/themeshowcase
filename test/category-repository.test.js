/**
 * Tests for reading categories.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createCategoryRepository } from "../repositories/category-repository.js";
import { freshDb, SAMPLE } from "./helpers/db.js";

describe("createCategoryRepository.list", () => {
  it("returns nothing for an empty database", () => {
    const categories = createCategoryRepository(freshDb());
    assert.deepEqual(categories.list(), []);
  });

  it("returns every category in position order", () => {
    const categories = createCategoryRepository(freshDb(SAMPLE));
    assert.deepEqual(
      categories.list().map((category) => category.name),
      ["Blog", "Portfolio"]
    );
  });

  it("counts the themes in each category", () => {
    const categories = createCategoryRepository(freshDb(SAMPLE));
    assert.deepEqual(categories.list(), [
      { id: 1, name: "Blog", count: 2 },
      { id: 2, name: "Portfolio", count: 1 },
    ]);
  });

  it("counts an empty category as zero rather than leaving it out", () => {
    const db = freshDb(SAMPLE);
    db.prepare("INSERT INTO categories (name, position) VALUES (?, ?)").run("Gallery", 3);
    const categories = createCategoryRepository(db);
    assert.deepEqual(categories.list().at(-1), { id: 3, name: "Gallery", count: 0 });
  });
});

describe("createCategoryRepository writes", () => {
  it("creates a category and puts it last", () => {
    const categories = createCategoryRepository(freshDb(SAMPLE));
    const id = categories.create("Gallery");
    assert.equal(categories.list().at(-1).name, "Gallery");
    assert.equal(categories.findById(id).name, "Gallery");
  });

  it("refuses a name already in use", () => {
    const categories = createCategoryRepository(freshDb(SAMPLE));
    assert.throws(() => categories.create("Blog"), /UNIQUE/);
  });

  it("renames one", () => {
    const categories = createCategoryRepository(freshDb(SAMPLE));
    categories.rename(1, "Writing");
    assert.equal(categories.findById(1).name, "Writing");
  });

  it("refuses a rename onto a name already in use", () => {
    const categories = createCategoryRepository(freshDb(SAMPLE));
    assert.throws(() => categories.rename(1, "Portfolio"), /UNIQUE/);
  });

  it("deletes one that holds nothing", () => {
    const categories = createCategoryRepository(freshDb(SAMPLE));
    const id = categories.create("Gallery");
    categories.remove(id);
    assert.equal(categories.findById(id), undefined);
  });

  it("refuses to delete one that still holds themes", () => {
    const categories = createCategoryRepository(freshDb(SAMPLE));
    assert.throws(() => categories.remove(1), /FOREIGN KEY/);
  });

  it("gives nothing for a category that does not exist", () => {
    const categories = createCategoryRepository(freshDb(SAMPLE));
    assert.equal(categories.findById(99), undefined);
  });
});
