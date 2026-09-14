/**
 * Tests for naming a file's format
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { imageTypeOf } from "../lib/image-type.js";

const starting = (...bytes) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(64)]);

const PNG = starting(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const JPEG = starting(0xff, 0xd8, 0xff, 0xe0);
const GIF87 = Buffer.concat([Buffer.from("GIF87a"), Buffer.alloc(64)]);
const GIF89 = Buffer.concat([Buffer.from("GIF89a"), Buffer.alloc(64)]);

const WEBP = Buffer.concat([
  Buffer.from("RIFF"),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from("WEBP"),
  Buffer.alloc(64),
]);

const AVIF = Buffer.concat([
  Buffer.from([0, 0, 0, 0x20]),
  Buffer.from("ftyp"),
  Buffer.from("avif"),
  Buffer.alloc(64),
]);

describe("imageTypeOf", () => {
  it("names a PNG", () => {
    assert.deepEqual(imageTypeOf(PNG), { mime: "image/png", extension: "png" });
  });

  it("names a JPEG", () => {
    assert.deepEqual(imageTypeOf(JPEG), { mime: "image/jpeg", extension: "jpg" });
  });

  it("names a GIF, both vintages", () => {
    assert.deepEqual(imageTypeOf(GIF87), { mime: "image/gif", extension: "gif" });
    assert.deepEqual(imageTypeOf(GIF89), { mime: "image/gif", extension: "gif" });
  });

  it("names a WebP", () => {
    assert.deepEqual(imageTypeOf(WEBP), { mime: "image/webp", extension: "webp" });
  });

  it("names an AVIF", () => {
    assert.deepEqual(imageTypeOf(AVIF), { mime: "image/avif", extension: "avif" });
  });

  it("refuses an SVG, whatever it calls itself", () => {
    assert.equal(imageTypeOf(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), null);
  });

  it("refuses a program dressed up as a picture", () => {
    assert.equal(imageTypeOf(starting(0x4d, 0x5a)), null);
    assert.equal(imageTypeOf(starting(0x7f, 0x45, 0x4c, 0x46)), null);
    assert.equal(imageTypeOf(Buffer.from("#!/bin/sh\nrm -rf /\n")), null);
  });

  it("refuses RIFF that is not WebP, such as a sound file", () => {
    const wav = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WAVE"),
      Buffer.alloc(64),
    ]);
    assert.equal(imageTypeOf(wav), null);
  });

  it("refuses something too short to tell, rather than guessing", () => {
    assert.equal(imageTypeOf(Buffer.from([0x89, 0x50])), null);
    assert.equal(imageTypeOf(Buffer.alloc(0)), null);
  });

  it("refuses anything that is not a buffer", () => {
    for (const bad of [null, undefined, "PNG", 42, {}]) {
      assert.equal(imageTypeOf(bad), null);
    }
  });
});
