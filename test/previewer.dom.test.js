/**
 * tests for event setup, over the real server-rendered page.
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
import { startPreviewer } from "../public/js/previewer.js";

const ADMIN = {
  ADMIN_USERNAME: "chris",
  ADMIN_PASSWORD_HASH: "scrypt$c2FsdA==$a2V5",
  SESSION_SECRET: "a-secret",
};


const CONFIG = loadConfig(ADMIN);

const THEMES = [
  { title: "Aurora", url: "https://aurora.test", category: "Blog", imageFile: "aurora.png" },
  { title: "Basalt", url: "https://basalt.test", category: "Portfolio", imageFile: "basalt.png" },
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

const activeId = () => document.querySelector('[aria-selected="true"]')?.dataset.id ?? null;
const rowIds = () => [...document.querySelectorAll("#theme-list [role=option]")].map((el) => el.dataset.id);
const el = (id) => document.getElementById(id);

function key(target, k) {
  target.dispatchEvent(new window.KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
}

let clipboard;

beforeEach(async () => {
  const win = await renderPage();
  clipboard = { writeText: mock.fn(() => Promise.resolve()) };
  startPreviewer({ root: document, win, fallbackImage: CONFIG.fallbackImage, clipboard });
});

describe("pointer interaction", () => {
  it("selects the clicked row", () => {
    el("theme-2").click();
    assert.equal(activeId(), "2");
  });

  it("filters when the search box is typed into", () => {
    el("search").value = "cin";
    el("search").dispatchEvent(new window.Event("input", { bubbles: true }));
    assert.deepEqual(rowIds(), ["3"]);
  });

  it("filters when a category pill is clicked", () => {
    document.querySelector('[data-cat="Portfolio"]').click();
    assert.deepEqual(rowIds(), ["2"]);
  });

  it("advances with the Next button", () => {
    el("next-btn").click();
    assert.equal(activeId(), "2");
  });

  it("goes back with the Prev button", () => {
    el("next-btn").click();
    el("prev-btn").click();
    assert.equal(activeId(), "1");
  });
});

describe("keyboard interaction", () => {
  it("moves down the list with ArrowDown", () => {
    key(el("theme-list"), "ArrowDown");
    assert.equal(activeId(), "2");
  });

  it("moves back up with ArrowUp", () => {
    key(el("theme-list"), "ArrowDown");
    key(el("theme-list"), "ArrowUp");
    assert.equal(activeId(), "1");
  });

  it("moves through the list from the search box too", () => {
    key(el("search"), "ArrowDown");
    assert.equal(activeId(), "2");
  });

  it("does not double open the demo when Enter is pressed on the address bar link", () => {
    const opened = mock.fn();
    window.open = opened;
    key(el("browser-url-link"), "Enter");
    assert.equal(opened.mock.callCount(), 0);
  });

  it("leaves arrow keys alone outside the previewer", () => {
    key(document.body, "ArrowDown");
    assert.equal(activeId(), "1");
  });

  it("prevents the page from scrolling when it handles an arrow key", () => {
    const event = new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true, cancelable: true });
    el("theme-list").dispatchEvent(event);
    assert.equal(event.defaultPrevented, true);
  });

  it("opens the active demo in a new tab on Enter", () => {
    const open = mock.fn();
    window.open = open;
    key(el("theme-list"), "Enter");
    assert.deepEqual(open.mock.calls.at(-1).arguments, ["https://aurora.test", "_blank", "noopener,noreferrer"]);
  });

  it("does nothing on Enter when the active theme has no demo address", () => {
    const open = mock.fn();
    window.open = open;
    el("theme-3").click();
    key(el("theme-list"), "Enter");
    assert.equal(open.mock.callCount(), 0);
  });
});

describe("hydration", () => {
  const boot = () => startPreviewer({ root: document, win: window, fallbackImage: CONFIG.fallbackImage });

  it("hydrates an empty list rather than throwing when the state blob is unparseable", () => {
    document.getElementById("__THEMES__").textContent = "{not json";
    let store;
    assert.doesNotThrow(() => { store = boot(); });
    assert.deepEqual(store.getState().themes, []);
  });

  it("hydrates an empty list when the state blob is valid JSON but not an array", () => {
    document.getElementById("__THEMES__").textContent = '{"themes":[]}';
    assert.deepEqual(boot().getState().themes, []);
  });

  it("hydrates an empty list when the state blob is absent entirely", () => {
    document.getElementById("__THEMES__").remove();
    assert.deepEqual(boot().getState().themes, []);
  });
});

describe("image failure", () => {
  it("swaps to the fallback image when the screenshot fails to load", () => {
    const img = el("preview-image");
    img.dispatchEvent(new window.Event("error"));
    assert.equal(img.getAttribute("src"), CONFIG.fallbackImage);
  });

  it("does not loop when the fallback image itself fails", () => {
    const img = el("preview-image");
    img.dispatchEvent(new window.Event("error"));
    img.dispatchEvent(new window.Event("error"));
    assert.equal(img.getAttribute("src"), CONFIG.fallbackImage);
  });
});

describe("copying the demo address", () => {
  const settle = () => new Promise((resolve) => setImmediate(resolve));

  it("puts the active theme's address on the clipboard", async () => {
    el("copy-link").click();
    await settle();
    assert.equal(clipboard.writeText.mock.callCount(), 1);
    assert.equal(clipboard.writeText.mock.calls[0].arguments[0], "https://aurora.test");
  });

  it("says so, then puts its own label back", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });
    el("copy-link").click();
    await settle();
    assert.equal(el("copy-link-label").textContent, "Copied");
    mock.timers.tick(1500);
    assert.equal(el("copy-link-label").textContent, "Copy link");
    mock.timers.reset();
  });

  it("leaves the label alone when the clipboard refuses", async () => {
    clipboard.writeText = mock.fn(() => Promise.reject(new Error("denied")));
    el("copy-link").click();
    await settle();
    assert.equal(el("copy-link-label").textContent, "Copy link");
  });
});
