/**
 * Tests for the forgery check.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { csrf } from "../middleware/csrf.js";

function app() {
  const a = express();
  a.use(express.urlencoded({ extended: false }));
  a.use(csrf());
  a.get("/form", (req, res) => res.json({ token: res.locals.csrfToken }));
  a.post("/save", (req, res) => res.json({ saved: true }));
  return a;
}

const cookieFrom = (res) =>
  (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("csrf="))?.split(";")[0];

describe("csrf", () => {
  it("gives a visitor a token when they arrive without one", async () => {
    const res = await request(app()).get("/form").expect(200);
    assert.ok(res.body.token);
    assert.ok(cookieFrom(res));
  });

  it("keeps the token a visitor already has", async () => {
    const a = app();
    const first = await request(a).get("/form").expect(200);
    const second = await request(a).get("/form").set("Cookie", cookieFrom(first)).expect(200);
    assert.equal(second.body.token, first.body.token);
    assert.equal(second.headers["set-cookie"], undefined);
  });

  it("keeps the cookie away from scripts", async () => {
    const res = await request(app()).get("/form").expect(200);
    const header = (res.headers["set-cookie"] ?? []).find((c) => c.startsWith("csrf="));
    assert.ok(header.includes("HttpOnly"));
    assert.ok(header.includes("SameSite=Lax"));
  });

  it("refuses a post carrying no token", async () => {
    await request(app()).post("/save").type("form").send({}).expect(403);
  });

  it("refuses a post whose token does not match the cookie", async () => {
    const a = app();
    const first = await request(a).get("/form").expect(200);
    await request(a)
      .post("/save")
      .set("Cookie", cookieFrom(first))
      .type("form")
      .send({ _csrf: "not-the-token" })
      .expect(403);
  });

  it("refuses a post carrying a token but no cookie", async () => {
    const a = app();
    const first = await request(a).get("/form").expect(200);
    await request(a).post("/save").type("form").send({ _csrf: first.body.token }).expect(403);
  });

  it("allows a post carrying the matching token", async () => {
    const a = app();
    const first = await request(a).get("/form").expect(200);
    const res = await request(a)
      .post("/save")
      .set("Cookie", cookieFrom(first))
      .type("form")
      .send({ _csrf: first.body.token })
      .expect(200);
    assert.deepEqual(res.body, { saved: true });
  });
});
