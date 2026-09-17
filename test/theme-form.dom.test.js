/**
 * Tests for the screenshot drop zone
 */

import { describe, it, beforeEach, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { createApp } from "../lib/app.js";
import { createThemeRepository } from "../repositories/theme-repository.js";
import { createCategoryRepository } from "../repositories/category-repository.js";
import { loadConfig } from "../config/index.js";
import { hashPassword } from "../lib/password.js";
import { freshDb, SAMPLE } from "./helpers/db.js";
import { installDom } from "./helpers/dom.js";
import { startThemeForm } from "../public/js/theme-form.js";

const PASSWORD = "correct horse battery staple";

let uploadDir;

after(() => {
  if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
});

async function openForm(url = "/admin/themes/new") {
  uploadDir = uploadDir ?? mkdtempSync(path.join(tmpdir(), "standalone-drop-"));

  const config = loadConfig({
    ADMIN_USERNAME: "chris",
    ADMIN_PASSWORD_HASH: hashPassword(PASSWORD),
    SESSION_SECRET: "a-secret-for-tests",
    UPLOAD_DIR: uploadDir,
    MAX_IMAGE_BYTES: "2048",
  });

  const db = freshDb(SAMPLE);
  const app = createApp({
    config,
    themes: createThemeRepository(db),
    categories: createCategoryRepository(db),
  });

  const page = await request(app).get("/admin/login").expect(200);
  const csrfCookie = (page.headers["set-cookie"] ?? []).map((c) => c.split(";")[0]).join("; ");
  const token = /name="_csrf" value="([^"]+)"/.exec(page.text)[1];

  const signedIn = await request(app)
    .post("/admin/login")
    .set("Cookie", csrfCookie)
    .type("form")
    .send({ _csrf: token, username: "chris", password: PASSWORD })
    .expect(302);

  const session = (signedIn.headers["set-cookie"] ?? [])
    .find((c) => c.startsWith("admin_session="))
    .split(";")[0];

  const form = await request(app).get(url).set("Cookie", `${session}; ${csrfCookie}`).expect(200);
  return installDom(form.text);
}

const el = (id) => document.getElementById(id);

const fileOf = (name, type, bytes) =>
  new window.File([new Uint8Array(bytes)], name, { type });

