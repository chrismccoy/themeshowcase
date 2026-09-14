/**
 * Tests for reading themes.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createThemeRepository } from "../repositories/theme-repository.js";
import { freshDb, SAMPLE } from "./helpers/db.js";

describe("createThemeRepository.list", () => {
  it("returns nothing for an empty database", () => {
    const themes = createThemeRepository(freshDb());
    assert.deepEqual(themes.list(), []);
  });

  it("returns every theme in position order", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    assert.deepEqual(
      themes.list().map((theme) => theme.name),
      ["Aurora", "Basalt", "Cinder"]
    );
  });

  it("gives identifiers as strings, which is what the browser reads back", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    for (const theme of themes.list()) {
      assert.equal(typeof theme.id, "string");
    }
  });

  it("shapes a row the way the front end expects", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    const [first] = themes.list();
    assert.deepEqual(first, {
      id: "1",
      name: "Aurora",
      category: "Blog",
      image: "/media/theme/1",
      url: "https://aurora.test",
      description: "",
    });
  });

  it("points every picture at this app rather than at a file name", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    for (const theme of themes.list()) {
      assert.match(theme.image, /^\/media\/theme\/\d+$/);
    }
  });

  it("names the category rather than its number", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    assert.deepEqual(
      themes.list().map((theme) => theme.category),
      ["Blog", "Portfolio", "Blog"]
    );
  });
});

describe("createThemeRepository.findImageFile", () => {
  it("gives the stored file name for a theme", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    assert.equal(themes.findImageFile(2), "basalt.png");
  });

  it("gives nothing for a theme that does not exist", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    assert.equal(themes.findImageFile(99), undefined);
  });

  it("gives nothing for an identifier that is not a number", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    assert.equal(themes.findImageFile("nonsense"), undefined);
  });
});

describe("createThemeRepository writes", () => {
  function repo() {
    const db = freshDb(SAMPLE);
    return { themes: createThemeRepository(db), db };
  }

  it("creates a theme at the end of the list", () => {
    const { themes } = repo();
    const id = themes.create({
      title: "Dune",
      url: "https://dune.test",
      categoryId: 1,
      imageFile: "dune.png",
    });
    assert.equal(themes.list().at(-1).name, "Dune");
    assert.equal(themes.findById(id).title, "Dune");
  });

  it("gives a new theme a position after every existing one", () => {
    const { themes } = repo();
    const id = themes.create({
      title: "Dune",
      url: "https://dune.test",
      categoryId: 1,
      imageFile: "dune.png",
    });
    assert.ok(themes.findById(id).position > themes.findById(3).position);
  });

  it("refuses a theme in a category that does not exist", () => {
    const { themes } = repo();
    assert.throws(
      () =>
        themes.create({
          title: "Dune",
          url: "https://dune.test",
          categoryId: 99,
          imageFile: "dune.png",
        }),
      /FOREIGN KEY/
    );
  });

  it("updates the fields it is given", () => {
    const { themes } = repo();
    themes.update(1, {
      title: "Aurora Two",
      url: "https://aurora2.test",
      categoryId: 2,
      imageFile: "new.png",
    });
    const theme = themes.findById(1);
    assert.equal(theme.title, "Aurora Two");
    assert.equal(theme.url, "https://aurora2.test");
    assert.equal(theme.categoryId, 2);
    assert.equal(theme.imageFile, "new.png");
  });

  it("keeps the existing screenshot when the update leaves it out", () => {
    const { themes } = repo();
    themes.update(1, { title: "Aurora Two", url: "https://aurora2.test", categoryId: 1 });
    assert.equal(themes.findById(1).imageFile, "aurora.png");
    assert.equal(themes.findById(1).title, "Aurora Two");
  });

  it("leaves the position alone when updating", () => {
    const { themes } = repo();
    const before = themes.findById(1).position;
    themes.update(1, { title: "Aurora Two", url: "https://aurora2.test", categoryId: 1 });
    assert.equal(themes.findById(1).position, before);
  });

  it("deletes a theme and says which file it was using", () => {
    const { themes } = repo();
    assert.equal(themes.remove(2), "basalt.png");
    assert.equal(themes.findById(2), undefined);
    assert.equal(themes.list().length, 2);
  });

  it("gives nothing when deleting a theme that is not there", () => {
    const { themes } = repo();
    assert.equal(themes.remove(99), undefined);
  });

  it("gives nothing for a theme that does not exist", () => {
    const { themes } = repo();
    assert.equal(themes.findById(99), undefined);
  });
});

describe("createThemeRepository descriptions", () => {
  it("stores a description given at creation", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    const id = themes.create({
      title: "Dune",
      url: "https://dune.test",
      categoryId: 1,
      imageFile: "dune.png",
      description: "A spare theme for long reads.",
    });
    assert.equal(themes.findById(id).description, "A spare theme for long reads.");
  });

  it("leaves it empty when none is given", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    const id = themes.create({
      title: "Dune",
      url: "https://dune.test",
      categoryId: 1,
      imageFile: "dune.png",
    });
    assert.equal(themes.findById(id).description, "");
  });

  it("changes a description on update", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    themes.update(1, {
      title: "Aurora",
      url: "https://aurora.test",
      categoryId: 1,
      description: "Bright and roomy.",
    });
    assert.equal(themes.findById(1).description, "Bright and roomy.");
  });

  it("clears a description when the update sends an empty one", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    themes.update(1, {
      title: "Aurora",
      url: "https://aurora.test",
      categoryId: 1,
      description: "Bright and roomy.",
    });
    themes.update(1, {
      title: "Aurora",
      url: "https://aurora.test",
      categoryId: 1,
      description: "",
    });
    assert.equal(themes.findById(1).description, "");
  });

  it("carries the description into the list the front end reads", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    themes.update(1, {
      title: "Aurora",
      url: "https://aurora.test",
      categoryId: 1,
      description: "Bright and roomy.",
    });
    assert.equal(themes.list()[0].description, "Bright and roomy.");
  });
});

describe("createThemeRepository reordering", () => {
  const names = (themes) => themes.list().map((theme) => theme.name);

  it("moves a theme up", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    themes.moveUp(2);
    assert.deepEqual(names(themes), ["Basalt", "Aurora", "Cinder"]);
  });

  it("moves a theme down", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    themes.moveDown(2);
    assert.deepEqual(names(themes), ["Aurora", "Cinder", "Basalt"]);
  });

  it("does nothing when the first is moved up", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    themes.moveUp(1);
    assert.deepEqual(names(themes), ["Aurora", "Basalt", "Cinder"]);
  });

  it("does nothing when the last is moved down", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    themes.moveDown(3);
    assert.deepEqual(names(themes), ["Aurora", "Basalt", "Cinder"]);
  });

  it("does nothing for a theme that does not exist", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    themes.moveUp(99);
    themes.moveDown(99);
    assert.deepEqual(names(themes), ["Aurora", "Basalt", "Cinder"]);
  });

  it("still swaps neighbours when deleting has left gaps in the numbering", () => {
    const db = freshDb(SAMPLE);
    const themes = createThemeRepository(db);
    themes.remove(2);
    assert.deepEqual(names(themes), ["Aurora", "Cinder"]);
    themes.moveUp(3);
    assert.deepEqual(names(themes), ["Cinder", "Aurora"]);
  });

  it("survives a move repeated to the end and back", () => {
    const themes = createThemeRepository(freshDb(SAMPLE));
    themes.moveDown(1);
    themes.moveDown(1);
    assert.deepEqual(names(themes), ["Basalt", "Cinder", "Aurora"]);
    themes.moveUp(1);
    themes.moveUp(1);
    assert.deepEqual(names(themes), ["Aurora", "Basalt", "Cinder"]);
  });
});
