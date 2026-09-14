/**
 * Tests for the public page.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { JSDOM } from "jsdom";
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

function appWith(entries = SAMPLE) {
  const db = freshDb(entries);
  return createApp({
    config: CONFIG,
    themes: createThemeRepository(db),
    categories: createCategoryRepository(db),
  });
}

const region = (id) => (res) => new JSDOM(res.text).window.document.getElementById(id).outerHTML;
const listOf = region("theme-list");
const pillsOf = region("pill-filters");

describe("GET /", () => {
  it("renders every theme row on the server", async () => {
    const res = await request(appWith()).get("/").expect(200);
    assert.ok(res.text.includes("Aurora"));
    assert.ok(res.text.includes("Basalt"));
    assert.equal(listOf(res).match(/role="option"/g).length, 3);
  });

  it("marks the first theme as the chosen one", async () => {
    const res = await request(appWith()).get("/").expect(200);
    assert.ok(listOf(res).includes('id="theme-1"'));
    assert.match(listOf(res), /id="theme-1"[\s\S]*?aria-selected="true"/);
  });

  it("renders one filter button per category plus All", async () => {
    const res = await request(appWith()).get("/").expect(200);
    assert.equal(pillsOf(res).match(/data-cat="/g).length, 3);
    assert.ok(pillsOf(res).includes('data-cat="All"'));
    assert.ok(pillsOf(res).includes('data-cat="Blog"'));
    assert.ok(pillsOf(res).includes('data-cat="Portfolio"'));
  });

  it("carries the hero, with the theme count in it", async () => {
    const res = await request(appWith()).get("/").expect(200);
    const doc = new JSDOM(res.text).window.document;
    assert.equal(doc.getElementById("hero-count").textContent.trim(), "3");
    assert.ok(doc.querySelector(".hero h1").textContent.trim().length > 0);
  });

  it("states the theme count in the header badge", async () => {
    const res = await request(appWith()).get("/").expect(200);
    const doc = new JSDOM(res.text).window.document;
    assert.equal(doc.getElementById("nav-count").textContent.trim(), "3 themes");
  });

  it("points every screenshot at this app", async () => {
    const res = await request(appWith()).get("/").expect(200);
    assert.ok(res.text.includes('src="/media/theme/1"'));
    assert.ok(!res.text.includes("wp-json"));
  });

  it("gives every row a thumbnail pointing at this app", async () => {
    const res = await request(appWith()).get("/").expect(200);
    const thumbs = [...new JSDOM(listOf(res)).window.document.querySelectorAll("img.thumb")];
    assert.equal(thumbs.length, 3);
    assert.equal(thumbs[0].getAttribute("src"), "/media/theme/1");
    assert.equal(thumbs[0].getAttribute("alt"), "");
  });

  it("numbers nothing in the list", async () => {
    const res = await request(appWith()).get("/").expect(200);
    assert.ok(!listOf(res).includes("01"));
  });

  it("no longer carries a count inside the browser bar", async () => {
    const res = await request(appWith()).get("/").expect(200);
    assert.equal(new JSDOM(res.text).window.document.getElementById("browser-count"), null);
  });

  it("shows the description under the theme name", async () => {
    const db = freshDb(SAMPLE);
    const themes = createThemeRepository(db);
    themes.update(1, {
      title: "Aurora",
      url: "https://aurora.test",
      categoryId: 1,
      description: "Bright and roomy.",
    });
    const app = createApp({ config: CONFIG, themes, categories: createCategoryRepository(db) });

    const res = await request(app).get("/").expect(200);
    const label = new JSDOM(res.text).window.document.getElementById("preview-description");
    assert.equal(label.textContent.trim(), "Bright and roomy.");
  });

  it("leaves the description empty when a theme has none", async () => {
    const res = await request(appWith()).get("/").expect(200);
    const label = new JSDOM(res.text).window.document.getElementById("preview-description");
    assert.equal(label.textContent.trim(), "");
  });

  it("offers the demo address as a chip and a button", async () => {
    const res = await request(appWith()).get("/").expect(200);
    const doc = new JSDOM(res.text).window.document;
    assert.equal(doc.getElementById("demo-chip").getAttribute("href"), "https://aurora.test");
    assert.equal(doc.getElementById("demo-chip-text").textContent.trim(), "aurora.test");
    assert.equal(doc.getElementById("open-demo").getAttribute("href"), "https://aurora.test");
    assert.equal(doc.getElementById("copy-link").dataset.url, "https://aurora.test");
  });

  it("hides every demo control for a theme with no address", async () => {
    const app = appWith([{ title: "Aurora", url: "", category: "Blog", imageFile: "a.png" }]);
    const res = await request(app).get("/").expect(200);
    const doc = new JSDOM(res.text).window.document;
    for (const id of ["demo-chip", "open-demo", "copy-link"]) {
      assert.ok(doc.getElementById(id).classList.contains("hidden"), id);
    }
  });

  it("puts the name and the description under the frame", async () => {
    const res = await request(appWith()).get("/").expect(200);
    const doc = new JSDOM(res.text).window.document;
    assert.equal(doc.querySelector(".shot-body #preview-label").textContent.trim(), "Aurora");
    assert.ok(doc.querySelector(".shot-body #preview-description"));
    assert.ok(doc.querySelector(".shot-body #preview-cat"));
  });

  it("links the address bar to the demo site", async () => {
    const res = await request(appWith()).get("/").expect(200);
    const link = new JSDOM(res.text).window.document.getElementById("browser-url-link");
    assert.equal(link.getAttribute("href"), "https://aurora.test");
    assert.equal(link.getAttribute("target"), "_blank");
    assert.equal(link.getAttribute("rel"), "noopener noreferrer");
  });

  it("inlines the theme data for the browser to take over from", async () => {
    const res = await request(appWith()).get("/").expect(200);
    const match = /<script id="__THEMES__" type="application\/json"[^>]*>([\s\S]*?)<\/script>/.exec(res.text);
    const themes = JSON.parse(
      match[1].replaceAll("\\u003c", "<").replaceAll("\\u003e", ">").replaceAll("\\u0026", "&")
    );
    assert.equal(themes.length, 3);
    assert.deepEqual(themes[0], {
      id: "1",
      name: "Aurora",
      category: "Blog",
      image: "/media/theme/1",
      url: "https://aurora.test",
      description: "",
    });
  });

  it("escapes a hostile theme name rather than letting it run", async () => {
    const app = appWith([
      {
        title: '</script><img src=x onerror=alert(1)>',
        url: "https://evil.test",
        category: "Blog",
        imageFile: "x.png",
      },
    ]);
    const res = await request(app).get("/").expect(200);
    assert.ok(!res.text.includes("<img src=x"));
    assert.ok(res.text.includes("&lt;/script&gt;&lt;img src=x onerror=alert(1)&gt;"));
  });

  it("renders an empty state when there are no themes", async () => {
    const res = await request(appWith([])).get("/").expect(200);
    assert.ok(listOf(res).includes("No themes found"));
  });

  it("answers 503 when the database cannot be read", async () => {
    const db = freshDb(SAMPLE);
    const themes = createThemeRepository(db);
    const broken = {
      list() {
        throw new Error("database is locked");
      },
      findImageFile: themes.findImageFile,
    };
    const app = createApp({
      config: CONFIG,
      themes: broken,
      categories: createCategoryRepository(db),
    });
    const res = await request(app).get("/").expect(503);
    assert.match(res.text, /unavailable/i);
  });
});

describe("content security policy", () => {
  it("allows pictures from this app only", async () => {
    const res = await request(appWith()).get("/");
    assert.ok(res.headers["content-security-policy"].includes("img-src 'self' data:"));
  });

  it("names no origin outside this application", async () => {
    const res = await request(appWith()).get("/");
    const policy = res.headers["content-security-policy"];
    assert.ok(policy.includes("style-src 'self'"));
    assert.ok(policy.includes("font-src 'self'"));
    assert.ok(!policy.includes("fonts.googleapis.com"));
    assert.ok(!policy.includes("fonts.gstatic.com"));
  });

  it("asks the browser for nothing from another origin", async () => {
    const res = await request(appWith()).get("/");
    assert.ok(!res.text.includes("https://fonts."));
  });

  it("gives each page a fresh script permission token", async () => {
    const app = appWith();
    const nonceOf = (res) => /'nonce-([^']+)'/.exec(res.headers["content-security-policy"])[1];
    const first = await request(app).get("/");
    const second = await request(app).get("/");
    assert.notEqual(nonceOf(first), nonceOf(second));
  });
});

describe("static modules", () => {
  it("serves the browser entry point and the shared modules", async () => {
    const app = appWith();
    await request(app).get("/js/main.js").expect(200);
    const store = await request(app).get("/shared/store.js").expect(200);
    assert.ok(store.text.includes("export function createStore"));
    await request(app).get("/shared/view-model.js").expect(200);
    await request(app).get("/shared/templates.js").expect(200);
  });
});
