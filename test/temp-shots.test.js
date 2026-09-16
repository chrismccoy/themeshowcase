/**
 * Tests for the temporary capture files.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { createTempShots } from "../lib/temp-shots.js";

let uploadDir;
let shots;

beforeEach(() => {
  uploadDir = fs.mkdtempSync(path.join(tmpdir(), "standalone-shots-"));
  shots = createTempShots({ uploadDir, ttlMinutes: 60 });
});

afterEach(() => {
  fs.rmSync(uploadDir, { recursive: true, force: true });
});

describe("createTempShots", () => {
  it("keeps its files in a tmp directory under the upload directory", () => {
    assert.equal(shots.dir, path.join(uploadDir, "tmp"));
    assert.equal(fs.existsSync(shots.dir), true);
  });

  it("reserves a random png name", () => {
    const name = shots.reserve();
    assert.match(name, /^[0-9a-f]{32}\.png$/);
    assert.notEqual(name, shots.reserve());
  });

  it("refuses a name that is not one of its own", () => {
    assert.equal(shots.isValidName("../../etc/passwd"), false);
    assert.equal(shots.isValidName("shot.png"), false);
    assert.equal(shots.isValidName(""), false);
    assert.equal(shots.isValidName(undefined), false);
    assert.equal(shots.isValidName(shots.reserve()), true);
  });

  it("moves a temporary file into the upload directory", () => {
    const name = shots.reserve();
    fs.writeFileSync(shots.pathOf(name), "picture");

    const kept = shots.promote(name);

    assert.match(kept, /^[0-9a-f]{32}\.png$/);
    assert.equal(fs.readFileSync(path.join(uploadDir, kept), "utf8"), "picture");
    assert.equal(fs.existsSync(shots.pathOf(name)), false);
  });

  it("returns nothing when there is no such temporary file", () => {
    assert.equal(shots.promote(shots.reserve()), null);
    assert.equal(shots.promote("../secret.png"), null);
  });

  it("deletes one temporary file", () => {
    const name = shots.reserve();
    fs.writeFileSync(shots.pathOf(name), "picture");
    shots.remove(name);
    assert.equal(fs.existsSync(shots.pathOf(name)), false);
  });

  it("says nothing when asked to delete a name it never handed out", () => {
    assert.doesNotThrow(() => shots.remove("../../themes.db"));
  });

  it("sweeps away files older than the time to live and keeps fresh ones", () => {
    const old = shots.reserve();
    const fresh = shots.reserve();
    fs.writeFileSync(shots.pathOf(old), "old");
    fs.writeFileSync(shots.pathOf(fresh), "fresh");

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    fs.utimesSync(shots.pathOf(old), twoHoursAgo, twoHoursAgo);

    assert.equal(shots.sweep(), 1);
    assert.equal(fs.existsSync(shots.pathOf(old)), false);
    assert.equal(fs.existsSync(shots.pathOf(fresh)), true);
  });

  it("leaves anything it did not put there alone", () => {
    const stranger = path.join(shots.dir, "notes.txt");
    fs.writeFileSync(stranger, "leave me");

    const old = new Date(Date.now() - 5 * 60 * 60 * 1000);
    fs.utimesSync(stranger, old, old);

    assert.equal(shots.sweep(), 0);
    assert.equal(fs.existsSync(stranger), true);
  });
});