function choose(...files) {
  Object.defineProperty(el("image"), "files", { value: files, writable: true, configurable: true });
  el("image").dispatchEvent(new window.Event("change", { bubbles: true }));
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(async () => {
  const win = await openForm();
  Object.defineProperty(el("image"), "files", { value: [], writable: true, configurable: true });
  startThemeForm({ root: document, win });
});

describe("before anything is chosen", () => {
  it("says what may be dropped and how large it may be", () => {
    assert.match(el("drop-zone").textContent, /2 KB/);
    assert.match(el("drop-zone").textContent, /Drag a screenshot here/);
  });

  it("shows no preview, no name and no complaint", () => {
    assert.equal(el("drop-preview").classList.contains("hidden"), true);
    assert.equal(el("drop-name").textContent, "");
    assert.equal(el("drop-error").classList.contains("hidden"), true);
  });
});

describe("choosing a screenshot", () => {
  it("names the file", async () => {
    choose(fileOf("aurora.png", "image/png", 100));
    await settle();
    assert.match(el("drop-name").textContent, /aurora\.png/);
  });

  it("says how big it is alongside the name", async () => {
    choose(fileOf("aurora.png", "image/png", 1024));
    await settle();
    assert.match(el("drop-name").textContent, /1 KB/);
  });

  it("shows it, as a data address the content policy allows", async () => {
    choose(fileOf("aurora.png", "image/png", 100));
    await settle();
    const preview = el("drop-preview");
    assert.equal(preview.classList.contains("hidden"), false);
    assert.match(preview.getAttribute("src"), /^data:/);
  });
});

describe("a file that will not do", () => {
  it("refuses one over the limit, and says what the limit is", async () => {
    choose(fileOf("huge.png", "image/png", 4096));
    await settle();
    assert.equal(el("drop-error").classList.contains("hidden"), false);
    assert.match(el("drop-error-text").textContent, /2 KB/);
  });

  it("clears the chooser, so nothing over the limit is ever sent", async () => {
    choose(fileOf("huge.png", "image/png", 4096));
    await settle();
    assert.equal(el("image").value, "");
    assert.equal(el("drop-preview").classList.contains("hidden"), true);
  });

  it("refuses a kind it does not take", async () => {
    choose(fileOf("map.svg", "image/svg+xml", 100));
    await settle();
    assert.equal(el("drop-error").classList.contains("hidden"), false);
    assert.match(el("drop-error-text").textContent, /PNG/);
  });

  it("forgets the complaint once something acceptable arrives", async () => {
    choose(fileOf("huge.png", "image/png", 4096));
    await settle();
    choose(fileOf("small.png", "image/png", 100));
    await settle();
    assert.equal(el("drop-error").classList.contains("hidden"), true);
    assert.equal(el("drop-preview").classList.contains("hidden"), false);
  });
});

describe("dragging", () => {
  function drag(type, files = []) {
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(event, "dataTransfer", { value: { files } });
    el("drop-zone").dispatchEvent(event);
    return event;
  }

  it("marks the zone while something is held over it", () => {
    drag("dragover");
    assert.equal(el("drop-zone").classList.contains("is-over"), true);
    drag("dragleave");
    assert.equal(el("drop-zone").classList.contains("is-over"), false);
  });

  it("takes a dropped file the same way as a chosen one", async () => {
    drag("drop", [fileOf("dropped.png", "image/png", 100)]);
    await settle();
    assert.match(el("drop-name").textContent, /dropped\.png/);
    assert.equal(el("drop-preview").classList.contains("hidden"), false);
    assert.equal(el("image").files[0].name, "dropped.png");
  });

  it("refuses a dropped file over the limit too", async () => {
    drag("drop", [fileOf("huge.png", "image/png", 4096)]);
    await settle();
    assert.equal(el("drop-error").classList.contains("hidden"), false);
  });

  it("stops the browser opening a file dropped on the page", () => {
    assert.equal(drag("dragover").defaultPrevented, true);
    assert.equal(drag("drop").defaultPrevented, true);
  });
});

describe("the form the current screenshot belongs to", () => {
  it("starts by showing what is already there", async () => {
    await openForm("/admin/themes/1/edit");
    startThemeForm({ root: document, win: window });
    assert.equal(el("drop-preview").classList.contains("hidden"), false);
    assert.equal(el("drop-preview").getAttribute("src"), "/media/theme/1");
  });
});

describe("the upload and generate choice", () => {
  it("offers both ways to get a screenshot, with upload chosen", () => {
    assert.equal(el("mode-upload").checked, true);
    assert.equal(el("mode-generate").checked, false);
    assert.equal(el("mode-upload").name, "mode");
    assert.equal(el("mode-generate").name, "mode");
  });

  it("hides the generate panel until it is chosen", () => {
    assert.equal(el("generate-panel").classList.contains("hidden"), true);
  });

  it("points the generate button at the capture route", () => {
    assert.equal(el("generate-button").getAttribute("formaction"), "/admin/themes/screenshot");
    assert.equal(el("generate-button").hasAttribute("formnovalidate"), true);
  });

  it("carries an empty theme id on the add form", () => {
    assert.equal(document.querySelector('input[name="themeId"]').value, "");
  });

  it("requires a file while no capture is waiting", () => {
    assert.equal(el("image").hasAttribute("required"), true);
    assert.equal(el("generated-file").value, "");
  });

  it("offers the whole page by default", () => {
    const box = el("capture-full-page");
    assert.equal(box.getAttribute("name"), "fullPage");
    assert.equal(box.checked, true);
  });

  it("starts the capture address from the demo address on the edit form", async () => {
    await openForm("/admin/themes/1/edit");
    assert.equal(el("capture-url").value, el("url").value);
    assert.equal(document.querySelector('input[name="themeId"]').value, "1");
  });
});
