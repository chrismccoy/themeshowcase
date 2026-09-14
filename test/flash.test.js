/**
 * Tests for the printed messages
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createFlash } from "../lib/flash.js";

const flash = createFlash("a-secret");

const asRequest = (setCookie) => setCookie.split(";")[0];

describe("createFlash", () => {
  it("carries a message there and back", () => {
    const header = asRequest(flash.setCookieHeader("Theme saved."));
    assert.deepEqual(flash.read(header), { kind: "ok", message: "Theme saved." });
  });

  it("carries the kind, so a refusal does not read as a success", () => {
    const header = asRequest(flash.setCookieHeader("Still holds 3 themes.", "warn"));
    assert.deepEqual(flash.read(header), { kind: "warn", message: "Still holds 3 themes." });
  });

  it("refuses a kind someone rewrote", () => {
    const header = asRequest(flash.setCookieHeader("Deleted.", "warn"));
    assert.equal(flash.read(header.replace("warn", "okay")), null);
  });

  it("carries a message with punctuation and spaces intact", () => {
    const message = 'Deleted "Aurora" — 2 themes remain; 1 category is empty.';
    assert.equal(flash.read(asRequest(flash.setCookieHeader(message))).message, message);
  });

  it("refuses a message someone rewrote", () => {
    const header = asRequest(flash.setCookieHeader("Theme saved."));
    const tampered = header.replace("Theme", "Wiped");
    assert.equal(flash.read(tampered), null);
  });

  it("refuses a message signed with another secret", () => {
    const theirs = createFlash("another-secret");
    const header = asRequest(theirs.setCookieHeader("Trust me."));
    assert.equal(flash.read(header), null);
  });

  it("refuses a message with no signature at all", () => {
    assert.equal(flash.read("flash=Just%20text"), null);
  });

  it("gives nothing when there is no cookie", () => {
    assert.equal(flash.read(""), null);
    assert.equal(flash.read(undefined), null);
    assert.equal(flash.read("other=1"), null);
  });

  it("keeps the cookie away from scripts and to this site", () => {
    const header = flash.setCookieHeader("Saved.");
    assert.ok(header.startsWith("flash="));
    assert.ok(header.includes("HttpOnly"));
    assert.ok(header.includes("SameSite=Lax"));
    assert.ok(header.includes("Path=/"));
  });

  it("clears the cookie by expiring it", () => {
    const header = flash.clearCookieHeader();
    assert.ok(header.startsWith("flash=;"));
    assert.ok(header.includes("Max-Age=0"));
  });
});
