/**
 * Tests for hashing and checking the admin password.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { hashPassword, verifyPassword, safeEqual } from "../lib/password.js";

describe("hashPassword", () => {
  it("produces a scrypt hash with a salt and a key", () => {
    const hash = hashPassword("correct horse");
    const parts = hash.split("$");
    assert.equal(parts.length, 3);
    assert.equal(parts[0], "scrypt");
    assert.ok(Buffer.from(parts[1], "base64").length >= 16);
    assert.ok(Buffer.from(parts[2], "base64").length >= 32);
  });

  it("salts randomly, so the same password hashes differently each time", () => {
    assert.notEqual(hashPassword("correct horse"), hashPassword("correct horse"));
  });
});

describe("verifyPassword", () => {
  it("accepts the password it was made from", () => {
    assert.equal(verifyPassword("correct horse", hashPassword("correct horse")), true);
  });

  it("refuses a different password", () => {
    assert.equal(verifyPassword("wrong horse", hashPassword("correct horse")), false);
  });

  it("refuses an empty password", () => {
    assert.equal(verifyPassword("", hashPassword("correct horse")), false);
  });

  it("refuses a hash of the wrong shape rather than throwing", () => {
    for (const bad of ["", "nonsense", "scrypt$only-two", "bcrypt$a$b", "scrypt$$", null, undefined]) {
      assert.equal(verifyPassword("correct horse", bad), false);
    }
  });

  it("refuses a hash whose key is the wrong length", () => {
    assert.equal(verifyPassword("correct horse", "scrypt$c2FsdA==$c2hvcnQ="), false);
  });
});

describe("safeEqual", () => {
  it("matches identical strings", () => {
    assert.equal(safeEqual("abc", "abc"), true);
  });

  it("refuses different strings", () => {
    assert.equal(safeEqual("abc", "abd"), false);
  });

  it("refuses strings of different lengths without throwing", () => {
    assert.equal(safeEqual("abc", "abcdef"), false);
    assert.equal(safeEqual("", "a"), false);
  });

  it("treats missing values as non-matching", () => {
    assert.equal(safeEqual(undefined, "a"), false);
    assert.equal(safeEqual(undefined, undefined), true);
  });
});
