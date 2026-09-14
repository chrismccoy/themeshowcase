/**
 * Tests for reading the Cookie header.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseCookies } from "../lib/cookies.js";

describe("parseCookies", () => {
  it("reads one cookie", () => {
    assert.deepEqual(parseCookies("a=1"), { a: "1" });
  });

  it("reads several, ignoring the spacing", () => {
    assert.deepEqual(parseCookies("a=1; b=2;c=3"), { a: "1", b: "2", c: "3" });
  });

  it("keeps a value containing an equals sign whole", () => {
    assert.deepEqual(parseCookies("token=abc=def"), { token: "abc=def" });
  });

  it("decodes an escaped value", () => {
    assert.deepEqual(parseCookies("a=one%20two"), { a: "one two" });
  });

  it("keeps a value that cannot be decoded rather than throwing", () => {
    assert.deepEqual(parseCookies("a=%E0%A4%A"), { a: "%E0%A4%A" });
  });

  it("gives nothing for a missing or empty header", () => {
    assert.deepEqual(parseCookies(undefined), {});
    assert.deepEqual(parseCookies(""), {});
    assert.deepEqual(parseCookies("   "), {});
  });

  it("ignores a fragment with no name", () => {
    assert.deepEqual(parseCookies("=1; b=2"), { b: "2" });
  });
});
