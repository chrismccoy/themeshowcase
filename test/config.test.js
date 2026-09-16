/**
 * Tests for environment parsing and validation.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { loadConfig } from "../config/index.js";

const ADMIN = {
  ADMIN_USERNAME: "chris",
  ADMIN_PASSWORD_HASH: "scrypt$c2FsdA==$a2V5",
  SESSION_SECRET: "a-secret",
};

describe("loadConfig", () => {
  it("defaults the port, the database file, and the upload directory", () => {
    const cfg = loadConfig(ADMIN);
    assert.equal(cfg.port, 3000);
    assert.equal(cfg.databaseFile, "data/themes.db");
    assert.equal(cfg.uploadDir, "data/uploads");
  });

  it("reads overrides from the environment", () => {
    const cfg = loadConfig({ ...ADMIN, PORT: "8080", DATABASE_FILE: "/tmp/x.db", UPLOAD_DIR: "/tmp/up" });
    assert.equal(cfg.port, 8080);
    assert.equal(cfg.databaseFile, "/tmp/x.db");
    assert.equal(cfg.uploadDir, "/tmp/up");
  });

  it("carries a screenshot size limit, so uploads are never unbounded", () => {
    assert.equal(loadConfig(ADMIN).maxImageBytes, 5 * 1024 * 1024);
  });

  it("reads MAX_IMAGE_BYTES", () => {
    assert.equal(loadConfig({ ...ADMIN, MAX_IMAGE_BYTES: "1048576" }).maxImageBytes, 1048576);
  });

  it("rejects a MAX_IMAGE_BYTES that is not a positive whole number", () => {
    assert.throws(() => loadConfig({ ...ADMIN, MAX_IMAGE_BYTES: "0" }), /MAX_IMAGE_BYTES/);
    assert.throws(() => loadConfig({ ...ADMIN, MAX_IMAGE_BYTES: "lots" }), /MAX_IMAGE_BYTES/);
  });

  it("rejects a non-numeric PORT rather than falling back silently", () => {
    assert.throws(() => loadConfig({ ...ADMIN, PORT: "abc" }), /PORT/);
  });

  it("rejects a zero or negative PORT", () => {
    assert.throws(() => loadConfig({ ...ADMIN, PORT: "0" }), /PORT/);
  });

  it("serves its own fallback image by default", () => {
    assert.equal(loadConfig(ADMIN).fallbackImage, "/img/placeholder.svg");
  });

  it("rejects an absolute FALLBACK_IMAGE, which would leak a third-party origin", () => {
    assert.throws(() => loadConfig({ ...ADMIN, FALLBACK_IMAGE: "https://cdn.test/a.png" }), /FALLBACK_IMAGE/);
  });

  it("has no navigation links by default", () => {
    assert.deepEqual(loadConfig(ADMIN).navLinks, []);
  });

  it("parses navigation links as label and address pairs", () => {
    const cfg = loadConfig({ ...ADMIN, NAV_LINKS: "Github|https://github.test, Docs|https://docs.test" });
    assert.deepEqual(cfg.navLinks, [
      { label: "Github", href: "https://github.test" },
      { label: "Docs", href: "https://docs.test" },
    ]);
  });

  it("drops a navigation entry missing its address", () => {
    assert.deepEqual(loadConfig({ ...ADMIN, NAV_LINKS: "Broken" }).navLinks, []);
  });

  it("carries no webfont settings at all", () => {
    const cfg = loadConfig(ADMIN);
    assert.equal(cfg.fonts, undefined);
  });

  it("requires the administrator settings", () => {
    const full = {
      ADMIN_USERNAME: "chris",
      ADMIN_PASSWORD_HASH: "scrypt$c2FsdA==$a2V5",
      SESSION_SECRET: "a-secret",
    };
    for (const missing of Object.keys(full)) {
      const env = { ...full };
      delete env[missing];
      assert.throws(() => loadConfig(env), new RegExp(missing));
    }
  });

  it("reads the administrator settings", () => {
    const cfg = loadConfig(ADMIN);
    assert.equal(cfg.adminUsername, "chris");
    assert.equal(cfg.adminPasswordHash, "scrypt$c2FsdA==$a2V5");
    assert.equal(cfg.sessionSecret, "a-secret");
  });

  it("defaults the session lifetime and the attempt limit", () => {
    const cfg = loadConfig(ADMIN);
    assert.equal(cfg.sessionTtlHours, 168);
    assert.equal(cfg.loginMaxAttempts, 5);
    assert.equal(cfg.loginWindowMinutes, 15);
  });

  it("reads overrides for the session lifetime and the attempt limit", () => {
    const cfg = loadConfig({
      ...ADMIN,
      SESSION_TTL_HOURS: "1",
      LOGIN_MAX_ATTEMPTS: "3",
      LOGIN_WINDOW_MINUTES: "60",
    });
    assert.equal(cfg.sessionTtlHours, 1);
    assert.equal(cfg.loginMaxAttempts, 3);
    assert.equal(cfg.loginWindowMinutes, 60);
  });

  it("names the brand, with a default", () => {
    assert.deepEqual(loadConfig(ADMIN).brand, {
      name: "Theme Previewer",
      icon: "fa-solid fa-swatchbook",
    });
    const named = loadConfig({ ...ADMIN, BRAND_NAME: "Themes", BRAND_ICON: "fa-solid fa-star" });
    assert.deepEqual(named.brand, { name: "Themes", icon: "fa-solid fa-star" });
  });

  it("marks production only when NODE_ENV says so", () => {
    assert.equal(loadConfig(ADMIN).isProduction, false);
    assert.equal(loadConfig({ ...ADMIN, NODE_ENV: "production" }).isProduction, true);
  });
});

describe("screenshot settings", () => {
  it("has sensible defaults", () => {
    const config = loadConfig(ADMIN);
    assert.deepEqual(config.screenshot, {
      enabled: true,
      timeoutMs: 20000,
      width: 1280,
      height: 1024,
      tempTtlMinutes: 60,
    });
  });

  it("reads the settings from the environment", () => {
    const config = loadConfig({
      ...ADMIN,
      SCREENSHOT_ENABLED: "false",
      SCREENSHOT_TIMEOUT_MS: "5000",
      SCREENSHOT_WIDTH: "800",
      SCREENSHOT_HEIGHT: "600",
      SCREENSHOT_TEMP_TTL_MINUTES: "5",
    });
    assert.equal(config.screenshot.enabled, false);
    assert.equal(config.screenshot.timeoutMs, 5000);
    assert.equal(config.screenshot.width, 800);
    assert.equal(config.screenshot.height, 600);
    assert.equal(config.screenshot.tempTtlMinutes, 5);
  });

  it("refuses a timeout that is not a positive whole number", () => {
    assert.throws(
      () => loadConfig({ ...ADMIN, SCREENSHOT_TIMEOUT_MS: "0" }),
      /SCREENSHOT_TIMEOUT_MS/
    );
  });

  it("refuses an on or off setting that is neither", () => {
    assert.throws(() => loadConfig({ ...ADMIN, SCREENSHOT_ENABLED: "maybe" }), /SCREENSHOT_ENABLED/);
  });
});
