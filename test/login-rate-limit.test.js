/**
 * Tests for the limit on failed logins.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import request from "supertest";
import { createLoginRateLimit } from "../middleware/login-rate-limit.js";

function app(limiter, { succeed = false } = {}) {
  const a = express();
  a.post("/login", limiter.middleware, (req, res) => {
    if (succeed) {
      limiter.clear(req);
      return res.status(200).json({ ok: true });
    }
    limiter.recordFailure(req);
    return res.status(401).json({ ok: false });
  });
  return a;
}

describe("createLoginRateLimit", () => {
  it("allows attempts up to the limit", async () => {
    const limiter = createLoginRateLimit({ maxAttempts: 3, windowMinutes: 15 });
    const a = app(limiter);
    for (let i = 0; i < 3; i += 1) {
      await request(a).post("/login").expect(401);
    }
  });

  it("refuses the attempt after the limit", async () => {
    const limiter = createLoginRateLimit({ maxAttempts: 3, windowMinutes: 15 });
    const a = app(limiter);
    for (let i = 0; i < 3; i += 1) {
      await request(a).post("/login").expect(401);
    }
    await request(a).post("/login").expect(429);
  });

  it("frees the address once the window has passed", async () => {
    let clock = 0;
    const limiter = createLoginRateLimit({
      maxAttempts: 2,
      windowMinutes: 15,
      now: () => clock,
    });
    const a = app(limiter);

    await request(a).post("/login").expect(401);
    await request(a).post("/login").expect(401);
    await request(a).post("/login").expect(429);

    clock += 16 * 60 * 1000;
    await request(a).post("/login").expect(401);
  });

  it("forgets the failures once a login succeeds", async () => {
    const limiter = createLoginRateLimit({ maxAttempts: 3, windowMinutes: 15 });
    const failing = app(limiter);
    const succeeding = app(limiter, { succeed: true });

    await request(failing).post("/login").expect(401);
    await request(failing).post("/login").expect(401);
    await request(succeeding).post("/login").expect(200);

    for (let i = 0; i < 3; i += 1) {
      await request(failing).post("/login").expect(401);
    }
  });

  it("says how long to wait", async () => {
    const limiter = createLoginRateLimit({ maxAttempts: 1, windowMinutes: 15 });
    const a = app(limiter);
    await request(a).post("/login").expect(401);
    const res = await request(a).post("/login").expect(429);
    assert.ok(Number(res.headers["retry-after"]) > 0);
  });
});
