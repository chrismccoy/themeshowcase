/**
 * Tests for .env loading.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnvFileIfPresent } from "../config/index.js";

let dir;
const KEYS = ["TS_TEST_A", "TS_TEST_B"];

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), "standalone-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const key of KEYS) delete process.env[key];
});

describe("loadEnvFileIfPresent", () => {
  it("puts values from the file into the environment", () => {
    writeFileSync(path.join(dir, ".env"), "TS_TEST_A=from_file\n");
    loadEnvFileIfPresent(dir);
    assert.equal(process.env.TS_TEST_A, "from_file");
  });

  it("reports that it loaded a file", () => {
    writeFileSync(path.join(dir, ".env"), "TS_TEST_A=from_file\n");
    assert.equal(loadEnvFileIfPresent(dir), true);
  });

  it("lets a real environment variable win over the file", () => {
    process.env.TS_TEST_A = "from_shell";
    writeFileSync(path.join(dir, ".env"), "TS_TEST_A=from_file\nTS_TEST_B=from_file\n");
    loadEnvFileIfPresent(dir);
    assert.equal(process.env.TS_TEST_A, "from_shell");
    assert.equal(process.env.TS_TEST_B, "from_file");
  });

  it("does nothing when there is no .env file", () => {
    assert.equal(loadEnvFileIfPresent(dir), false);
    assert.equal(process.env.TS_TEST_A, undefined);
  });
});
