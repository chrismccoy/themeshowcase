/**
 * Tests for reading an uploaded screenshot.
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import express from "express";
import request from "supertest";
import { csrf } from "../middleware/csrf.js";
import { createUpload } from "../middleware/upload.js";

/** A one pixel PNG. */
const PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c6360000002000100ffff03000006000557bfabd40000000049454e44ae426082",
  "hex"
);

let uploadDir;

before(() => {
  uploadDir = mkdtempSync(path.join(tmpdir(), "standalone-upload-"));
});

after(() => {
  rmSync(uploadDir, { recursive: true, force: true });
});

function app({ maxBytes = 1_000_000 } = {}) {
  const a = express();
  const upload = createUpload({ uploadDir, maxBytes });

  a.use(express.urlencoded({ extended: false }));
  a.use(csrf());

  a.get("/form", (req, res) => res.json({ token: res.locals.csrfToken }));

  a.post("/save", upload.middleware, (req, res) => {
    if (req.uploadError) {
      if (req.file) upload.discard(req.file);
      return res.status(400).json({ error: req.uploadError });
    }
    return res.json({ stored: upload.keep(req.file), type: req.uploadType.mime });
  });

  return a;
}

const cookieFrom = (res) =>
  (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("csrf="))?.split(";")[0];

async function send(a, { filename, contents, field = "image" }) {
  const page = await request(a).get("/form").expect(200);
  return request(a)
    .post("/save")
    .set("Cookie", cookieFrom(page))
    .field("_csrf", page.body.token)
    .attach(field, contents, filename);
}

const filesIn = () => readdirSync(uploadDir);

describe("createUpload", () => {
  it("accepts a picture and stores it under a generated name", async () => {
    const res = await send(app(), { filename: "holiday snap.png", contents: PNG });
    assert.equal(res.status, 200);
    assert.equal(res.body.type, "image/png");
    assert.match(res.body.stored, /^[0-9a-f]{32}\.png$/);
    assert.ok(filesIn().includes(res.body.stored));
  });

  it("keeps nothing the uploader chose in the stored name", async () => {
    const res = await send(app(), { filename: "../../escape.png", contents: PNG });
    assert.equal(res.status, 200);
    assert.ok(!res.body.stored.includes("escape"));
    assert.ok(!res.body.stored.includes(".."));
  });

  it("refuses bytes that are not the picture they claim to be", async () => {
    const before = filesIn().length;
    const res = await send(app(), {
      filename: "trojan.png",
      contents: Buffer.from("#!/bin/sh\nrm -rf /\n"),
    });
    assert.equal(res.status, 400);
    assert.equal(filesIn().length, before, "the refused upload must not be left on disk");
  });

  it("refuses an SVG", async () => {
    const before = filesIn().length;
    const res = await send(app(), {
      filename: "logo.svg",
      contents: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    });
    assert.equal(res.status, 400);
    assert.equal(filesIn().length, before);
  });

  it("refuses to be built without a size limit", () => {
    assert.throws(() => createUpload({ uploadDir }), /maxBytes/);
    assert.throws(() => createUpload({ uploadDir, maxBytes: 0 }), /maxBytes/);
  });

  it("refuses a file over the size limit", async () => {
    const before = filesIn().length;
    const big = Buffer.concat([PNG, Buffer.alloc(2000)]);
    const res = await send(app({ maxBytes: 500 }), { filename: "big.png", contents: big });
    assert.equal(res.status, 400);
    assert.equal(filesIn().length, before);
  });

  it("refuses a request with no forgery token, after parsing it", async () => {
    const before = filesIn().length;
    const res = await request(app()).post("/save").attach("image", PNG, "a.png");
    assert.equal(res.status, 403);
    assert.equal(filesIn().length, before, "a refused request must leave nothing behind");
  });

  it("refuses a request whose token does not match the cookie", async () => {
    const a = app();
    const page = await request(a).get("/form").expect(200);
    const res = await request(a)
      .post("/save")
      .set("Cookie", cookieFrom(page))
      .field("_csrf", "not-the-token")
      .attach("image", PNG, "a.png");
    assert.equal(res.status, 403);
  });

  it("reports a missing file rather than throwing", async () => {
    const a = app();
    const page = await request(a).get("/form").expect(200);
    const res = await request(a)
      .post("/save")
      .set("Cookie", cookieFrom(page))
      .field("_csrf", page.body.token);
    assert.equal(res.status, 400);
  });

  it("discards a temporary file on request", async () => {
    const upload = createUpload({ uploadDir, maxBytes: 1000 });
    const temp = path.join(uploadDir, "temp-to-discard");
    writeFileSync(temp, PNG);
    upload.discard({ path: temp });
    assert.ok(!filesIn().includes("temp-to-discard"));
  });
});
