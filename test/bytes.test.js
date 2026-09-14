/**
 * Tests for printing a size
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { humanBytes } from "../shared/bytes.js";

describe("humanBytes", () => {
  it("says whole megabytes", () => {
    assert.equal(humanBytes(5 * 1024 * 1024), "5 MB");
    assert.equal(humanBytes(1024 * 1024), "1 MB");
  });

  it("rounds to the nearest megabyte", () => {
    assert.equal(humanBytes(5.4 * 1024 * 1024), "5 MB");
    assert.equal(humanBytes(5.6 * 1024 * 1024), "6 MB");
  });

  it("drops to kilobytes below a megabyte, rather than saying 1 MB", () => {
    assert.equal(humanBytes(2048), "2 KB");
    assert.equal(humanBytes(500 * 1024), "500 KB");
  });

  it("never says nothing at all for a very small limit", () => {
    assert.equal(humanBytes(10), "1 KB");
  });
});
