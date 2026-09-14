/**
 * Tests that the browser renders
 */

import { describe, it, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../lib/app.js";
import { createThemeRepository } from "../repositories/theme-repository.js";
import { createCategoryRepository } from "../repositories/category-repository.js";
import { freshDb } from "./helpers/db.js";
import { installDom } from "./helpers/dom.js";
import { loadConfig } from "../config/index.js";
import { createStore } from "../shared/store.js";
import { createRenderer } from "../public/js/render.js";

const ADMIN = {
  ADMIN_USERNAME: "chris",
  ADMIN_PASSWORD_HASH: "scrypt$c2FsdA==$a2V5",
  SESSION_SECRET: "a-secret",
};


const CONFIG = loadConfig(ADMIN);

const THEMES = [
  { title: "Aurora", url: "https://aurora.test", category: "Blog", imageFile: "aurora.png" },
  {
    title: "Basalt",
    url: "https://basalt.test",
    category: "Portfolio",
    imageFile: "basalt.png",
    description: "Dense and dark.",
  },
  { title: "Cinder", url: "", category: "Blog", imageFile: "missing.png" },
];

async function renderPage() {
  const db = freshDb(THEMES);
  const app = createApp({
    config: CONFIG,
    themes: createThemeRepository(db),
    categories: createCategoryRepository(db),
  });
  const res = await request(app).get("/");
  return installDom(res.text);
}

let store;
let render;

beforeEach(async () => {
  await renderPage();

  store = createStore({ themes: JSON.parse(document.getElementById("__THEMES__").textContent) });
  render = createRenderer({ root: document, fallbackImage: CONFIG.fallbackImage });
  render(store.getState(), null);
});

const rowIds = () => [...document.querySelectorAll("#theme-list [role=option]")].map((el) => el.dataset.id);

describe("the browser render matches what the server rendered", () => {
  it("starts from the server-rendered rows", () => {
    assert.deepEqual(rowIds(), ["1", "2", "3"]);
  });

  it("leaves the active row marked after a no-op render", () => {
    assert.equal(document.querySelector('[aria-selected="true"]').dataset.id, "1");
  });
});

describe("filtering", () => {
  it("shows only the matching rows for a query", () => {
    const prev = store.getState();
    store.dispatch({ type: "SET_QUERY", query: "cin" });
    render(store.getState(), prev);
    assert.deepEqual(rowIds(), ["3"]);
  });

  it("names the matching row", () => {
    const prev = store.getState();
    store.dispatch({ type: "SET_QUERY", query: "cin" });
    render(store.getState(), prev);
    assert.equal(document.querySelector("#theme-list .name").textContent.trim(), "Cinder");
  });

  it("shows the empty state when nothing matches", () => {
    const prev = store.getState();
    store.dispatch({ type: "SET_QUERY", query: "zzz" });
    render(store.getState(), prev);
    assert.deepEqual(rowIds(), []);
    assert.ok((document.getElementById("theme-list").textContent).includes("No themes found"));
  });

  it("updates the filter summary line", () => {
    const prev = store.getState();
    store.dispatch({ type: "SET_CATEGORY", category: "Blog" });
    render(store.getState(), prev);
    assert.equal(document.getElementById("filter-meta").textContent, "Showing 2 themes");
  });

  it("recounts the pills as the search narrows", () => {
    const prev = store.getState();
    store.dispatch({ type: "SET_QUERY", query: "aurora" });
    render(store.getState(), prev);
    assert.equal(document.querySelector('[data-cat="Blog"] .count').textContent, "1");
    assert.equal(document.querySelector('[data-cat="Portfolio"] .count').textContent, "0");
    assert.equal(document.querySelector('[data-cat="Portfolio"]').disabled, true);
  });

  it("marks the chosen category pill as pressed", () => {
    const prev = store.getState();
    store.dispatch({ type: "SET_CATEGORY", category: "Blog" });
    render(store.getState(), prev);
    assert.equal(document.querySelector('[data-cat="Blog"]').getAttribute("aria-pressed"), "true");
  });
});

describe("selection", () => {
  it("swaps the preview image, address, and label once the transition completes", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "2" });
    render(store.getState(), prev);
    mock.timers.tick(10_000);
    mock.timers.reset();
    assert.equal(document.getElementById("preview-image").getAttribute("src"), "/media/theme/2");
    assert.equal(document.getElementById("browser-url").textContent, "https://basalt.test");
    assert.equal(document.getElementById("preview-label").textContent, "Basalt");
  });

  it("swaps the description with the theme", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "2" });
    render(store.getState(), prev);
    mock.timers.tick(10_000);
    mock.timers.reset();
    assert.equal(
      document.getElementById("preview-description").textContent,
      "Dense and dark."
    );
  });

  it("empties the description for a theme without one", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "3" });
    render(store.getState(), prev);
    mock.timers.tick(10_000);
    mock.timers.reset();
    assert.equal(document.getElementById("preview-description").textContent, "");
  });

  it("repoints the address bar link when the theme changes", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "2" });
    render(store.getState(), prev);
    mock.timers.tick(10_000);
    mock.timers.reset();
    const link = document.getElementById("browser-url-link");
    assert.equal(link.getAttribute("href"), "https://basalt.test");
    assert.ok((link.getAttribute("aria-label")).includes("Basalt"));
    assert.equal(document.getElementById("browser-url-icon").classList.contains("hidden"), false);
  });

  it("repoints every demo control when the theme changes", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "2" });
    render(store.getState(), prev);
    mock.timers.tick(10_000);
    mock.timers.reset();
    assert.equal(document.getElementById("demo-chip").getAttribute("href"), "https://basalt.test");
    assert.equal(document.getElementById("demo-chip-text").textContent, "basalt.test");
    assert.equal(document.getElementById("open-demo").getAttribute("href"), "https://basalt.test");
    assert.equal(document.getElementById("copy-link").dataset.url, "https://basalt.test");
  });

  it("hides every demo control for a theme with no address", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "3" });
    render(store.getState(), prev);
    mock.timers.tick(10_000);
    mock.timers.reset();
    for (const id of ["demo-chip", "open-demo", "copy-link"]) {
      assert.equal(document.getElementById(id).classList.contains("hidden"), true, id);
    }
  });

  it("unlinks the address bar for a theme with no demo site", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "3" });
    render(store.getState(), prev);
    mock.timers.tick(10_000);
    mock.timers.reset();
    const link = document.getElementById("browser-url-link");
    assert.equal(link.hasAttribute("href"), false);
    assert.equal(link.hasAttribute("aria-label"), false);
    assert.equal(document.getElementById("browser-url-icon").classList.contains("hidden"), true);
  });

  it("points at the media route even for a theme whose file is missing", () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "3" });
    render(store.getState(), prev);
    mock.timers.tick(10_000);
    mock.timers.reset();
    assert.equal(document.getElementById("preview-image").getAttribute("src"), "/media/theme/3");
  });

  it("crossfades over exactly the duration the markup declares", () => {
    const image = document.getElementById("preview-image");
    const declared = Number(image.dataset.transitionMs);
    assert.ok((declared) > 0);

    mock.timers.enable({ apis: ["setTimeout"] });
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "2" });
    render(store.getState(), prev);

    mock.timers.tick(declared - 1);
    assert.equal(image.getAttribute("src"), "/media/theme/1");
    mock.timers.tick(1);
    assert.equal(image.getAttribute("src"), "/media/theme/2");
    mock.timers.reset();
  });

  it("points aria-activedescendant at the active row", () => {
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "2" });
    render(store.getState(), prev);
    assert.equal(document.getElementById("theme-list").getAttribute("aria-activedescendant"), "theme-2");
  });

  it("disables Prev on the first theme and Next on the last", () => {
    assert.equal(document.getElementById("prev-btn").disabled, true);
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "3" });
    render(store.getState(), prev);
    assert.equal(document.getElementById("next-btn").disabled, true);
    assert.equal(document.getElementById("prev-btn").disabled, false);
  });

  it("updates the progress counters", () => {
    const prev = store.getState();
    store.dispatch({ type: "SELECT", id: "2" });
    render(store.getState(), prev);
    assert.equal(document.getElementById("progress").textContent, "2 of 3");
  });

  it("keeps the hero count in step with the theme list", () => {
    assert.equal(document.getElementById("hero-count").textContent, "3");
  });

  it("escapes a hostile theme name rather than executing it", () => {
    const evil = { id: "evil", name: "<img src=x onerror=window.__pwned=1>", category: "Blog", image: "", url: "" };
    const s = createStore({ themes: [...THEMES, evil] });
    const prev = s.getState();
    s.dispatch({ type: "SET_QUERY", query: "img" });
    render(s.getState(), prev);
    const row = document.querySelector("#theme-list .name");
    assert.equal(row.textContent, "<img src=x onerror=window.__pwned=1>");
    assert.equal(row.querySelectorAll("img").length, 0);
    assert.equal(window.__pwned, undefined);
  });
});
